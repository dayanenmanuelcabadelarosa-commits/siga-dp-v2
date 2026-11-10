/*
  productos.js (rutas) — Productos y catálogo (M07, Fase 4).
  ---------------------------------------------------------

    GET   /api/productos                         productos, categorías y estaciones
    POST  /api/productos                         crear un producto
    PATCH /api/productos/:id                     editar nombre, precio, categoría o estación
    PATCH /api/productos/:id/disponibilidad      marcar disponible o agotado
    POST  /api/productos/:id/baja                sacarlo del catálogo (no se borra)
    POST  /api/productos/:id/reactivar           devolverlo al catálogo

    POST  /api/productos/categorias              crear una categoría
    PATCH /api/productos/categorias/:id          renombrar o activar/desactivar
    POST  /api/productos/estaciones              crear una estación
    PATCH /api/productos/estaciones/:id          renombrar una estación

  Todo exige el permiso ADMINISTRAR_PRODUCTOS. Igual que en Personal, la base es
  la que manda: el nombre repetido lo rechaza la restricción única y aquí se
  traduce a un mensaje que se entiende. Además se revisa antes para avisar con
  claridad cuando solo cambian mayúsculas y minúsculas.

  Dos reglas que no son obvias:

    1. Un producto no se borra nunca (RN-16). La baja es `activo = false`, para
       conservar el historial de ventas. La reactivación lo devuelve al catálogo.
    2. Una categoría no se puede desactivar mientras tenga productos activos.
       Si se permitiera, quedarían productos a la venta en una categoría que ya
       no se ofrece. La comprobación y el cambio van en la misma transacción, y
       la fila de la categoría se bloquea para que dos peticiones no se crucen.

  La disponibilidad es del día (`disponible`) y es distinta de estar en el
  catálogo (`activo`). Un producto inactivo conserva su disponibilidad para
  cuando se reactive; por eso la baja no la toca.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaCambiarDisponibilidad,
  esquemaCrearCategoria,
  esquemaCrearEstacion,
  esquemaCrearProducto,
  esquemaEditarCategoria,
  esquemaEditarEstacion,
  esquemaEditarProducto,
} from "../validaciones/productos.js";
import { validar } from "../validaciones/validar.js";

const CAMPOS_DEL_PRODUCTO = `
  p.id_producto,
  p.nombre,
  p.id_categoria,
  c.nombre  AS categoria,
  c.activo  AS categoria_activa,
  p.id_estacion,
  e.nombre  AS estacion,
  p.precio,
  p.disponible,
  p.riesgo_agotarse,
  p.activo,
  p.tiempo_estimado_minutos,
  p.creado_en,
  p.modificado_en
`;

const DESDE_EL_PRODUCTO = `
  FROM producto p
  JOIN categoria c ON c.id_categoria = p.id_categoria
  JOIN estacion e  ON e.id_estacion  = p.id_estacion
`;

/** Lee una fila completa del producto. */
async function buscarProducto(consultarUno, id, { bloquear = false } = {}) {
  return consultarUno(
    `SELECT ${CAMPOS_DEL_PRODUCTO}
       ${DESDE_EL_PRODUCTO}
      WHERE p.id_producto = $1
      ${bloquear ? "FOR UPDATE OF p" : ""}`,
    [id],
  );
}

/** El id de la dirección, revisado antes de tocar la base. */
function idDeLaRuta(req, que) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      `El identificador de ${que} no es válido.`,
    );
  }

  return id;
}

/** La categoría existe y, salvo que se permita, está activa. */
async function revisarCategoria(
  consultarUno,
  idCategoria,
  { permitirInactiva = false } = {},
) {
  const categoria = await consultarUno(
    `SELECT id_categoria, nombre, activo
       FROM categoria
      WHERE id_categoria = $1
      FOR SHARE`,
    [idCategoria],
  );

  if (!categoria) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Esa categoría no existe.");
  }

  if (!categoria.activo && !permitirInactiva) {
    throw new ErrorDeApi(
      409,
      "CATEGORIA_INACTIVA",
      `La categoría "${categoria.nombre}" está inactiva. Elige una activa.`,
    );
  }

  return categoria;
}

/** La estación existe. Las estaciones no tienen estado activo/inactivo. */
async function revisarEstacion(consultarUno, idEstacion) {
  const estacion = await consultarUno(
    `SELECT id_estacion, nombre
       FROM estacion
      WHERE id_estacion = $1
      FOR SHARE`,
    [idEstacion],
  );

  if (!estacion) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Esa estación no existe.");
  }

  return estacion;
}

