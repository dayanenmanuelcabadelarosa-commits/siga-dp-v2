/*
  mesas.js (rutas) — Mesas y reservas (M02, Fase 4).
  -------------------------------------------------

    GET    /api/mesas                       zonas y mesas con su estado actual
    POST   /api/mesas                       crear una mesa
    PATCH  /api/mesas/:id                   editar número, zona o capacidad
    DELETE /api/mesas/:id                   eliminar una mesa sin historial
    PATCH  /api/mesas/:id/estado            ocupar, liberar o marcar en limpieza

    GET    /api/mesas/reservas?fecha=...    agenda de un día
    POST   /api/mesas/reservas              crear una reserva
    PATCH  /api/mesas/reservas/:id          editar una reserva pendiente
    POST   /api/mesas/reservas/:id/cancelar cancelar con motivo
    POST   /api/mesas/reservas/:id/abrir    abrir la reserva y ocupar la mesa

    POST   /api/mesas/zonas                 crear una zona
    PATCH  /api/mesas/zonas/:id             editar una zona
    DELETE /api/mesas/zonas/:id             eliminar una zona sin mesas

  Permisos, cada uno con su operación de la matriz:

    VER_MESAS             ver el mapa
    ASIGNAR_MESA          ocupar, liberar o marcar en limpieza
    GESTIONAR_RESERVA     crear, editar, cancelar y abrir reservas
    ADMINISTRAR_MESAS     crear, editar y eliminar zonas y mesas

  Abrir una reserva exige GESTIONAR_RESERVA y ASIGNAR_MESA: no basta con
  administrar la agenda si el rol no puede asignar una mesa.

  Dos reglas que la base no puede defender sola:

    1. Una mesa con un pedido o una cuenta abiertos no se libera ni se manda a
       limpieza. La base guarda el pedido; la ruta revisa que no quede servicio
       colgando.
    2. Bajar la capacidad de una mesa no puede dejar inválidas las reservas que
       ya existen para hoy o para más adelante (RN-20). El disparador de la base
       valida la reserva al crearla, no cuando cambia la mesa.

  Las mesas y las reservas no se borran si tienen historial: la llave foránea lo
  impide y aquí se traduce a un mensaje claro.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaCancelarReserva,
  esquemaCrearMesa,
  esquemaCrearReserva,
  esquemaCrearZona,
  esquemaEditarMesa,
  esquemaEditarReserva,
  esquemaEditarZona,
  esquemaEstadoMesa,
  esquemaFechaDeReservas,
} from "../validaciones/mesas.js";
import { validar } from "../validaciones/validar.js";

const CAMPOS_DE_MESA = `
  m.id_mesa,
  m.numero,
  m.id_zona,
  z.nombre        AS zona,
  z.tipo_ambiente,
  z.activo        AS zona_activa,
  m.capacidad,
  m.estado,
  m.personas,
  m.hora_llegada,
  m.id_mesero_orden,
  e.nombre        AS mesero_orden,
  m.estado_pedido,
  m.creado_en,
  m.modificado_en
`;

const DESDE_LA_MESA = `
  FROM mesa m
  JOIN zona z ON z.id_zona = m.id_zona
  LEFT JOIN empleado e ON e.id_empleado = m.id_mesero_orden
`;

const CAMPOS_DE_RESERVA = `
  r.id_reserva,
  r.fecha,
  to_char(r.hora, 'HH24:MI') AS hora,
  r.nombre_cliente,
  r.telefono,
  r.personas,
  r.id_mesa,
  m.numero AS mesa_numero,
  z.nombre AS zona,
  r.estado,
  r.motivo_cancelacion,
  r.id_mesero_asignado,
  r.creado_en
`;

const DESDE_LA_RESERVA = `
  FROM reserva r
  JOIN mesa m ON m.id_mesa = r.id_mesa
  JOIN zona z ON z.id_zona = m.id_zona
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

async function buscarMesa(consultarUno, id, { bloquear = false } = {}) {
  return consultarUno(
    `SELECT ${CAMPOS_DE_MESA}
       ${DESDE_LA_MESA}
      WHERE m.id_mesa = $1
      ${bloquear ? "FOR UPDATE OF m" : ""}`,
    [id],
  );
}

async function buscarReserva(consultarUno, id, { bloquear = false } = {}) {
  return consultarUno(
    `SELECT ${CAMPOS_DE_RESERVA}
       ${DESDE_LA_RESERVA}
      WHERE r.id_reserva = $1
      ${bloquear ? "FOR UPDATE OF r" : ""}`,
    [id],
  );
}

/** La zona existe y, salvo que se permita, está activa. */
async function revisarZona(
  consultarUno,
  idZona,
  { permitirInactiva = false } = {},
) {
  const zona = await consultarUno(
    `SELECT id_zona, nombre, tipo_ambiente, activo
       FROM zona
      WHERE id_zona = $1
      FOR SHARE`,
    [idZona],
  );

  if (!zona) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "Esa zona no existe.");
  }

  if (!zona.activo && !permitirInactiva) {
    throw new ErrorDeApi(
      409,
      "ZONA_INACTIVA",
      `La zona "${zona.nombre}" está inactiva. Elige una activa.`,
    );
  }

  return zona;
}

