/*
  reportesDatos.js — las consultas de reportes, en un solo lugar.
  ---------------------------------------------------------------

  Cada función devuelve filas planas (números como float), para que las use
  por igual la API REST, el chat del asistente y la exportación a PDF.

  Las fechas son YYYY-MM-DD (cadenas). Se comparan contra la zona horaria de
  Santo Domingo, igual que hace el resto del sistema.
*/

import { consultar } from "../db/conexion.js";

const ZONA = "America/Santo_Domingo";

function normalizarFecha(fecha) {
  if (fecha === undefined || fecha === null || fecha === "") return null;
  const texto = String(fecha).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return texto;
}

/** Hoy en la zona del local, como YYYY-MM-DD. */
export function hoyLocal() {
  /* en-CA devuelve el formato 2026-11-16, que es el que esperan las fechas del sistema. */
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function condiciones(desde, hasta, columna) {
  const condicionesSql = [];
  const valores = [];

  const d = normalizarFecha(desde);
  const h = normalizarFecha(hasta);

  if (d !== null) {
    valores.push(d);
    condicionesSql.push(`(${columna} AT TIME ZONE '${ZONA}')::date >= $${valores.length}::date`);
  }

  if (h !== null) {
    valores.push(h);
    condicionesSql.push(`(${columna} AT TIME ZONE '${ZONA}')::date <= $${valores.length}::date`);
  }

  return { condiciones: condicionesSql.join(" AND "), valores };
}

/** Ventas por día (efectivo, tarjeta, PayPal, crédito, total, descuentos, pagos). */
export async function ventasPorDia(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "c.abierta_en");
  const where = cond ? `WHERE ${cond}` : "";

  return consultar(
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
}

/** Ventas agrupadas por forma de pago. */
export async function ventasPorFormaDePago(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "c.abierta_en");
  const where = cond ? `WHERE ${cond}` : "";

  return consultar(
    `SELECT pg.forma_pago AS forma,
            COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total,
            COUNT(*)::INT AS pagos
       FROM pago pg
       JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
       ${where}
      GROUP BY pg.forma_pago
      ORDER BY total DESC`,
    valores,
  );
}

/** Ventas por canal (Delivery / Para llevar / Salón). */
export async function ventasPorCanal(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "registrada_en");
  const where = cond ? `WHERE ${cond}` : "";

  return consultar(
    `SELECT canal,
            COUNT(*)::INT AS ventas,
            COALESCE(SUM(total), 0)::FLOAT8 AS total
       FROM venta_canal
       ${where}
      GROUP BY canal
      ORDER BY total DESC`,
    valores,
  );
}

/** Los productos más vendidos por cantidad o por importe. */
export async function productosMasVendidos(desde, hasta, limite = 10, ordenarPor = "cantidad") {
  const limiteSeguro = Math.min(Math.max(Number.parseInt(String(limite), 10) || 10, 1), 20);
  const ordenar = ordenarPor === "importe" ? "importe" : "cantidad";

  const condiciones = [];
  const valores = [];

  const d = normalizarFecha(desde);
  const h = normalizarFecha(hasta);

  if (d !== null) {
    valores.push(d);
    condiciones.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.length}::date`);
  }

  if (h !== null) {
    valores.push(h);
    condiciones.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.length}::date`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  return consultar(
    `SELECT pr.nombre,
            SUM(lc.cantidad)::FLOAT8 AS cantidad,
            SUM(lc.importe)::FLOAT8 AS importe
       FROM linea_cuenta lc
       JOIN producto pr ON pr.id_producto = lc.id_producto
       JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
       ${where}
      GROUP BY pr.nombre
      ORDER BY ${ordenar} DESC
      LIMIT ${limiteSeguro}`,
    valores,
  );
}

/** Propinas registradas por empleado en un período. */
export async function propinasPorEmpleado(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "pr.registrada_en");
  const where = cond ? `WHERE ${cond}` : "";

  return consultar(
    `SELECT e.nombre AS empleado,
            COUNT(*)::INT AS cantidad,
            COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
       FROM propina pr
       JOIN empleado e ON e.id_empleado = pr.id_empleado
       ${where}
      GROUP BY e.nombre
      ORDER BY total DESC`,
    valores,
  );
}

