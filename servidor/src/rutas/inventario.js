/*
  inventario.js (rutas) — Inventario (M08, Fase 4).
  -------------------------------------------------

    GET   /api/inventario                       insumos, puntos, unidades y existencias
    GET   /api/inventario/movimientos           historial, con filtro por insumo
    GET   /api/inventario/proveedores           proveedores, activos e inactivos

    POST  /api/inventario/insumos               crear un insumo
    PATCH /api/inventario/insumos/:id           editar nombre, unidad, mínimo o estado
    POST  /api/inventario/proveedores           crear un proveedor
    PATCH /api/inventario/proveedores/:id       editar nombre, teléfono o estado

    POST  /api/inventario/movimientos           entrada, salida o ajuste por conteo

  Permisos, cada uno con su operación de la matriz:

    VER_EXISTENCIAS       ver las existencias y el historial
    MOVER_INVENTARIO      registrar movimientos y leer los proveedores
    ADMINISTRAR_INSUMOS   crear y editar insumos y proveedores

  La cocina solo tiene VER_EXISTENCIAS: puede consultar, no mover ni
  administrar. El almacén, el gerente y el dueño tienen las tres.

  Reglas que se cuidan aquí:

    1. La existencia nunca queda negativa (RN-13). Se comprueba antes de insertar
       para dar un mensaje claro, y el disparador de la base vuelve a comprobarlo
       con la fila bloqueada. Dos salidas simultáneas no pueden dejar un saldo
       negativo.
    2. El ajuste guarda la diferencia, no el conteo final (RN-14). La migración
       013 permite que esa diferencia sea negativa.
    3. Un movimiento no se edita ni se borra: el disparador de la base lo impide
       y aquí no hay rutas para hacerlo.
    4. Ni los insumos ni los proveedores se borran. Un proveedor se desactiva
       (RN-16); un insumo también conserva su historial con `activo = false`.
    5. Cambiar la unidad de un insumo que ya tiene movimientos reinterpretaría
       el pasado (5 lb no son 5 kg). Se rechaza con un mensaje claro.

  El empleado que registra el movimiento sale de la sesión, no del cuerpo de la
  petición: nadie puede atribuir una salida a otra persona.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaConsultaMovimientos,
  esquemaCrearInsumo,
  esquemaCrearProveedor,
  esquemaEditarInsumo,
  esquemaEditarProveedor,
  esquemaMovimiento,
} from "../validaciones/inventario.js";
import { validar } from "../validaciones/validar.js";

const CAMPOS_DEL_INSUMO = `
  i.id_insumo,
  i.nombre,
  i.id_unidad,
  u.nombre AS unidad,
  u.abreviatura,
  i.minimo,
  i.activo,
  COALESCE((
    SELECT SUM(e.existencia)
      FROM existencia e
     WHERE e.id_insumo = i.id_insumo
  ), 0) AS existencia_total
`;

const DESDE_EL_INSUMO = `
  FROM insumo i
  JOIN unidad_medida u ON u.id_unidad = i.id_unidad
`;

const CAMPOS_DEL_MOVIMIENTO = `
  m.id_movimiento,
  m.tipo,
  m.id_insumo,
  i.nombre AS insumo,
  u.abreviatura,
  m.id_punto,
  p.nombre AS punto,
  m.cantidad,
  m.detalle,
  m.id_proveedor,
  pr.nombre AS proveedor,
  m.id_empleado,
  e.nombre AS empleado,
  m.ocurrido_en
`;

const DESDE_EL_MOVIMIENTO = `
  FROM movimiento_inventario m
  JOIN insumo i       ON i.id_insumo   = m.id_insumo
  JOIN unidad_medida u ON u.id_unidad  = i.id_unidad
  JOIN punto_acceso p ON p.id_punto    = m.id_punto
  LEFT JOIN proveedor pr ON pr.id_proveedor = m.id_proveedor
  LEFT JOIN empleado e   ON e.id_empleado   = m.id_empleado
`;

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

/** Las cantidades se manejan en centésimas para no arrastrar errores de coma. */
function aCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

/** "1250" → "12.5", para el detalle que se escribe solo en un ajuste. */
function cantidadLegible(centavos) {
  return (centavos / 100).toLocaleString("es-DO", {
    maximumFractionDigits: 2,
  });
}