async function revisarNombreDeZonaDisponible(
  consultarUno,
  nombre,
  idExcluir = null,
) {
  const repetida = await consultarUno(
    `SELECT id_zona
       FROM zona
      WHERE fn_nombre_normalizado(nombre) = fn_nombre_normalizado($1)
        AND ($2::int IS NULL OR id_zona <> $2)
      LIMIT 1`,
    [nombre, idExcluir],
  );

  if (repetida) {
    throw new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una zona con ese nombre.",
    );
  }
}

async function revisarNumeroDeMesaDisponible(
  consultarUno,
  numero,
  idExcluir = null,
) {
  const repetida = await consultarUno(
    `SELECT id_mesa
       FROM mesa
      WHERE numero = $1
        AND ($2::int IS NULL OR id_mesa <> $2)
      LIMIT 1`,
    [numero, idExcluir],
  );

  if (repetida) {
    throw new ErrorDeApi(
      409,
      "NUMERO_DUPLICADO",
      `Ya existe la mesa ${numero}.`,
    );
  }
}

/** Una mesa no puede tener dos reservas vivas a la misma fecha y hora (RN-21). */
async function revisarChoqueDeReserva(
  consultarUno,
  { idMesa, fecha, hora, idExcluir = null },
) {
  const choque = await consultarUno(
    `SELECT id_reserva
       FROM reserva
      WHERE id_mesa = $1
        AND fecha = $2::date
        AND hora = $3::time
        AND estado <> 'Cancelada'
        AND ($4::int IS NULL OR id_reserva <> $4)
      LIMIT 1`,
    [idMesa, fecha, hora, idExcluir],
  );

  if (choque) {
    throw new ErrorDeApi(
      409,
      "RESERVA_DUPLICADA",
      "Ya hay una reserva para esa mesa, esa fecha y esa hora.",
    );
  }
}

function revisarCapacidad(mesa, cantidad) {
  if (cantidad > mesa.capacidad) {
    throw new ErrorDeApi(
      409,
      "CAPACIDAD_EXCEDIDA",
      `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas.`,
    );
  }
}

/** Una mesa con pedido o cuenta abiertos no se puede liberar sin cerrar el servicio. */
async function revisarServicioAbierto(consultarUno, idMesa) {
  const abierto = await consultarUno(
    `SELECT 1 AS hay
       FROM pedido
      WHERE id_mesa = $1 AND estado IN ('Abierto', 'Enviado')
     UNION ALL
     SELECT 1 AS hay
       FROM cuenta
      WHERE id_mesa = $1 AND estado = 'Abierta'
      LIMIT 1`,
    [idMesa],
  );

  if (abierto) {
    throw new ErrorDeApi(
      409,
      "MESA_CON_SERVICIO_ABIERTO",
      "Esa mesa tiene un pedido o una cuenta abiertos. Ciérralos antes de liberarla.",
    );
  }
}

