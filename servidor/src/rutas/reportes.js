/*
  reportes.js (rutas) — reportes del gerente (Fase 7).
  ----------------------------------------------------

  Endpoints:
    GET /api/reportes/ventas?desde=&hasta=     ventas por día
    GET /api/reportes/propinas?desde=&hasta=   propinas por empleado y día
    GET /api/reportes/inventario               insumos bajo mínimo
    GET /api/reportes/agotados                  productos agotados con horas

  Permiso: CONSULTAR_REPORTES (dueño, gerente, capitán y cajero).
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { consultar } from "../db/conexion.js";
import { asyncHandler } from "../errores.js";
import { exito } from "../respuesta.js";

const ZONA = "America/Santo_Domingo";

export function rutasDeReportes() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  rutas.get(
    "/ventas",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (req, res) => {
      const desde = req.query.desde;
      const hasta = req.query.hasta;

      const condiciones = [];
      const valores = [];

      if (desde) {
        valores.push(desde);
        condiciones.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.length}::date`);
      }

      if (hasta) {
        valores.push(hasta);
        condiciones.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.length}::date`);
      }

      const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT (c.abierta_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Efectivo'), 0)::FLOAT8 AS efectivo,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Tarjeta'), 0)::FLOAT8 AS tarjeta,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'PayPal'), 0)::FLOAT8 AS paypal,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Crédito'), 0)::FLOAT8 AS credito,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total,
                COUNT(*)::INT AS pagos,
                COALESCE(SUM(ds.total_descuento), 0)::FLOAT8 AS descuentos
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           LEFT JOIN (
                SELECT c2.id_cuenta, SUM(d.monto) AS total_descuento
                  FROM descuento d
                  JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
                 GROUP BY c2.id_cuenta
           ) ds ON ds.id_cuenta = c.id_cuenta
           ${where}
          GROUP BY (c.abierta_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      exito(res, filas);
    }),
  );

  rutas.get(
    "/propinas",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (req, res) => {
      const desde = req.query.desde;
      const hasta = req.query.hasta;

      const condiciones = ["1 = 1"];
      const valores = [];

      if (desde) {
        valores.push(desde);
        condiciones.push(`(pr.registrada_en AT TIME ZONE '${ZONA}')::date >= $${valores.length}::date`);
      }

      if (hasta) {
        valores.push(hasta);
        condiciones.push(`(pr.registrada_en AT TIME ZONE '${ZONA}')::date <= $${valores.length}::date`);
      }

      const filas = await consultar(
        `SELECT e.nombre AS empleado,
                (pr.registrada_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS cantidad,
                COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
           FROM propina pr
           JOIN empleado e ON e.id_empleado = pr.id_empleado
          WHERE ${condiciones.join(" AND ")}
          GROUP BY e.nombre, (pr.registrada_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC, e.nombre`,
        valores,
      );

      exito(res, filas);
    }),
  );

  rutas.get(
    "/inventario",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (_req, res) => {
      const filas = await consultar(
        `SELECT nombre, minimo::FLOAT8 AS minimo, existencia::FLOAT8 AS existencia,
                punto, faltante::FLOAT8 AS faltante
           FROM v_insumos_bajo_minimo
           ORDER BY faltante DESC`,
      );

      exito(res, filas);
    }),
  );

  rutas.get(
    "/agotados",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (_req, res) => {
      const filas = await consultar(
        `SELECT p.id_producto, p.nombre, c.nombre AS categoria, e.nombre AS estacion,
                p.precio::FLOAT8 AS precio,
                ROUND(EXTRACT(EPOCH FROM (now() - p.modificado_en)) / 3600, 2)::FLOAT8 AS horas
           FROM producto p
           JOIN categoria c ON c.id_categoria = p.id_categoria
           JOIN estacion e ON e.id_estacion = p.id_estacion
          WHERE p.activo AND p.disponible = FALSE
          ORDER BY p.modificado_en`,
      );

      exito(res, filas);
    }),
  );

  return rutas;
}