async function buscarInsumo(consultarUno, id, { bloquear = false } = {}) {
  return consultarUno(
    `SELECT ${CAMPOS_DEL_INSUMO}
       ${DESDE_EL_INSUMO}
      WHERE i.id_insumo = $1
      ${bloquear ? "FOR UPDATE OF i" : ""}`,
    [id],
  );
}

async function buscarMovimiento(consultarUno, id) {
  return consultarUno(
    `SELECT ${CAMPOS_DEL_MOVIMIENTO}
       ${DESDE_EL_MOVIMIENTO}
      WHERE m.id_movimiento = $1`,
    [id],
  );
}

async function buscarProveedor(consultarUno, id) {
  return consultarUno(
    `SELECT p.id_proveedor,
            p.nombre,
            p.telefono,
            p.estado,
            count(m.id_movimiento)::int AS compras
       FROM proveedor p
       LEFT JOIN movimiento_inventario m
         ON m.id_proveedor = p.id_proveedor
        AND m.tipo = 'Entrada de compra'
      WHERE p.id_proveedor = $1
      GROUP BY p.id_proveedor`,
    [id],
  );
}

async function revisarUnidad(consultarUno, idUnidad) {
  const unidad = await consultarUno(
    `SELECT id_unidad, nombre, abreviatura
       FROM unidad_medida
      WHERE id_unidad = $1
      FOR SHARE`,
    [idUnidad],
  );

  if (!unidad) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Esa unidad de medida no existe.",
    );
  }

  return unidad;
}

async function revisarPunto(consultarUno, idPunto) {
  const punto = await consultarUno(
    `SELECT id_punto, nombre, es_almacen
       FROM punto_acceso
      WHERE id_punto = $1
      FOR SHARE`,
    [idPunto],
  );

  if (!punto) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Ese punto de acceso no existe.",
    );
  }

  return punto;
}

async function revisarInsumoParaMover(consultarUno, idInsumo) {
  const insumo = await consultarUno(
    `SELECT id_insumo, nombre, activo
       FROM insumo
      WHERE id_insumo = $1
      FOR SHARE`,
    [idInsumo],
  );

  if (!insumo) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Ese insumo no existe.");
  }

  if (!insumo.activo) {
    throw new ErrorDeApi(
      409,
      "INSUMO_INACTIVO",
      `El insumo "${insumo.nombre}" está inactivo. Actívalo antes de moverlo.`,
    );
  }

  return insumo;
}

async function revisarProveedorActivo(consultarUno, idProveedor) {
  const proveedor = await consultarUno(
    `SELECT id_proveedor, nombre, estado
       FROM proveedor
      WHERE id_proveedor = $1
      FOR SHARE`,
    [idProveedor],
  );

  if (!proveedor) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Ese proveedor no existe.");
  }

  if (proveedor.estado !== "Activo") {
    throw new ErrorDeApi(
      409,
      "PROVEEDOR_INACTIVO",
      `El proveedor "${proveedor.nombre}" está inactivo. Elige uno activo.`,
    );
  }

  return proveedor;
}

async function revisarNombreDeInsumoDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetido = await consultarUno(
    `SELECT id_insumo
       FROM insumo
      WHERE nombre = $1
        AND ($2::int IS NULL OR id_insumo <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetido) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un insumo con ese nombre.",
    );
  }
}

async function revisarNombreDeProveedorDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetido = await consultarUno(
    `SELECT id_proveedor
       FROM proveedor
      WHERE nombre = $1
        AND ($2::int IS NULL OR id_proveedor <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetido) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un proveedor con ese nombre.",
    );
  }
}

/**
 * La unidad no se puede cambiar si el insumo ya tiene movimientos. Si no los
 * tiene, corregirla es seguro (por ejemplo, si se creó con la unidad equivocada).
 */
async function revisarUnidadCambiable(consultarUno, idInsumo) {
  const movimiento = await consultarUno(
    `SELECT id_movimiento
       FROM movimiento_inventario
      WHERE id_insumo = $1
      LIMIT 1`,
    [idInsumo],
  );

  if (movimiento) {
    throw new ErrorDeApi(
      409,
      "UNIDAD_CON_MOVIMIENTOS",
      "Ese insumo ya tiene movimientos. La unidad no se puede cambiar porque las cantidades anteriores quedarían con otro significado.",
    );
  }
}