/*
  El aviso de nombre repetido se da antes de insertar para que el mensaje sea
  claro también cuando solo cambia una mayúscula. La restricción única de la base
  sigue siendo la que decide en una carrera; su error se traduce abajo.
*/
async function revisarNombreDeProductoDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetido = await consultarUno(
    `SELECT id_producto
       FROM producto
      WHERE fn_nombre_normalizado(nombre) = fn_nombre_normalizado($1)
        AND ($2::int IS NULL OR id_producto <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetido) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un producto con ese nombre.",
    );
  }
}

async function revisarNombreDeCategoriaDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetido = await consultarUno(
    `SELECT id_categoria
       FROM categoria
      WHERE fn_nombre_normalizado(nombre) = fn_nombre_normalizado($1)
        AND ($2::int IS NULL OR id_categoria <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetido) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una categoría con ese nombre.",
    );
  }
}

async function revisarNombreDeEstacionDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetido = await consultarUno(
    `SELECT id_estacion
       FROM estacion
      WHERE fn_nombre_normalizado(nombre) = fn_nombre_normalizado($1)
        AND ($2::int IS NULL OR id_estacion <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetido) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una estación con ese nombre.",
    );
  }
}

/** Traduce una violación de unicidad de PostgreSQL a un mensaje para la persona. */
function conflictoDeUnicidad(error) {
  if (error?.code !== "23505") return null;

  if (
    error.constraint === "uq_producto_nombre" ||
    error.constraint === "uq_producto_nombre_normalizado"
  ) {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un producto con ese nombre.",
    );
  }

  if (
    error.constraint === "uq_categoria_nombre" ||
    error.constraint === "uq_categoria_nombre_normalizado"
  ) {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una categoría con ese nombre.",
    );
  }

  if (
    error.constraint === "uq_estacion_nombre" ||
    error.constraint === "uq_estacion_nombre_normalizado"
  ) {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una estación con ese nombre.",
    );
  }

  return null;
}

/** Otras restricciones que la base puede rechazar y conviene explicar. */
function conflictoDeLlaveForanea(error) {
  if (error?.code !== "23503") return null;

  if (error.constraint === "producto_id_categoria_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Esa categoría ya no existe. Actualiza la lista.",
    );
  }

  if (error.constraint === "producto_id_estacion_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Esa estación ya no existe. Actualiza la lista.",
    );
  }

  return null;
}

function conflictoDePrecio(error) {
  if (error?.code === "23514" && error.constraint === "ck_producto_precio") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El precio debe ser mayor que cero.",
    );
  }

  return null;
}

/** Lanza el error de base traducido, si se reconoce. */
function traducirErrorDeBase(error) {
  const traducido =
    conflictoDeUnicidad(error) ??
    conflictoDeLlaveForanea(error) ??
    conflictoDePrecio(error);

  if (traducido) throw traducido;
  throw error;
}

export function rutasDeProductos() {
  const rutas = express.Router();

  rutas.use(requiereSesion);

  /* ------------------------------------------ disponibilidad para pedir */
  /*
    El mesero no administra el catálogo, pero sí necesita saber qué se puede
    pedir. `VER_DISPONIBILIDAD` es exactamente esa operación en la matriz
    aprobada (dueño, gerente, capitán, mesero, anfitrión, cocina y cajero).
    Solo devuelve productos activos y disponibles; los agotados y los que están
    fuera del catálogo no se ofrecen.
  */
  rutas.get(
    "/disponibles",
    requierePermiso("VER_DISPONIBILIDAD"),
    asyncHandler(async (_req, res) => {
      const productos = await consultar(
        `SELECT ${CAMPOS_DEL_PRODUCTO}
           ${DESDE_EL_PRODUCTO}
          WHERE p.activo AND p.disponible
          ORDER BY c.nombre, p.nombre`,
      );

      exito(res, { productos });
    }),
  );

  /*
    Todo lo demás es administración del catálogo. Se aplica después de la ruta
    de disponibilidad para que el mesero pueda consultar sin recibir el 403.
  */
  rutas.use(requierePermiso("ADMINISTRAR_PRODUCTOS"));

  /* ------------------------------------------------------------- la lista */

  rutas.get(
    "/",
    asyncHandler(async (_req, res) => {
      /*
        Los inactivos también se devuelven: la pantalla de administración tiene
        que poder mostrarlos para reactivarlos o corregir su categoría. El orden
        deja primero lo que está a la venta.
      */
      const productos = await consultar(
        `SELECT ${CAMPOS_DEL_PRODUCTO}
           ${DESDE_EL_PRODUCTO}
          ORDER BY p.activo DESC, c.nombre, p.nombre`,
      );

      const categorias = await consultar(
        `SELECT id_categoria, nombre, activo
           FROM categoria
          ORDER BY activo DESC, nombre`,
      );

      const estaciones = await consultar(
        `SELECT id_estacion, nombre
           FROM estacion
          ORDER BY nombre`,
      );

      exito(res, { productos, categorias, estaciones });
    }),
  );

  /* -------------------------------------------------------------- crear */

  rutas.post(
    "/",
    validar(esquemaCrearProducto),
    asyncHandler(async (req, res) => {
      const {
        nombre,
        precio,
        id_categoria,
        id_estacion,
        tiempo_estimado_minutos,
      } = req.datos;

      let creado;

      try {
        creado = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarCategoria(consultarUno, id_categoria);
            await revisarEstacion(consultarUno, id_estacion);
            await revisarNombreDeProductoDisponible(consultarUno, nombre);

            const fila = await consultarUno(
              `INSERT INTO producto (nombre, precio, id_categoria, id_estacion, tiempo_estimado_minutos)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id_producto`,
              [
                nombre,
                precio,
                id_categoria,
                id_estacion,
                tiempo_estimado_minutos ?? null,
              ],
            );

            return buscarProducto(consultarUno, fila.id_producto);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, creado, 201);
    }),
  );

  /* -------------------------------------------------------------- editar */

  rutas.patch(
    "/:id",
    validar(esquemaEditarProducto),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "producto");
      const cambios = req.datos;

      let actualizado;

      try {
        actualizado = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarProducto(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Ese producto no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;
            const precioFinal = cambios.precio ?? actual.precio;
            const idCategoriaFinal =
              cambios.id_categoria ?? actual.id_categoria;
            const idEstacionFinal = cambios.id_estacion ?? actual.id_estacion;
            const tiempoFinal =
              cambios.tiempo_estimado_minutos === undefined
                ? actual.tiempo_estimado_minutos
                : cambios.tiempo_estimado_minutos;

            /*
              Se permite conservar una categoría inactiva (por ejemplo, para
              editar un producto inactivo), pero no mover un producto a una
              categoría inactiva. Para reactivarlo habrá que elegir una activa.
            */
            await revisarCategoria(consultarUno, idCategoriaFinal, {
              permitirInactiva: idCategoriaFinal === actual.id_categoria,
            });
            await revisarEstacion(consultarUno, idEstacionFinal);

            if (cambios.nombre !== undefined) {
              await revisarNombreDeProductoDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            await consultarUno(
              `UPDATE producto
                  SET nombre = $1,
                      precio = $2,
                      id_categoria = $3,
                      id_estacion = $4,
                      tiempo_estimado_minutos = $5
                WHERE id_producto = $6
                RETURNING id_producto`,
              [
                nombreFinal,
                precioFinal,
                idCategoriaFinal,
                idEstacionFinal,
                tiempoFinal,
                id,
              ],
            );

            return buscarProducto(consultarUno, id);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizado);
    }),
  );

  /* -------------------------------------------------------- disponibilidad */

  rutas.patch(
    "/:id/disponibilidad",
    validar(esquemaCambiarDisponibilidad),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "producto");
      const { disponible } = req.datos;

      let actualizado;

      try {
        actualizado = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarProducto(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Ese producto no existe.",
              );
            }

            if (!actual.activo) {
              throw new ErrorDeApi(
                409,
                "PRODUCTO_INACTIVO",
                "Ese producto está fuera del catálogo. Reactívalo antes de cambiar su disponibilidad.",
              );
            }

            await consultarUno(
              `UPDATE producto
                  SET disponible = $1
                WHERE id_producto = $2
                RETURNING id_producto`,
              [disponible, id],
            );

            return buscarProducto(consultarUno, id);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizado);
    }),
  );

  /* ------------------------------------------------------- baja y reactivar */

  rutas.post(
    "/:id/baja",
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "producto");

      const actualizado = await conTransaccion(
        async ({ consultarUno }) => {
          const actual = await buscarProducto(consultarUno, id, {
            bloquear: true,
          });

          if (!actual) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Ese producto no existe.",
            );
          }

          if (!actual.activo) {
            throw new ErrorDeApi(
              409,
              "PRODUCTO_YA_INACTIVO",
              "Ese producto ya está fuera del catálogo.",
            );
          }

          /*
            La baja no toca `disponible`: si el producto estaba agotado, sigue
            agotado cuando se reactive. Son dos estados distintos.
          */
          await consultarUno(
            `UPDATE producto
                SET activo = false
              WHERE id_producto = $1
              RETURNING id_producto`,
            [id],
          );

          return buscarProducto(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, actualizado);
    }),
  );

  rutas.post(
    "/:id/reactivar",
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "producto");

      const actualizado = await conTransaccion(
        async ({ consultarUno }) => {
          const actual = await buscarProducto(consultarUno, id, {
            bloquear: true,
          });

          if (!actual) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Ese producto no existe.",
            );
          }

          if (actual.activo) {
            throw new ErrorDeApi(
              409,
              "PRODUCTO_YA_ACTIVO",
              "Ese producto ya está en el catálogo.",
            );
          }

          /*
            No se puede devolver al catálogo un producto cuya categoría está
            inactiva: quedaría a la venta en una categoría que no se ofrece. Se
            bloquea la categoría para que no se desactive justo en este momento.
          */
          const categoria = await consultarUno(
            `SELECT id_categoria, nombre, activo
               FROM categoria
              WHERE id_categoria = $1
              FOR SHARE`,
            [actual.id_categoria],
          );

          if (!categoria || !categoria.activo) {
            throw new ErrorDeApi(
              409,
              "CATEGORIA_INACTIVA",
              "La categoría de este producto está inactiva. Cámbiala antes de reactivarlo.",
            );
          }

          await consultarUno(
            `UPDATE producto
                SET activo = true
              WHERE id_producto = $1
              RETURNING id_producto`,
            [id],
          );

          return buscarProducto(consultarUno, id);
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, actualizado);
    }),
  );

  /* ------------------------------------------------------------ categorías */

  rutas.post(
    "/categorias",
    validar(esquemaCrearCategoria),
    asyncHandler(async (req, res) => {
      const { nombre } = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarNombreDeCategoriaDisponible(consultarUno, nombre);

            return consultarUno(
              `INSERT INTO categoria (nombre)
               VALUES ($1)
               RETURNING id_categoria, nombre, activo`,
              [nombre],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, creada, 201);
    }),
  );

  rutas.patch(
    "/categorias/:id",
    validar(esquemaEditarCategoria),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "categoría");
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            /*
              FOR UPDATE serializa esta operación con la creación o edición de
              productos, que bloquean la categoría con FOR SHARE. Así no puede
              colarse un producto activo entre la comprobación y la desactivación.
            */
            const actual = await consultarUno(
              `SELECT id_categoria, nombre, activo
                 FROM categoria
                WHERE id_categoria = $1
                FOR UPDATE`,
              [id],
            );

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa categoría no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;
            const activoFinal = cambios.activo ?? actual.activo;

            if (cambios.nombre !== undefined) {
              await revisarNombreDeCategoriaDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            if (activoFinal === false && actual.activo) {
              const activo = await consultarUno(
                `SELECT 1
                   FROM producto
                  WHERE id_categoria = $1
                    AND activo
                  LIMIT 1`,
                [id],
              );

              if (activo) {
                throw new ErrorDeApi(
                  409,
                  "CATEGORIA_CON_PRODUCTOS_ACTIVOS",
                  "No puedes desactivar una categoría que todavía tiene productos activos. Da de baja esos productos o cámbialos de categoría.",
                );
              }
            }

            return consultarUno(
              `UPDATE categoria
                  SET nombre = $1,
                      activo = $2
                WHERE id_categoria = $3
                RETURNING id_categoria, nombre, activo`,
              [nombreFinal, activoFinal, id],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizada);
    }),
  );

  /* ------------------------------------------------------------ estaciones */

  rutas.post(
    "/estaciones",
    validar(esquemaCrearEstacion),
    asyncHandler(async (req, res) => {
      const { nombre } = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarNombreDeEstacionDisponible(consultarUno, nombre);

            return consultarUno(
              `INSERT INTO estacion (nombre)
               VALUES ($1)
               RETURNING id_estacion, nombre`,
              [nombre],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, creada, 201);
    }),
  );

  rutas.patch(
    "/estaciones/:id",
    validar(esquemaEditarEstacion),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "estación");
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await consultarUno(
              `SELECT id_estacion, nombre
                 FROM estacion
                WHERE id_estacion = $1
                FOR UPDATE`,
              [id],
            );

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa estación no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;

            if (cambios.nombre !== undefined) {
              await revisarNombreDeEstacionDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            return consultarUno(
              `UPDATE estacion
                  SET nombre = $1
                WHERE id_estacion = $2
                RETURNING id_estacion, nombre`,
              [nombreFinal, id],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizada);
    }),
  );

  return rutas;
}
