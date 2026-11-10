/*
  corte.js (rutas) — Corte de caja (Fase 6, módulo 6).
  ------------------------------------------------------

  Endpoints:
    GET  /api/corte            resumen del día (totales por forma, descuentos, comprobantes)
    POST /api/corte/cerrar     cierra el corte del día con el efectivo declarado

  Permiso: REALIZAR_CORTE (dueño, gerente y cajero).

  Reglas:
    · RN-11: un corte por fecha. Si ya está cerrado, solo el dueño puede reabrirlo.
    · Los totales se recalculan con lo que realmente se cobró (fn_cerrar_corte).
    · La fecha es la del negocio (America/Santo_Domingo), no la del navegador.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import { esquemaCerrarCorte } from "../validaciones/cuentas.js";
import { validar } from "../validaciones/validar.js";

const ZONA_DEL_NEGOCIO = "America/Santo_Domingo";

async function fechaDeHoy() {
  const fila = await consultarUno(
    `SELECT (now() AT TIME ZONE '${ZONA_DEL_NEGOCIO}')::date AS fecha`,
  );
  return fila.fecha;
}

async function resumenDelDia(fecha) {
  const corte = await consultarUno(
    `SELECT id_corte, estado, efectivo_sistema, efectivo_declarado, diferencia,
            total_tarjeta, total_paypal, total_credito, total_ventas,
            comprobantes, total_descuentos, cerrado_en, id_cerrado_por
       FROM corte_caja
      WHERE fecha = $1`,
    [fecha],
  );

  const porForma = await consultar(
    `SELECT pg.forma_pago AS forma,
            COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total
       FROM pago pg
       JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
      WHERE (c.abierta_en AT TIME ZONE 'America/Santo_Domingo')::date = $1::date
      GROUP BY pg.forma_pago`,
    [fecha],
  );

  const formas = {
    Efectivo: 0,
    Tarjeta: 0,
    PayPal: 0,
    Crédito: 0,
  };

  for (const fila of porForma) {
    formas[fila.forma] = fila.total;
  }

  let cerradoPor = null;

  if (corte?.id_cerrado_por) {
    const empleado = await consultarUno(
      "SELECT nombre FROM empleado WHERE id_empleado = $1",
      [corte.id_cerrado_por],
    );
    cerradoPor = empleado?.nombre ?? null;
  }

  return {
    fecha,
    estado: corte?.estado ?? "Abierto",
    cerradoEn: corte?.cerrado_en ?? null,
    cerradoPor,
    porForma: formas,
    totalVentas: corte?.total_ventas ?? 0,
    totalDescuentos: corte?.total_descuentos ?? 0,
    comprobantes: corte?.comprobantes ?? 0,
    efectivoSistema: corte?.efectivo_sistema ?? 0,
    efectivoDeclarado: corte?.efectivo_declarado ?? null,
    diferencia: corte?.diferencia ?? null,
  };
}

export function rutasDeCorte() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  rutas.get(
    "/",
    requierePermiso("REALIZAR_CORTE"),
    asyncHandler(async (_req, res) => {
      const fecha = await fechaDeHoy();
      const resumen = await resumenDelDia(fecha);
      exito(res, resumen);
    }),
  );

  rutas.post(
    "/cerrar",
    requierePermiso("REALIZAR_CORTE"),
    validar(esquemaCerrarCorte),
    asyncHandler(async (req, res) => {
      const fecha = await fechaDeHoy();
      const { efectivoDeclarado } = req.datos;

      const existente = await consultarUno(
        "SELECT id_corte, estado FROM corte_caja WHERE fecha = $1",
        [fecha],
      );

      if (
        existente &&
        existente.estado === "Cerrado" &&
        req.sesion.rol !== "dueno"
      ) {
        throw new ErrorDeApi(
          409,
          "CONFLICTO_DE_ESTADO",
          "El corte de hoy ya está cerrado.",
        );
      }

      const resultado = await conTransaccion(
        async ({ consultarUno: uno }) => {
          const cierre = await uno("SELECT fn_cerrar_corte($1::date, $2) AS id", [
            fecha,
            req.sesion.idEmpleado,
          ]);

          await uno(
            `UPDATE corte_caja
                SET efectivo_declarado = $1::dinero
              WHERE id_corte = $2`,
            [efectivoDeclarado, cierre.id],
          );

          return cierre.id;
        },
        { usuario: req.sesion.usuario },
      );

      const resumen = await resumenDelDia(fecha);

      exito(
        res,
        {
          id: resultado,
          resumen,
          mensaje: "Corte de caja cerrado.",
        },
        201,
      );
    }),
  );

  return rutas;
}