/** Traduce una violación de unicidad de PostgreSQL a un mensaje para la persona. */
function conflictoDeUnicidad(error) {
  if (error?.code !== "23505") return null;

  if (error.constraint === "uq_insumo_nombre") {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un insumo con ese nombre.",
    );
  }

  if (error.constraint === "uq_proveedor_nombre") {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay un proveedor con ese nombre.",
    );
  }

  return null;
}

function conflictoDeLlaveForanea(error) {
  if (error?.code !== "23503") return null;

  if (error.constraint === "insumo_id_unidad_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Esa unidad de medida ya no existe. Actualiza la lista.",
    );
  }

  if (error.constraint === "movimiento_inventario_id_insumo_fkey") {
    return new ErrorDeApi(400, "DATOS_INVALIDOS", "Ese insumo ya no existe.");
  }

  if (error.constraint === "movimiento_inventario_id_punto_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Ese punto de acceso ya no existe.",
    );
  }

  if (error.constraint === "movimiento_inventario_id_proveedor_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Ese proveedor ya no existe.",
    );
  }

  return null;
}

function conflictoDeRegla(error) {
  if (error?.code !== "23514") return null;

  if (error.constraint === "ck_insumo_minimo") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El mínimo no puede ser negativo.",
    );
  }

  if (
    error.constraint === "ck_movimiento_signo" ||
    error.constraint === "ck_movimiento_cantidad"
  ) {
    return new ErrorDeApi(
      409,
      "MOVIMIENTO_INVALIDO",
      "El movimiento no tiene un signo válido para su tipo.",
    );
  }

  if (error.constraint === "ck_existencia_no_negativa") {
    return new ErrorDeApi(
      409,
      "EXISTENCIA_INSUFICIENTE",
      "La operación dejaría la existencia en negativo.",
    );
  }

  /*
    El disparador `fn_mover_existencia` lanza su excepción sin nombre de
    restricción. Se reconoce por el texto que él mismo escribe.
  */
  if (!error.constraint && /negativo/i.test(error.message ?? "")) {
    return new ErrorDeApi(
      409,
      "EXISTENCIA_INSUFICIENTE",
      "La operación dejaría la existencia en negativo.",
    );
  }

  return null;
}

/** Lanza el error de base traducido, si se reconoce. */
function traducirErrorDeBase(error) {
  const traducido =
    conflictoDeUnicidad(error) ??
    conflictoDeLlaveForanea(error) ??
    conflictoDeRegla(error);

  if (traducido) throw traducido;
  throw error;
}