/** Propinas día a día y por empleado (detalle completo). */
export async function propinasDetalle(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "pr.registrada_en");
  const where = cond ? `WHERE ${cond}` : "";

  return consultar(
    `SELECT e.nombre AS empleado,
            (pr.registrada_en AT TIME ZONE '${ZONA}')::date AS fecha,
            COUNT(*)::INT AS cantidad,
            COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
       FROM propina pr
       JOIN empleado e ON e.id_empleado = pr.id_empleado
       ${where}
      GROUP BY e.nombre, (pr.registrada_en AT TIME ZONE '${ZONA}')::date
      ORDER BY fecha DESC, e.nombre`,
    valores,
  );
}

/** Insumos por debajo del mínimo registrado. */
export async function insumosBajoMinimo() {
  return consultar(
    `SELECT nombre, minimo::FLOAT8 AS minimo, existencia::FLOAT8 AS existencia,
            punto, faltante::FLOAT8 AS faltante
       FROM v_insumos_bajo_minimo
      ORDER BY faltante DESC`,
  );
}

/** Productos marcados agotados/no disponibles actualmente. */
export async function productosAgotados() {
  return consultar(
    `SELECT p.id_producto, p.nombre, c.nombre AS categoria, e.nombre AS estacion,
            p.precio::FLOAT8 AS precio,
            ROUND(EXTRACT(EPOCH FROM (now() - p.modificado_en)) / 3600, 2)::FLOAT8 AS horas
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       JOIN estacion e  ON e.id_estacion  = p.id_estacion
      WHERE p.activo AND p.disponible = FALSE
      ORDER BY p.modificado_en`,
  );
}

/** Cortes de caja de un período. */
export async function cortesDeCaja(desde, hasta) {
  const condiciones = [];
  const valores = [];

  const d = normalizarFecha(desde);
  const h = normalizarFecha(hasta);

  if (d !== null) {
    valores.push(d);
    condiciones.push(`c.fecha >= $${valores.length}::date`);
  }

  if (h !== null) {
    valores.push(h);
    condiciones.push(`c.fecha <= $${valores.length}::date`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  return consultar(
    `SELECT c.fecha,
            c.efectivo_sistema::FLOAT8 AS efectivo,
            c.total_tarjeta::FLOAT8 AS tarjeta,
            c.total_paypal::FLOAT8 AS paypal,
            c.total_credito::FLOAT8 AS credito,
            c.total_ventas::FLOAT8 AS total,
            c.comprobantes::INT AS comprobantes,
            c.total_descuentos::FLOAT8 AS descuentos,
            c.estado
       FROM corte_caja c
       ${where}
      ORDER BY c.fecha DESC`,
    valores,
  );
}

/** Reservas en un período. */
export async function reservasDelPeriodo(desde, hasta) {
  const condiciones = [];
  const valores = [];

  const d = normalizarFecha(desde);
  const h = normalizarFecha(hasta);

  if (d !== null) {
    valores.push(d);
    condiciones.push(`r.fecha >= $${valores.length}::date`);
  }

  if (h !== null) {
    valores.push(h);
    condiciones.push(`r.fecha <= $${valores.length}::date`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  return consultar(
    `SELECT r.fecha, r.hora::text AS hora, r.nombre_cliente, r.personas,
            z.nombre AS zona, m.numero AS mesa, r.estado
       FROM reserva r
       JOIN mesa m ON m.id_mesa = r.id_mesa
       JOIN zona z  ON z.id_zona  = m.id_zona
       ${where}
      ORDER BY r.fecha DESC, r.hora DESC`,
    valores,
  );
}

/** Resumen ejecutivo de un período (totales generales). */
export async function resumenNegocio(desde, hasta) {
  const { condiciones: cond, valores } = condiciones(desde, hasta, "c.abierta_en");
  const where = cond ? `WHERE ${cond}` : "";

  const filas = await consultar(
    `SELECT
        COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
        COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total_bruto,
        COALESCE(SUM(ds.total_descuento), 0)::FLOAT8 AS descuentos,
        COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0))
                 - COALESCE(SUM(ds.total_descuento), 0), 0)::FLOAT8 AS total_neto,
        COUNT(*)::INT AS pagos
       FROM pago pg
       JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
       LEFT JOIN (
            SELECT c2.id_cuenta, SUM(d.monto) AS total_descuento
              FROM descuento d
              JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
             GROUP BY c2.id_cuenta
       ) ds ON ds.id_cuenta = c.id_cuenta
       ${where}`,
    valores,
  );

  const propinas = await consultar(
    `SELECT COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
       FROM propina pr
      JOIN cuenta c ON c.id_cuenta = pr.id_cuenta
       ${cond ? `WHERE ${cond}` : ""}`,
    valores,
  );

  return [{
    ...filas[0],
    propinas: Number(propinas[0]?.total ?? 0),
  }];
}