/** Traduce una violación de unicidad de PostgreSQL a un mensaje para la persona. */
function conflictoDeUnicidad(error) {
  if (error?.code !== "23505") return null;

  if (error.constraint === "uq_zona_nombre") {
    return new ErrorDeApi(
      409,
      "NOMBRE_DUPLICADO",
      "Ya hay una zona con ese nombre.",
    );
  }

  if (error.constraint === "uq_mesa_numero") {
    return new ErrorDeApi(
      409,
      "NUMERO_DUPLICADO",
      "Ya existe una mesa con ese número.",
    );
  }

  if (error.constraint === "uq_reserva_por_mesa_hora") {
    return new ErrorDeApi(
      409,
      "RESERVA_DUPLICADA",
      "Ya hay una reserva para esa mesa, esa fecha y esa hora.",
    );
  }

  return null;
}

/** Otras restricciones que la base puede rechazar y conviene explicar. */
function conflictoDeLlaveForanea(error) {
  if (error?.code !== "23503") return null;

  if (error.constraint === "mesa_id_zona_fkey") {
    return new ErrorDeApi(
      409,
      "ZONA_CON_MESAS",
      "Esa zona todavía tiene mesas asignadas.",
    );
  }

  if (error.constraint === "reserva_id_mesa_fkey") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Esa mesa ya no existe. Actualiza la lista.",
    );
  }

  return null;
}

function conflictoDeChequeo(error) {
  if (error?.code !== "23514") return null;

  if (error.constraint === "ck_mesa_personas") {
    return new ErrorDeApi(
      409,
      "CAPACIDAD_EXCEDIDA",
      "La cantidad de personas supera la capacidad de la mesa (RN-20).",
    );
  }

  if (error.constraint === "ck_mesa_coherencia") {
    return new ErrorDeApi(
      409,
      "ESTADO_INVALIDO",
      "El estado de la mesa no coincide con sus datos de servicio.",
    );
  }

  if (error.constraint === "ck_reserva_personas") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "La reserva debe tener al menos una persona.",
    );
  }

  if (error.constraint === "ck_reserva_cancelada") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Una reserva cancelada necesita un motivo.",
    );
  }

  // Los disparadores de capacidad lanzan 23514 sin un nombre de restricción.
  if (error.constraint === null || error.constraint === undefined) {
    return new ErrorDeApi(
      409,
      "CAPACIDAD_EXCEDIDA",
      "La cantidad de personas supera la capacidad de la mesa (RN-20).",
    );
  }

  return null;
}

/** Lanza el error de base traducido, si se reconoce. */
function traducirErrorDeBase(error) {
  const traducido =
    conflictoDeUnicidad(error) ??
    conflictoDeLlaveForanea(error) ??
    conflictoDeChequeo(error);

  if (traducido) throw traducido;
  throw error;
}