export function rutasDeInventario() {
  const rutas = express.Router();

  rutas.use(requiereSesion);

  /* ------------------------------------------------------- existencias */

  rutas.get(
    "/",
    requierePermiso("VER_EXISTENCIAS"),
    asyncHandler(async (_req, res) => {
      /*
        Los insumos inactivos también se devuelven: la pantalla de
        administración tiene que poder mostrarlos para reactivarlos. La
        existencia total sale de sumar los puntos; el mínimo se compara contra
        esa suma en el cliente.
      */
      const insumos = await consultar(
        `SELECT ${CAMPOS_DEL_INSUMO}
           ${DESDE_EL_INSUMO}
          ORDER BY i.activo DESC, i.nombre`,
      );

      const puntos = await consultar(
        `SELECT id_punto, nombre, es_almacen
           FROM punto_acceso
          ORDER BY es_almacen DESC, nombre`,
      );

      const existencias = await consultar(
        `SELECT id_insumo, id_punto, existencia, actualizado
           FROM existencia
          ORDER BY id_punto, id_insumo`,
      );

      const unidades = await consultar(
        `SELECT id_unidad, nombre, abreviatura
           FROM unidad_medida
          ORDER BY nombre`,
      );

      exito(res, { insumos, puntos, existencias, unidades });
    }),
  );

  /* ------------------------------------------------------- movimientos */

  rutas.get(
    "/movimientos",
    requierePermiso("VER_EXISTENCIAS"),
    validar(esquemaConsultaMovimientos, "consulta"),
    asyncHandler(async (req, res) => {
      const { id_insumo, limite } = req.datos;

      const movimientos = await consultar(
        `SELECT ${CAMPOS_DEL_MOVIMIENTO}
           ${DESDE_EL_MOVIMIENTO}
          WHERE ($1::int IS NULL OR m.id_insumo = $1)
          ORDER BY m.ocurrido_en DESC, m.id_movimiento DESC
          LIMIT $2`,
        [id_insumo ?? null, limite],
      );

      exito(res, { movimientos });
    }),
  );

  /* -------------------------------------------------------- proveedores */

  /*
    El formulario de un movimiento necesita los proveedores, por eso esta lista
    pide MOVER_INVENTARIO y no ADMINISTRAR_INSUMOS. En la matriz aprobada, todos
    los roles que administran insumos también pueden mover inventario.
  */
  rutas.get(
    "/proveedores",
    requierePermiso("MOVER_INVENTARIO"),
    asyncHandler(async (_req, res) => {
      const proveedores = await consultar(
        `SELECT p.id_proveedor,
                p.nombre,
                p.telefono,
                p.estado,
                count(m.id_movimiento)::int AS compras
           FROM proveedor p
           LEFT JOIN movimiento_inventario m
             ON m.id_proveedor = p.id_proveedor
            AND m.tipo = 'Entrada de compra'
          GROUP BY p.id_proveedor
          ORDER BY p.estado, p.nombre`,
      );

      exito(res, { proveedores });
    }),
  );

  /* ------------------------------------------------------------ insumos */

  rutas.post(
    "/insumos",
    requierePermiso("ADMINISTRAR_INSUMOS"),
    validar(esquemaCrearInsumo),
    asyncHandler(async (req, res) => {
      const { nombre, id_unidad, minimo } = req.datos;

      let creado;

      try {
        creado = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarUnidad(consultarUno, id_unidad);
            await revisarNombreDeInsumoDisponible(consultarUno, nombre);

            const fila = await consultarUno(
              `INSERT INTO insumo (nombre, id_unidad, minimo)
               VALUES ($1, $2, $3)
               RETURNING id_insumo`,
              [nombre, id_unidad, minimo],
            );

            return buscarInsumo(consultarUno, fila.id_insumo);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, creado, 201);
    }),
  );

  rutas.patch(
    "/insumos/:id",
    requierePermiso("ADMINISTRAR_INSUMOS"),
    validar(esquemaEditarInsumo),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "insumo");
      const cambios = req.datos;

      let actualizado;

      try {
        actualizado = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarInsumo(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Ese insumo no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;
            const idUnidadFinal = cambios.id_unidad ?? actual.id_unidad;
            const minimoFinal = cambios.minimo ?? actual.minimo;
            const activoFinal = cambios.activo ?? actual.activo;

            if (idUnidadFinal !== actual.id_unidad) {
              await revisarUnidadCambiable(consultarUno, id);
              await revisarUnidad(consultarUno, idUnidadFinal);
            }

            if (cambios.nombre !== undefined) {
              await revisarNombreDeInsumoDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            await consultarUno(
              `UPDATE insumo
                  SET nombre = $1,
                      id_unidad = $2,
                      minimo = $3,
                      activo = $4
                WHERE id_insumo = $5
                RETURNING id_insumo`,
              [nombreFinal, idUnidadFinal, minimoFinal, activoFinal, id],
            );

            return buscarInsumo(consultarUno, id);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizado);
    }),
  );

  /* --------------------------------------------------------- proveedores */

  rutas.post(
    "/proveedores",
    requierePermiso("ADMINISTRAR_INSUMOS"),
    validar(esquemaCrearProveedor),
    asyncHandler(async (req, res) => {
      const { nombre, telefono } = req.datos;

      let creado;

      try {
        creado = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarNombreDeProveedorDisponible(consultarUno, nombre);

            const fila = await consultarUno(
              `INSERT INTO proveedor (nombre, telefono)
               VALUES ($1, $2)
               RETURNING id_proveedor`,
              [nombre, telefono],
            );

            return buscarProveedor(consultarUno, fila.id_proveedor);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, creado, 201);
    }),
  );

  rutas.patch(
    "/proveedores/:id",
    requierePermiso("ADMINISTRAR_INSUMOS"),
    validar(esquemaEditarProveedor),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "proveedor");
      const cambios = req.datos;

      let actualizado;

      try {
        actualizado = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await consultarUno(
              `SELECT id_proveedor, nombre, telefono, estado
                 FROM proveedor
                WHERE id_proveedor = $1
                FOR UPDATE`,
              [id],
            );

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Ese proveedor no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;
            const telefonoFinal = cambios.telefono ?? actual.telefono;
            const estadoFinal = cambios.estado ?? actual.estado;

            if (cambios.nombre !== undefined) {
              await revisarNombreDeProveedorDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            const fila = await consultarUno(
              `UPDATE proveedor
                  SET nombre = $1,
                      telefono = $2,
                      estado = $3
                WHERE id_proveedor = $4
                RETURNING id_proveedor`,
              [nombreFinal, telefonoFinal, estadoFinal, id],
            );

            return buscarProveedor(consultarUno, fila.id_proveedor);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizado);
    }),
  );

  /* --------------------------------------------------------- movimientos */

  rutas.post(
    "/movimientos",
    requierePermiso("MOVER_INVENTARIO"),
    validar(esquemaMovimiento),
    asyncHandler(async (req, res) => {
      const datos = req.datos;

      let resultado;

      try {
        resultado = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarInsumoParaMover(consultarUno, datos.id_insumo);
            await revisarPunto(consultarUno, datos.id_punto);

            let idProveedor = null;

            if (datos.tipo === "Entrada de compra") {
              await revisarProveedorActivo(consultarUno, datos.id_proveedor);
              idProveedor = datos.id_proveedor;
            }

            /*
              Se crea la fila de existencia si es el primer movimiento de ese
              insumo en ese punto y se bloquea. El disparador vuelve a bloquearla
              al insertar el movimiento, pero hacerlo aquí permite calcular el
              conteo y avisar del faltante con un mensaje claro.
            */
            await consultarUno(
              `INSERT INTO existencia (id_insumo, id_punto, existencia)
               VALUES ($1, $2, 0)
               ON CONFLICT (id_insumo, id_punto) DO NOTHING`,
              [datos.id_insumo, datos.id_punto],
            );

            const actual = await consultarUno(
              `SELECT existencia
                 FROM existencia
                WHERE id_insumo = $1 AND id_punto = $2
                FOR UPDATE`,
              [datos.id_insumo, datos.id_punto],
            );

            const actualCentavos = aCentavos(actual.existencia);
            let cantidadCentavos;
            let detalle;

            if (datos.tipo === "Ajuste por conteo") {
              const conteoCentavos = aCentavos(datos.conteo_fisico);
              cantidadCentavos = conteoCentavos - actualCentavos;

              if (cantidadCentavos === 0) {
                throw new ErrorDeApi(
                  409,
                  "SIN_DIFERENCIA",
                  "El conteo coincide con la existencia actual. No hay nada que ajustar.",
                );
              }

              detalle =
                `Ajuste por conteo: había ${cantidadLegible(actualCentavos)}, ` +
                `se contaron ${cantidadLegible(conteoCentavos)}.`;
            } else {
              const cantidad = aCentavos(datos.cantidad);

              cantidadCentavos =
                datos.tipo === "Entrada de compra" ? cantidad : -cantidad;
              detalle = datos.detalle;

              if (actualCentavos + cantidadCentavos < 0) {
                throw new ErrorDeApi(
                  409,
                  "EXISTENCIA_INSUFICIENTE",
                  `Solo hay ${cantidadLegible(actualCentavos)} en ese punto. No puedes sacar ${cantidadLegible(cantidad)}.`,
                );
              }
            }

            /*
              La base guarda NUMERIC(12,2). Se manda la cantidad ya convertida a
              centésimas para que 2.50 no se convierta en 2.499999999.
            */
            const cantidadFinal = (cantidadCentavos / 100).toFixed(2);

            const fila = await consultarUno(
              `INSERT INTO movimiento_inventario
                 (tipo, id_insumo, id_punto, cantidad, detalle, id_proveedor, id_empleado)
               VALUES ($1::tipo_movimiento, $2, $3, $4, $5, $6, $7)
               RETURNING id_movimiento`,
              [
                datos.tipo,
                datos.id_insumo,
                datos.id_punto,
                cantidadFinal,
                detalle,
                idProveedor,
                req.sesion.idEmpleado,
              ],
            );

            const movimiento = await buscarMovimiento(
              consultarUno,
              fila.id_movimiento,
            );

            const nueva = await consultarUno(
              `SELECT existencia
                 FROM existencia
                WHERE id_insumo = $1 AND id_punto = $2`,
              [datos.id_insumo, datos.id_punto],
            );

            const total = await consultarUno(
              `SELECT COALESCE(SUM(existencia), 0) AS existencia_total
                 FROM existencia
                WHERE id_insumo = $1`,
              [datos.id_insumo],
            );

            return {
              movimiento,
              existencia: nueva.existencia,
              existencia_total: total.existencia_total,
            };
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, resultado, 201);
    }),
  );

  return rutas;
}
