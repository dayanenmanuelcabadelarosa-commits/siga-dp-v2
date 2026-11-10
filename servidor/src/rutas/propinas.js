/*
  propinas.js (rutas) — Propinas (Fase 5, módulo 3).
  -------------------------------------------------

  Endpoints:
    GET  /api/propinas          las mesas del empleado con pedido hoy y sus propinas
    POST /api/propinas          registra una propina sobre una mesa propia
    GET  /api/propinas/cierre   lo esperado, lo contado y lo cerrado del día
    POST /api/propinas/cierre   cierra las propinas de un empleado

  Permisos:
    · Registrar y ver las propias propinas: REGISTRAR_PROPINA
      (dueño, gerente, capitán y mesero).
    · Ver y cerrar las propinas del día: CERRAR_PROPINAS
      (dueño, gerente y capitán).

  Reglas:
    · RN-03: el empleado de la propina es el mesero del pedido, no quien
      escribe en la pantalla. La API lo copia de `pedido.id_mesero`.
    · RN-04: solo se registra sobre una mesa cuya orden tomó quien registra, y
      no se repite el mismo empleado, la misma mesa y el mismo día. La segunda
      parte la garantiza el índice `uq_propina_por_mesa`.
    · RN-12: un solo cierre por empleado y fecha. La API usa la versión de
      `fn_cerrar_propinas` que recibe también al empleado que cierra.
    · La fecha del negocio es la de America/Santo_Domingo, igual que el índice
      único de RN-04. No se usa la fecha del navegador.

  Nada se calcula en el cliente: las mesas, las propinas, los totales y el
  cierre salen de PostgreSQL después de cada cambio.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaCerrarPropinas,
  esquemaRegistrarPropina,
} from "../validaciones/propinas.js";
import { validar } from "../validaciones/validar.js";

/** La zona horaria que ya usa el índice único de RN-04. */
const ZONA_DEL_NEGOCIO = "America/Santo_Domingo";

/** La fecha de hoy tal como la ve el negocio, no el navegador. */
async function fechaDeHoy() {
  const fila = await consultarUno(
    `SELECT (now() AT TIME ZONE '${ZONA_DEL_NEGOCIO}')::date AS fecha`,
  );
  return fila.fecha;
}

/**
 * Las mesas que el empleado abrió hoy. Para cada una se dice si ya tiene
 * propina registrada, para que la pantalla no ofrezca registrar dos veces.
 */
async function mesasDelEmpleado(idEmpleado, fecha) {
  const filas = await consultar(
    `WITH mis_pedidos AS (
       SELECT DISTINCT ON (p.id_mesa) p.id_mesa, p.id_pedido
         FROM pedido p
        WHERE p.id_mesero = $1
          AND (p.abierto_en AT TIME ZONE 'America/Santo_Domingo')::date = $2::date
        ORDER BY p.id_mesa, p.id_pedido DESC
     )
     SELECT m.id_mesa     AS "idMesa",
            m.numero,
            z.nombre      AS zona,
            mp.id_pedido  AS "idPedido",
            pr.id_propina AS "idPropina",
            pr.monto,
            pr.forma,
            pr.referencia,
            to_char(pr.registrada_en AT TIME ZONE 'America/Santo_Domingo', 'HH24:MI') AS hora
       FROM mis_pedidos mp
       JOIN mesa m ON m.id_mesa = mp.id_mesa
       JOIN zona z ON z.id_zona = m.id_zona
       LEFT JOIN propina pr
         ON pr.id_mesa = m.id_mesa
        AND pr.id_empleado = $1
        AND (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $2::date
      ORDER BY m.numero`,
    [idEmpleado, fecha],
  );

  return filas.map((fila) => ({
    idMesa: fila.idMesa,
    numero: fila.numero,
    zona: fila.zona,
    idPedido: fila.idPedido,
    propina:
      fila.idPropina === null
        ? null
        : {
            id: fila.idPropina,
            monto: fila.monto,
            forma: fila.forma,
            referencia: fila.referencia,
            hora: fila.hora,
          },
  }));
}

/** Las propinas que el empleado registró hoy, con su mesa y su hora. */
async function propinasDelEmpleado(idEmpleado, fecha) {
  return consultar(
    `SELECT pr.id_propina AS id,
            m.numero      AS mesa,
            z.nombre      AS zona,
            pr.monto,
            pr.forma,
            pr.referencia,
            to_char(pr.registrada_en AT TIME ZONE 'America/Santo_Domingo', 'HH24:MI') AS hora
       FROM propina pr
       JOIN mesa m ON m.id_mesa = pr.id_mesa
       JOIN zona z ON z.id_zona = m.id_zona
      WHERE pr.id_empleado = $1
        AND (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $2::date
      ORDER BY pr.id_propina`,
    [idEmpleado, fecha],
  );
}