export function rutasDeMesas() {
  const rutas = express.Router();

  rutas.use(requiereSesion);

  /* ------------------------------------------------------------- el mapa */

  rutas.get(
    "/",
    requierePermiso("VER_MESAS"),
    asyncHandler(async (_req, res) => {
      const zonas = await consultar(
        `SELECT id_zona, nombre, tipo_ambiente, activo
           FROM zona
          ORDER BY activo DESC, nombre`,
      );

      const mesas = await consultar(
        `SELECT ${CAMPOS_DE_MESA}
           ${DESDE_LA_MESA}
          ORDER BY m.numero`,
      );

      exito(res, { zonas, mesas });
    }),
  );

  /* -------------------------------------------------------------- zonas */

  rutas.post(
    "/zonas",
    requierePermiso("ADMINISTRAR_MESAS"),
    validar(esquemaCrearZona),
    asyncHandler(async (req, res) => {
      const { nombre, tipo_ambiente: tipoAmbiente } = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarNombreDeZonaDisponible(consultarUno, nombre);

            return consultarUno(
              `INSERT INTO zona (nombre, tipo_ambiente)
               VALUES ($1, $2)
               RETURNING id_zona, nombre, tipo_ambiente, activo`,
              [nombre, tipoAmbiente],
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
    "/zonas/:id",
    requierePermiso("ADMINISTRAR_MESAS"),
    validar(esquemaEditarZona),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "zona");
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await consultarUno(
              `SELECT id_zona, nombre, tipo_ambiente, activo
                 FROM zona
                WHERE id_zona = $1
                FOR UPDATE`,
              [id],
            );

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa zona no existe.",
              );
            }

            const nombreFinal = cambios.nombre ?? actual.nombre;

            if (cambios.nombre !== undefined) {
              await revisarNombreDeZonaDisponible(
                consultarUno,
                nombreFinal,
                id,
              );
            }

            return consultarUno(
              `UPDATE zona
                  SET nombre = $1,
                      tipo_ambiente = $2
                WHERE id_zona = $3
                RETURNING id_zona, nombre, tipo_ambiente, activo`,
              [
                nombreFinal,
                cambios.tipo_ambiente ?? actual.tipo_ambiente,
                id,
              ],
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

  rutas.delete(
    "/zonas/:id",
    requierePermiso("ADMINISTRAR_MESAS"),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "zona");

      try {
        await conTransaccion(
          async ({ consultarUno }) => {
            const zona = await consultarUno(
              `SELECT id_zona, nombre
                 FROM zona
                WHERE id_zona = $1
                FOR UPDATE`,
              [id],
            );

            if (!zona) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa zona no existe.",
              );
            }

            // RN-15: una zona con mesas no se elimina.
            const conteo = await consultarUno(
              `SELECT count(*)::int AS mesas
                 FROM mesa
                WHERE id_zona = $1`,
              [id],
            );

            if (conteo.mesas > 0) {
              throw new ErrorDeApi(
                409,
                "ZONA_CON_MESAS",
                `La zona "${zona.nombre}" tiene ${conteo.mesas} ${
                  conteo.mesas === 1 ? "mesa" : "mesas"
                }. Cámbialas de zona antes de eliminarla.`,
              );
            }

            await consultarUno(
              `DELETE FROM zona WHERE id_zona = $1 RETURNING id_zona`,
              [id],
            );

            return zona;
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, { id_zona: id });
    }),
  );

  /* --------------------------------------------------------------- mesas */

  rutas.post(
    "/",
    requierePermiso("ADMINISTRAR_MESAS"),
    validar(esquemaCrearMesa),
    asyncHandler(async (req, res) => {
      const { numero, id_zona: idZona, capacidad: capacidadNueva } = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno }) => {
            await revisarZona(consultarUno, idZona);
            await revisarNumeroDeMesaDisponible(consultarUno, numero);

            return consultarUno(
              `INSERT INTO mesa (numero, id_zona, capacidad)
               VALUES ($1, $2, $3)
               RETURNING id_mesa`,
              [numero, idZona, capacidadNueva],
            ).then((fila) => buscarMesa(consultarUno, fila.id_mesa));
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
    "/:id/estado",
    requierePermiso("ASIGNAR_MESA"),
    validar(esquemaEstadoMesa),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "mesa");
      const cambio = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarMesa(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa mesa no existe.",
              );
            }

            if (cambio.estado === "ocupada") {
              if (actual.estado === "ocupada") {
                throw new ErrorDeApi(
                  409,
                  "MESA_YA_OCUPADA",
                  "Esa mesa ya está ocupada.",
                );
              }

              if (actual.estado === "limpieza") {
                throw new ErrorDeApi(
                  409,
                  "MESA_EN_LIMPIEZA",
                  "Esa mesa está en limpieza. Termínala antes de ocuparla.",
                );
              }

              revisarCapacidad(actual, cambio.personas);

              return consultarUno(
                `UPDATE mesa
                    SET estado = 'ocupada',
                        personas = $1,
                        hora_llegada = now(),
                        id_mesero_orden = NULL,
                        estado_pedido = NULL
                  WHERE id_mesa = $2
                  RETURNING id_mesa`,
                [cambio.personas, id],
              ).then((fila) => buscarMesa(consultarUno, fila.id_mesa));
            }

            if (cambio.estado === "limpieza") {
              if (actual.estado === "limpieza") {
                throw new ErrorDeApi(
                  409,
                  "MESA_YA_EN_LIMPIEZA",
                  "Esa mesa ya está en limpieza.",
                );
              }

              await revisarServicioAbierto(consultarUno, id);

              return consultarUno(
                `UPDATE mesa
                    SET estado = 'limpieza',
                        personas = NULL,
                        hora_llegada = NULL,
                        id_mesero_orden = NULL,
                        estado_pedido = NULL
                  WHERE id_mesa = $1
                  RETURNING id_mesa`,
                [id],
              ).then((fila) => buscarMesa(consultarUno, fila.id_mesa));
            }

            if (actual.estado === "libre") {
              throw new ErrorDeApi(
                409,
                "MESA_YA_LIBRE",
                "Esa mesa ya está libre.",
              );
            }

            await revisarServicioAbierto(consultarUno, id);

            return consultarUno(
              `UPDATE mesa
                  SET estado = 'libre',
                      personas = NULL,
                      hora_llegada = NULL,
                      id_mesero_orden = NULL,
                      estado_pedido = NULL
                WHERE id_mesa = $1
                RETURNING id_mesa`,
              [id],
            ).then((fila) => buscarMesa(consultarUno, fila.id_mesa));
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizada);
    }),
  );

  rutas.patch(
    "/:id",
    requierePermiso("ADMINISTRAR_MESAS"),
    validar(esquemaEditarMesa),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "mesa");
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarMesa(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa mesa no existe.",
              );
            }

            const numeroFinal = cambios.numero ?? actual.numero;
            const idZonaFinal = cambios.id_zona ?? actual.id_zona;
            const capacidadFinal = cambios.capacidad ?? actual.capacidad;

            if (cambios.numero !== undefined) {
              await revisarNumeroDeMesaDisponible(
                consultarUno,
                numeroFinal,
                id,
              );
            }

            await revisarZona(consultarUno, idZonaFinal, {
              permitirInactiva: idZonaFinal === actual.id_zona,
            });

            if (capacidadFinal < (actual.personas ?? 0)) {
              throw new ErrorDeApi(
                409,
                "CAPACIDAD_MENOR_QUE_PERSONAS",
                `La mesa tiene ${actual.personas} ${
                  actual.personas === 1 ? "persona" : "personas"
                } ahora mismo; no puedes bajar la capacidad por debajo de eso.`,
              );
            }

            if (capacidadFinal < actual.capacidad) {
              const reservas = await consultarUno(
                `SELECT count(*)::int AS total
                   FROM reserva
                  WHERE id_mesa = $1
                    AND estado <> 'Cancelada'
                    AND fecha >= CURRENT_DATE
                    AND personas > $2`,
                [id, capacidadFinal],
              );

              if (reservas.total > 0) {
                throw new ErrorDeApi(
                  409,
                  "CAPACIDAD_MENOR_QUE_RESERVAS",
                  `Hay ${reservas.total} ${
                    reservas.total === 1 ? "reserva" : "reservas"
                  } de hoy o de más adelante con más personas que la nueva capacidad.`,
                );
              }
            }

            return consultarUno(
              `UPDATE mesa
                  SET numero = $1,
                      id_zona = $2,
                      capacidad = $3
                WHERE id_mesa = $4
                RETURNING id_mesa`,
              [numeroFinal, idZonaFinal, capacidadFinal, id],
            ).then((fila) => buscarMesa(consultarUno, fila.id_mesa));
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizada);
    }),
  );

  rutas.delete(
    "/:id",
    requierePermiso("ADMINISTRAR_MESAS"),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "mesa");

      try {
        await conTransaccion(
          async ({ consultarUno }) => {
            const mesa = await buscarMesa(consultarUno, id, {
              bloquear: true,
            });

            if (!mesa) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa mesa no existe.",
              );
            }

            const historial = await consultarUno(
              `SELECT
                 (SELECT count(*)::int FROM reserva WHERE id_mesa = $1) AS reservas,
                 (SELECT count(*)::int FROM pedido  WHERE id_mesa = $1) AS pedidos,
                 (SELECT count(*)::int FROM cuenta  WHERE id_mesa = $1) AS cuentas`,
              [id],
            );

            if (
              historial.reservas > 0 ||
              historial.pedidos > 0 ||
              historial.cuentas > 0
            ) {
              throw new ErrorDeApi(
                409,
                "MESA_CON_HISTORIAL",
                `La mesa ${mesa.numero} tiene reservas o servicios registrados. No se puede eliminar.`,
              );
            }

            await consultarUno(
              `DELETE FROM mesa WHERE id_mesa = $1 RETURNING id_mesa`,
              [id],
            );
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, { id_mesa: id });
    }),
  );

  /* ------------------------------------------------------------ reservas */

  rutas.get(
    "/reservas",
    requierePermiso("GESTIONAR_RESERVA"),
    validar(esquemaFechaDeReservas, "consulta"),
    asyncHandler(async (req, res) => {
      const { fecha } = req.datos;

      const reservas = await consultar(
        `SELECT ${CAMPOS_DE_RESERVA}
           ${DESDE_LA_RESERVA}
          WHERE r.fecha = $1::date
          ORDER BY r.hora, m.numero, r.nombre_cliente`,
        [fecha],
      );

      exito(res, { fecha, reservas });
    }),
  );

  rutas.post(
    "/reservas",
    requierePermiso("GESTIONAR_RESERVA"),
    validar(esquemaCrearReserva),
    asyncHandler(async (req, res) => {
      const datos = req.datos;

      let creada;

      try {
        creada = await conTransaccion(
          async ({ consultarUno }) => {
            const mesa = await consultarUno(
              `SELECT m.id_mesa, m.numero, m.capacidad, m.estado,
                      z.activo AS zona_activa, z.nombre AS zona
                 FROM mesa m
                 JOIN zona z ON z.id_zona = m.id_zona
                WHERE m.id_mesa = $1
                FOR SHARE OF m`,
              [datos.id_mesa],
            );

            if (!mesa) {
              throw new ErrorDeApi(
                400,
                "DATOS_INVALIDOS",
                "Esa mesa no existe.",
              );
            }

            if (!mesa.zona_activa) {
              throw new ErrorDeApi(
                409,
                "ZONA_INACTIVA",
                `La zona "${mesa.zona}" está inactiva. Elige una mesa de una zona activa.`,
              );
            }

            revisarCapacidad(mesa, datos.personas);

            await revisarChoqueDeReserva(consultarUno, {
              idMesa: datos.id_mesa,
              fecha: datos.fecha,
              hora: datos.hora,
            });

            const insertada = await consultarUno(
              `INSERT INTO reserva (
                 fecha, hora, nombre_cliente, telefono, personas, id_mesa
               ) VALUES ($1::date, $2::time, $3, $4, $5, $6)
               RETURNING id_reserva`,
              [
                datos.fecha,
                datos.hora,
                datos.nombre_cliente,
                datos.telefono,
                datos.personas,
                datos.id_mesa,
              ],
            );

            return buscarReserva(consultarUno, insertada.id_reserva);
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
    "/reservas/:id",
    requierePermiso("GESTIONAR_RESERVA"),
    validar(esquemaEditarReserva),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "reserva");
      const cambios = req.datos;

      let actualizada;

      try {
        actualizada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarReserva(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa reserva no existe.",
              );
            }

            if (actual.estado !== "Pendiente") {
              throw new ErrorDeApi(
                409,
                "RESERVA_NO_EDITABLE",
                `La reserva ya está ${actual.estado.toLowerCase()} y no se puede editar.`,
              );
            }

            const fechaFinal = cambios.fecha ?? actual.fecha;
            const horaFinal = cambios.hora ?? actual.hora;
            const idMesaFinal = cambios.id_mesa ?? actual.id_mesa;
            const personasFinal = cambios.personas ?? actual.personas;

            const mesa = await consultarUno(
              `SELECT m.id_mesa, m.numero, m.capacidad, m.estado,
                      z.activo AS zona_activa, z.nombre AS zona
                 FROM mesa m
                 JOIN zona z ON z.id_zona = m.id_zona
                WHERE m.id_mesa = $1
                FOR SHARE OF m`,
              [idMesaFinal],
            );

            if (!mesa) {
              throw new ErrorDeApi(
                400,
                "DATOS_INVALIDOS",
                "Esa mesa no existe.",
              );
            }

            if (!mesa.zona_activa && idMesaFinal !== actual.id_mesa) {
              throw new ErrorDeApi(
                409,
                "ZONA_INACTIVA",
                `La zona "${mesa.zona}" está inactiva. Elige una mesa de una zona activa.`,
              );
            }

            revisarCapacidad(mesa, personasFinal);

            await revisarChoqueDeReserva(consultarUno, {
              idMesa: idMesaFinal,
              fecha: fechaFinal,
              hora: horaFinal,
              idExcluir: id,
            });

            await consultarUno(
              `UPDATE reserva
                  SET fecha = $1::date,
                      hora = $2::time,
                      nombre_cliente = $3,
                      telefono = $4,
                      personas = $5,
                      id_mesa = $6
                WHERE id_reserva = $7
                RETURNING id_reserva`,
              [
                fechaFinal,
                horaFinal,
                cambios.nombre_cliente ?? actual.nombre_cliente,
                cambios.telefono ?? actual.telefono,
                personasFinal,
                idMesaFinal,
                id,
              ],
            );

            return buscarReserva(consultarUno, id);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, actualizada);
    }),
  );

  rutas.post(
    "/reservas/:id/cancelar",
    requierePermiso("GESTIONAR_RESERVA"),
    validar(esquemaCancelarReserva),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "reserva");
      const { motivo_cancelacion: motivo } = req.datos;

      let cancelada;

      try {
        cancelada = await conTransaccion(
          async ({ consultarUno }) => {
            const actual = await buscarReserva(consultarUno, id, {
              bloquear: true,
            });

            if (!actual) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa reserva no existe.",
              );
            }

            if (actual.estado !== "Pendiente") {
              throw new ErrorDeApi(
                409,
                "RESERVA_NO_CANCELABLE",
                `La reserva ya está ${actual.estado.toLowerCase()} y no se puede cancelar.`,
              );
            }

            await consultarUno(
              `UPDATE reserva
                  SET estado = 'Cancelada',
                      motivo_cancelacion = $1
                WHERE id_reserva = $2
                RETURNING id_reserva`,
              [motivo, id],
            );

            return buscarReserva(consultarUno, id);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, cancelada);
    }),
  );

  rutas.post(
    "/reservas/:id/abrir",
    requierePermiso("GESTIONAR_RESERVA"),
    requierePermiso("ASIGNAR_MESA"),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "reserva");

      let resultado;

      try {
        resultado = await conTransaccion(
          async ({ consultarUno }) => {
            const reserva = await buscarReserva(consultarUno, id, {
              bloquear: true,
            });

            if (!reserva) {
              throw new ErrorDeApi(
                404,
                "NO_ENCONTRADO",
                "Esa reserva no existe.",
              );
            }

            if (reserva.estado !== "Pendiente") {
              throw new ErrorDeApi(
                409,
                "RESERVA_NO_ABRIBLE",
                `La reserva ya está ${reserva.estado.toLowerCase()} y no se puede abrir.`,
              );
            }

            const mesa = await buscarMesa(consultarUno, reserva.id_mesa, {
              bloquear: true,
            });

            if (!mesa) {
              throw new ErrorDeApi(
                400,
                "DATOS_INVALIDOS",
                "La mesa de esa reserva ya no existe.",
              );
            }

            if (mesa.estado === "ocupada") {
              throw new ErrorDeApi(
                409,
                "MESA_OCUPADA",
                "La mesa de esa reserva ya está ocupada.",
              );
            }

            if (mesa.estado === "limpieza") {
              throw new ErrorDeApi(
                409,
                "MESA_EN_LIMPIEZA",
                "La mesa de esa reserva está en limpieza. Termínala antes de abrirla.",
              );
            }

            // Si quedó un pedido o una cuenta abiertos de un servicio anterior,
            // abrir la reserva encima los dejaría colgando.
            await revisarServicioAbierto(consultarUno, mesa.id_mesa);

            revisarCapacidad(mesa, reserva.personas);

            await consultarUno(
              `UPDATE mesa
                  SET estado = 'ocupada',
                      personas = $1,
                      hora_llegada = now(),
                      id_mesero_orden = NULL,
                      estado_pedido = NULL
                WHERE id_mesa = $2
                RETURNING id_mesa`,
              [reserva.personas, mesa.id_mesa],
            );

            await consultarUno(
              `UPDATE reserva
                  SET estado = 'Abierta'
                WHERE id_reserva = $1
                RETURNING id_reserva`,
              [id],
            );

            return {
              reserva: await buscarReserva(consultarUno, id),
              mesa: await buscarMesa(consultarUno, mesa.id_mesa),
            };
          },
          { usuario: req.sesion.usuario },
        );
      } catch (error) {
        traducirErrorDeBase(error);
      }

      exito(res, resultado);
    }),
  );

  return rutas;
}