/** El resumen que ve quien registra: sus mesas, sus propinas y su total. */
async function resumenDeMisPropinas(idEmpleado) {
  const fecha = await fechaDeHoy();
  const mesas = await mesasDelEmpleado(idEmpleado, fecha);
  const propinas = await propinasDelEmpleado(idEmpleado, fecha);

  const total = await consultarUno(
    `SELECT COALESCE(SUM(pr.monto), 0)::dinero AS total
       FROM propina pr
      WHERE pr.id_empleado = $1
        AND (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $2::date`,
    [idEmpleado, fecha],
  );

  return { fecha, mesas, propinas, total: total.total };
}

/**
 * Las filas del cierre del día: un renglón por empleado que tiene propinas
 * registradas. Si ya se cerró, trae lo contado, la diferencia y quién cerró.
 */
async function resumenDeCierre() {
  const fecha = await fechaDeHoy();

  const filas = await consultar(
    `WITH esperados AS (
       SELECT pr.id_empleado, SUM(pr.monto)::dinero AS esperado
         FROM propina pr
        WHERE (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $1::date
        GROUP BY pr.id_empleado
     )
     SELECT e.id_empleado AS "idEmpleado",
            e.nombre      AS empleado,
            esp.esperado,
            c.id_cierre   AS "idCierre",
            c.contado,
            c.diferencia,
            to_char(c.cerrado_en AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY HH24:MI') AS "cerradoEn",
            ec.nombre     AS "cerradoPor"
       FROM esperados esp
       JOIN empleado e ON e.id_empleado = esp.id_empleado
       LEFT JOIN cierre_propina c
         ON c.id_empleado = esp.id_empleado
        AND c.fecha = $1::date
       LEFT JOIN empleado ec ON ec.id_empleado = c.id_cerrado_por
      ORDER BY e.nombre`,
    [fecha],
  );

  const totales = await consultarUno(
    `WITH esperados AS (
       SELECT pr.id_empleado, SUM(pr.monto)::dinero AS esperado
         FROM propina pr
        WHERE (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $1::date
        GROUP BY pr.id_empleado
     )
     SELECT COALESCE(SUM(esp.esperado), 0)::numeric(12,2) AS "totalEsperado",
            COALESCE(SUM(c.contado), 0)::numeric(12,2)    AS "totalContado",
            COALESCE(SUM(c.diferencia), 0)::numeric(12,2) AS "totalDiferencia"
       FROM esperados esp
       LEFT JOIN cierre_propina c
         ON c.id_empleado = esp.id_empleado
        AND c.fecha = $1::date`,
    [fecha],
  );

  return {
    fecha,
    filas: filas.map((fila) => ({
      idEmpleado: fila.idEmpleado,
      empleado: fila.empleado,
      esperado: fila.esperado,
      cierre:
        fila.idCierre === null
          ? null
          : {
              id: fila.idCierre,
              contado: fila.contado,
              diferencia: fila.diferencia,
              cerradoEn: fila.cerradoEn,
              cerradoPor: fila.cerradoPor,
            },
    })),
    totales,
  };
}

/** Traduce los errores de la base que la persona sí puede entender. */
function traducirErrorDePropina(error) {
  if (error?.code === "23505" && error.constraint === "uq_propina_por_mesa") {
    return new ErrorDeApi(
      409,
      "CONFLICTO_DE_ESTADO",
      "Ya registraste una propina para esa mesa hoy.",
    );
  }

  if (error?.code === "23514" && error.constraint === "ck_propina_referencia") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "La propina con tarjeta necesita una referencia.",
    );
  }

  if (error?.code === "23514" && error.constraint === "ck_propina_monto") {
    return new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El monto de la propina debe ser mayor que cero.",
    );
  }

  return null;
}

export function rutasDePropinas() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // GET /api/propinas/cierre
  rutas.get(
    "/cierre",
    requierePermiso("CERRAR_PROPINAS"),
    asyncHandler(async (_req, res) => {
      exito(res, await resumenDeCierre());
    }),
  );

  // GET /api/propinas
  rutas.get(
    "/",
    requierePermiso("REGISTRAR_PROPINA"),
    asyncHandler(async (req, res) => {
      exito(res, await resumenDeMisPropinas(req.sesion.idEmpleado));
    }),
  );

  // POST /api/propinas
  rutas.post(
    "/",
    requierePermiso("REGISTRAR_PROPINA"),
    validar(esquemaRegistrarPropina),
    asyncHandler(async (req, res) => {
      const { mesa, monto, forma, referencia } = req.datos;

      const propina = await conTransaccion(
        async ({ consultarUno: uno }) => {
          const filaMesa = await uno(
            "SELECT id_mesa FROM mesa WHERE numero = $1",
            [mesa],
          );
          if (!filaMesa) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
          }

          const hoy = await uno(
            `SELECT (now() AT TIME ZONE '${ZONA_DEL_NEGOCIO}')::date AS fecha`,
          );

          /*
            El pedido manda: de ahí sale el empleado que recibe la propina
            (RN-03) y la cuenta, si ya se generó. Se exige que el pedido sea de
            quien registra (RN-04).
          */
          const pedido = await uno(
            `SELECT p.id_pedido, p.id_mesero, c.id_cuenta
               FROM pedido p
               LEFT JOIN cuenta c ON c.id_pedido = p.id_pedido
              WHERE p.id_mesa = $1
                AND p.id_mesero = $2
                AND (p.abierto_en AT TIME ZONE 'America/Santo_Domingo')::date = $3::date
              ORDER BY p.id_pedido DESC
              LIMIT 1`,
            [filaMesa.id_mesa, req.sesion.idEmpleado, hoy.fecha],
          );

          if (!pedido) {
            throw new ErrorDeApi(
              403,
              "SIN_PERMISO",
              "Solo puedes registrar la propina de una mesa cuya orden tomaste tú hoy.",
            );
          }

          const repetida = await uno(
            `SELECT id_propina
               FROM propina
              WHERE id_empleado = $1
                AND id_mesa = $2
                AND (registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $3::date`,
            [pedido.id_mesero, filaMesa.id_mesa, hoy.fecha],
          );

          if (repetida) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "Ya registraste una propina para esa mesa hoy.",
            );
          }

          try {
            const creada = await uno(
              `INSERT INTO propina (id_empleado, id_mesa, id_cuenta, monto, forma, referencia)
               VALUES ($1, $2, $3, $4::dinero, $5, $6)
               RETURNING id_propina AS id,
                         monto,
                         forma,
                         referencia,
                         to_char(registrada_en AT TIME ZONE 'America/Santo_Domingo', 'HH24:MI') AS hora`,
              [
                pedido.id_mesero,
                filaMesa.id_mesa,
                pedido.id_cuenta,
                monto,
                forma,
                forma === "Tarjeta" ? (referencia ?? null) : null,
              ],
            );

            return { ...creada, mesa };
          } catch (error) {
            const traducido = traducirErrorDePropina(error);
            if (traducido) throw traducido;
            throw error;
          }
        },
        { usuario: req.sesion.usuario },
      );

      const resumen = await resumenDeMisPropinas(req.sesion.idEmpleado);

      exito(
        res,
        {
          propina,
          resumen,
          mensaje: `Propina de la mesa ${mesa} registrada.`,
        },
        201,
      );
    }),
  );

  // POST /api/propinas/cierre
  rutas.post(
    "/cierre",
    requierePermiso("CERRAR_PROPINAS"),
    validar(esquemaCerrarPropinas),
    asyncHandler(async (req, res) => {
      const { idEmpleado, contado } = req.datos;

      const cierre = await conTransaccion(
        async ({ consultarUno: uno }) => {
          const empleado = await uno(
            "SELECT id_empleado, nombre FROM empleado WHERE id_empleado = $1",
            [idEmpleado],
          );
          if (!empleado) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese empleado no existe.");
          }

          const hoy = await uno(
            `SELECT (now() AT TIME ZONE '${ZONA_DEL_NEGOCIO}')::date AS fecha`,
          );

          const esperado = await uno(
            `SELECT COALESCE(SUM(monto), 0)::dinero AS esperado
               FROM propina
              WHERE id_empleado = $1
                AND (registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $2::date`,
            [idEmpleado, hoy.fecha],
          );

          if (Number(esperado.esperado) <= 0) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `${empleado.nombre} no tiene propinas registradas hoy.`,
            );
          }

          const existente = await uno(
            "SELECT id_cierre FROM cierre_propina WHERE id_empleado = $1 AND fecha = $2::date",
            [idEmpleado, hoy.fecha],
          );
          if (existente) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `Ya se cerraron las propinas de ${empleado.nombre} hoy.`,
            );
          }

          try {
            const creado = await uno(
              "SELECT fn_cerrar_propinas($1, $2::date, $3::dinero, $4) AS id",
              [idEmpleado, hoy.fecha, contado, req.sesion.idEmpleado],
            );

            const fila = await uno(
              `SELECT c.id_cierre  AS id,
                      c.esperado,
                      c.contado,
                      c.diferencia,
                      to_char(c.cerrado_en AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY HH24:MI') AS "cerradoEn",
                      ec.nombre    AS "cerradoPor"
                 FROM cierre_propina c
                 JOIN empleado ec ON ec.id_empleado = c.id_cerrado_por
                WHERE c.id_cierre = $1`,
              [creado.id],
            );

            return {
              ...fila,
              idEmpleado,
              empleado: empleado.nombre,
            };
          } catch (error) {
            if (
              error?.code === "23505" &&
              error.constraint === "uq_cierre_empleado_fecha"
            ) {
              throw new ErrorDeApi(
                409,
                "CONFLICTO_DE_ESTADO",
                `Ya se cerraron las propinas de ${empleado.nombre} hoy.`,
              );
            }
            throw error;
          }
        },
        { usuario: req.sesion.usuario },
      );

      const resumen = await resumenDeCierre();

      exito(
        res,
        {
          cierre,
          resumen,
          mensaje: `Propinas de ${cierre.empleado} cerradas.`,
        },
        201,
      );
    }),
  );

  return rutas;
}
