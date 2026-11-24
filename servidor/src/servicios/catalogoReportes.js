/*
  catalogoReportes.js — el catálogo de reportes del sistema.
  -----------------------------------------------------------

  Cada reporte dice qué es, de qué categoría, qué consulta ejecutar y cómo
  mostrarse. Todos comparten los mismos helpers de rango y formato; el cliente
  recibe filas ya formateadas como texto, igualitos que el PDF que genera.

  Los reportes se ejecutan con CONSULTAR_REPORTES.
*/

import { consultar } from "../db/conexion.js";

const ZONA = "America/Santo_Domingo";

/* ------------------------------------------------------------- helpers */

export function rangoDeFechas(columna, desde, hasta) {
  const condiciones = [];
  const valores = [];

  if (desde) {
    valores.push(desde);
    condiciones.push(`(${columna} AT TIME ZONE '${ZONA}')::date >= $${valores.length}::date`);
  }

  if (hasta) {
    valores.push(hasta);
    condiciones.push(`(${columna} AT TIME ZONE '${ZONA}')::date <= $${valores.length}::date`);
  }

  return {
    condicionesSql: condiciones.join(" AND "),
    where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "",
    valores,
  };
}

export function dinero(numero) {
  const n = Number(numero ?? 0);
  return Number.isFinite(n)
    ? `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "RD$ 0.00";
}

export function entero(numero) {
  const n = Number(numero ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("es-DO", { maximumFractionDigits: 0 })
    : "0";
}

export function cantidad(numero, decimales = 2) {
  const n = Number(numero ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("es-DO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    : "0.00";
}

export function texto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

function subtituloRango(desde, hasta) {
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (desde) return `Desde ${desde}`;
  if (hasta) return `Hasta ${hasta}`;
  return "Todo el historial disponible";
}

function armar({ titulo, subtitulo, columnas, filas, nombreArchivo }) {
  return {
    titulo,
    subtitulo,
    columnas: columnas.map((c) => ({ encabezado: c.encabezado, alinear: c.alinear ?? "izquierda" })),
    filas,
    generadoEn: new Date().toISOString(),
    nombreArchivo,
  };
}

/* --------------------------------------------------- catálogo de reportes */

/**
 * Cada entrada: { codigo, titulo, descripcion, categoria, necesitaRango, ejecutar(desde,hasta) }
 * `ejecutar` devuelve { columnas, filas, nombreArchivo, totales? } — formato ya
 * listo para pintar y para el PDF.
 */
export const CATALOGO = [
  /* ============================== VENTAS Y CAJA ============================== */
  {
    codigo: "ventas-por-dia",
    titulo: "Ventas por día",
    descripcion: "Efectivo, tarjeta, PayPal, crédito, total, descuentos y pagos por día.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT (c.abierta_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Efectivo'), 0)::FLOAT8 AS efectivo,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Tarjeta'), 0)::FLOAT8 AS tarjeta,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'PayPal'), 0)::FLOAT8 AS paypal,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Crédito'), 0)::FLOAT8 AS credito,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total,
                COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
                COUNT(*)::INT AS pagos,
                COALESCE(SUM(ds.total_descuento), 0)::FLOAT8 AS descuentos
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           LEFT JOIN (
                SELECT c2.id_cuenta, SUM(d.monto) AS total_descuento
                  FROM descuento d JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
                 GROUP BY c2.id_cuenta) ds ON ds.id_cuenta = c.id_cuenta
           ${where}
          GROUP BY (c.abierta_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Efectivo", alinear: "derecha" },
          { encabezado: "Tarjeta", alinear: "derecha" },
          { encabezado: "PayPal", alinear: "derecha" },
          { encabezado: "Crédito", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Cuentas", alinear: "derecha" },
          { encabezado: "Ticket promedio", alinear: "derecha" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Descuentos", alinear: "derecha" },
        ],
        filas: filas.map((f) => {
          const total = Number(f.total);
          const cuentas = Number(f.cuentas) || 1;
          return [
            texto(f.fecha), dinero(f.efectivo), dinero(f.tarjeta), dinero(f.paypal),
            dinero(f.credito), dinero(f.total), entero(f.cuentas),
            dinero(total / cuentas), entero(f.pagos), dinero(f.descuentos),
          ];
        }),
        nombreArchivo: "ventas_por_dia",
      });
    },
  },

  {
    codigo: "ventas-por-forma-de-pago",
    titulo: "Ventas por forma de pago",
    descripcion: "Distribución del ingreso por efectivo, tarjeta, PayPal y crédito, con el % del total.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
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
      const total = filas.reduce((s, f) => s + Number(f.total), 0);

      return armar({
        titulo: "Ventas por forma de pago",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Forma de pago" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "% del total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.forma), entero(f.pagos), dinero(f.total),
          total > 0 ? `${cantidad((Number(f.total) / total) * 100, 1)} %` : "0.0 %",
        ]),
        nombreArchivo: "ventas_por_forma_de_pago",
      });
    },
  },

  {
    codigo: "ventas-por-canal",
    titulo: "Ventas por canal",
    descripcion: "Delivery y para llevar, con cantidad de ventas y monto.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("registrada_en", desde, hasta);
      const filas = await consultar(
        `SELECT canal,
                COUNT(*)::INT AS ventas,
                COALESCE(SUM(total), 0)::FLOAT8 AS total
           FROM venta_canal ${where}
          GROUP BY canal ORDER BY total DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por canal",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Canal" },
          { encabezado: "Ventas", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.canal), entero(f.ventas), dinero(f.total)]),
        nombreArchivo: "ventas_por_canal",
      });
    },
  },

  {
    codigo: "ventas-por-dia-semana",
    titulo: "Ventas por día de la semana",
    descripcion: "Suma de ventas agrupadas por día de la semana (lunes a domingo).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT trim(to_char(c.abierta_en AT TIME ZONE '${ZONA}', 'Day')) AS dia,
                SUM(pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total,
                COUNT(*)::INT AS pagos
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           ${where}
          GROUP BY EXTRACT(ISODOW FROM c.abierta_en AT TIME ZONE '${ZONA}'), dia
          ORDER BY EXTRACT(ISODOW FROM c.abierta_en AT TIME ZONE '${ZONA}')`,
        valores,
      );

      return armar({
        titulo: "Ventas por día de la semana",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Día" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.dia), entero(f.pagos), dinero(f.total)]),
        nombreArchivo: "ventas_por_dia_semana",
      });
    },
  },

  {
    codigo: "ventas-por-zona",
    titulo: "Ventas por zona del salón",
    descripcion: "Lo vendido según la zona de la mesa (Salón, Terraza, Familiar, VIP, Exterior).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT z.nombre AS zona,
                COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
                SUM(pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total,
                SUM(lc.importe)::FLOAT8 AS importe_consumido
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           JOIN mesa m ON m.id_mesa = c.id_mesa
           JOIN zona z ON z.id_zona = m.id_zona
           JOIN linea_cuenta lc ON lc.id_cuenta = c.id_cuenta
           ${where}
          GROUP BY z.nombre
          ORDER BY total DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por zona del salón",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Zona" },
          { encabezado: "Cuentas", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Consumo (importe)", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.zona), entero(f.cuentas), dinero(f.total), dinero(f.importe_consumido)]),
        nombreArchivo: "ventas_por_zona",
      });
    },
  },

  {
    codigo: "ventas-por-estacion",
    titulo: "Ventas por estación",
    descripcion: "Consumo registrado por estación de preparación (Parrilla, Fritura, Cocina, Horno, Barra, Postres).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT e.nombre AS estacion,
                COUNT(lc.id_linea_cuenta)::INT AS lineas,
                COALESCE(SUM(lc.importe), 0)::FLOAT8 AS importe
           FROM linea_cuenta lc
           JOIN producto p ON p.id_producto = lc.id_producto
           JOIN estacion e ON e.id_estacion = p.id_estacion
           JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
           ${where}
          GROUP BY e.nombre
          ORDER BY importe DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por estación",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estación" },
          { encabezado: "Líneas", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estacion), entero(f.lineas), dinero(f.importe)]),
        nombreArchivo: "ventas_por_estacion",
      });
    },
  },

  {
    codigo: "ticket-promedio",
    titulo: "Ticket promedio por cuenta",
    descripcion: "Promedio de una cuenta (total ÷ cuentas) por día.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT (c.abierta_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
                SUM(pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total,
                (SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)) / NULLIF(COUNT(DISTINCT c.id_cuenta), 0))::FLOAT8 AS promedio
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           ${where}
          GROUP BY (c.abierta_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Ticket promedio por cuenta",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Cuentas", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Ticket promedio", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.cuentas), dinero(f.total), dinero(f.promedio)]),
        nombreArchivo: "ticket_promedio",
      });
    },
  },

  {
    codigo: "descuentos-por-dia",
    titulo: "Descuentos por día",
    descripcion: "Descuentos y cortesías autorizados, por día.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      const cond = desde ? `(c2.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date` : null;
      if (cond) filtro.push(cond);
      if (hasta) filtro.push(`(c2.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT (c2.abierta_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS cantidad,
                SUM(d.monto)::FLOAT8 AS monto,
                SUM(d.monto) FILTER (WHERE d.tipo = 'Cortesía')::FLOAT8 AS cortesias,
                SUM(d.monto) FILTER (WHERE d.tipo = 'Descuento')::FLOAT8 AS descuentos
           FROM descuento d
           JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
           ${where}
          GROUP BY (c2.abierta_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Descuentos por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Monto total", alinear: "derecha" },
          { encabezado: "Descuentos", alinear: "derecha" },
          { encabezado: "Cortesías", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), entero(f.cantidad), dinero(f.monto),
          dinero(f.descuentos ?? 0), dinero(f.cortesias ?? 0),
        ]),
        nombreArchivo: "descuentos_por_dia",
      });
    },
  },

  {
    codigo: "ventas-de-hora",
    titulo: "Ventas por hora del día",
    descripcion: "Reparte las ventas por hora (hora pico de la jornada).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT EXTRACT(HOUR FROM c.abierta_en AT TIME ZONE '${ZONA}')::INT AS hora,
                COUNT(*)::INT AS pagos,
                SUM(pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           ${where}
          GROUP BY hora
          ORDER BY hora`,
        valores,
      );

      return armar({
        titulo: "Ventas por hora del día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Hora" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [`${entero(f.hora)}:00`, entero(f.pagos), dinero(f.total)]),
        nombreArchivo: "ventas_por_hora",
      });
    },
  },

  {
    codigo: "cortes-de-caja",
    titulo: "Cortes de caja",
    descripcion: "Cortes por fecha con efectivo, tarjeta, PayPal, crédito, total, descuentos y estado.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`c.fecha >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`c.fecha <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT c.fecha, c.efectivo_sistema::FLOAT8 AS efectivo,
                c.total_tarjeta::FLOAT8 AS tarjeta, c.total_paypal::FLOAT8 AS paypal,
                c.total_credito::FLOAT8 AS credito, c.total_ventas::FLOAT8 AS total,
                c.comprobantes::INT AS comprobantes, c.total_descuentos::FLOAT8 AS descuentos,
                c.estado
           FROM corte_caja c
           ${where}
          ORDER BY c.fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Cortes de caja",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Efectivo", alinear: "derecha" },
          { encabezado: "Tarjeta", alinear: "derecha" },
          { encabezado: "PayPal", alinear: "derecha" },
          { encabezado: "Crédito", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Descuentos", alinear: "derecha" },
          { encabezado: "Estado" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), dinero(f.efectivo), dinero(f.tarjeta), dinero(f.paypal),
          dinero(f.credito), dinero(f.total), dinero(f.descuentos), texto(f.estado),
        ]),
        nombreArchivo: "cortes_de_caja",
      });
    },
  },

  {
    codigo: "comprobantes-emitidos",
    titulo: "Comprobantes emitidos",
    descripcion: "Comprobantes fiscales emitidos por día (NCF, tipo y cliente).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT c.numero_ncf, c.tipo::text AS tipo, c.cliente,
                (c.emitido_en AT TIME ZONE '${ZONA}')::date AS fecha,
                c.total::FLOAT8 AS total, c.estado::text AS estado
           FROM comprobante c
           ${where}
          ORDER BY c.emitido_en DESC`,
        valores,
      );

      return armar({
        titulo: "Comprobantes emitidos",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "NCF" },
          { encabezado: "Tipo" },
          { encabezado: "Cliente" },
          { encabezado: "Fecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Estado" },
        ],
        filas: filas.map((f) => [texto(f.numero_ncf), texto(f.tipo), texto(f.cliente), texto(f.fecha), dinero(f.total), texto(f.estado)]),
        nombreArchivo: "comprobantes_emitidos",
      });
    },
  },

  {
    codigo: "facturas-por-tipo-ncf",
    titulo: "Facturas por tipo de comprobante",
    descripcion: "Reparte los NCF entre B01 (comprobante de crédito fiscal) y B02 (consumidor final).",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT c.tipo::text AS tipo,
                COUNT(*)::INT AS cantidad,
                COALESCE(SUM(c.total), 0)::FLOAT8 AS total
           FROM comprobante c
           ${where}
          GROUP BY c.tipo
          ORDER BY cantidad DESC`,
        valores,
      );

      return armar({
        titulo: "Facturas por tipo de comprobante",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Tipo" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.tipo), entero(f.cantidad), dinero(f.total)]),
        nombreArchivo: "facturas_por_tipo_ncf",
      });
    },
  },

  {
    codigo: "cortes-por-cajero",
    titulo: "Cortes cerrados por cajero",
    descripcion: "Cortes de caja cerrados, agrupados por el cajero que los cerró.",
    categoria: "Ventas y caja",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`c.fecha >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`c.fecha <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT COALESCE(e.nombre, 'Sin cajero registrado') AS cajero,
                COUNT(*)::INT AS cortes,
                SUM(c.total_ventas)::FLOAT8 AS total
           FROM corte_caja c
           LEFT JOIN empleado e ON e.id_empleado = c.id_cerrado_por
           ${where}
          GROUP BY e.nombre
          ORDER BY total DESC`,
        valores,
      );

      return armar({
        titulo: "Cortes cerrados por cajero",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Cajero" },
          { encabezado: "Cortes", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.cajero), entero(f.cortes), dinero(f.total)]),
        nombreArchivo: "cortes_por_cajero",
      });
    },
  },

  /* ============================== PRODUCTOS =============================== */
  {
    codigo: "productos-mas-vendidos-cantidad",
    titulo: "Productos más vendidos por cantidad",
    descripcion: "Ranking por unidades vendidas, con cantidad e importe.",
    categoria: "Productos",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT pr.nombre, pr.precio::FLOAT8 AS precio,
                SUM(lc.cantidad)::FLOAT8 AS cantidad,
                SUM(lc.importe)::FLOAT8 AS importe
           FROM linea_cuenta lc
           JOIN producto pr ON pr.id_producto = lc.id_producto
           JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
           ${where}
          GROUP BY pr.nombre, pr.precio
          ORDER BY cantidad DESC
          LIMIT 25`,
        valores,
      );

      return armar({
        titulo: "Productos más vendidos (cantidad)",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "#", alinear: "derecha" },
          { encabezado: "Producto" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
          { encabezado: "Precio", alinear: "derecha" },
        ],
        filas: filas.map((f, i) => [
          entero(i + 1), texto(f.nombre), cantidad(f.cantidad), dinero(f.importe), dinero(f.precio),
        ]),
        nombreArchivo: "productos_mas_vendidos_cantidad",
      });
    },
  },

  {
    codigo: "productos-mas-vendidos-importe",
    titulo: "Productos más vendidos por importe",
    descripcion: "Ranking por dinero facturado.",
    categoria: "Productos",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT pr.nombre,
                SUM(lc.cantidad)::FLOAT8 AS cantidad,
                SUM(lc.importe)::FLOAT8 AS importe
           FROM linea_cuenta lc
           JOIN producto pr ON pr.id_producto = lc.id_producto
           JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
           ${where}
          GROUP BY pr.nombre
          ORDER BY importe DESC
          LIMIT 25`,
        valores,
      );

      return armar({
        titulo: "Productos más vendidos (importe)",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "#", alinear: "derecha" },
          { encabezado: "Producto" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f, i) => [
          entero(i + 1), texto(f.nombre), cantidad(f.cantidad), dinero(f.importe),
        ]),
        nombreArchivo: "productos_mas_vendidos_importe",
      });
    },
  },

  {
    codigo: "productos-por-categoria-ventas",
    titulo: "Ventas por categoría de producto",
    descripcion: "Cantidad e importe agrupado por categoría del menú.",
    categoria: "Productos",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT cat.nombre AS categoria,
                SUM(lc.cantidad)::FLOAT8 AS cantidad,
                SUM(lc.importe)::FLOAT8 AS importe
           FROM linea_cuenta lc
           JOIN producto pr ON pr.id_producto = lc.id_producto
           JOIN categoria cat ON cat.id_categoria = pr.id_categoria
           JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
           ${where}
          GROUP BY cat.nombre
          ORDER BY importe DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por categoría",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Categoría" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.categoria), cantidad(f.cantidad), dinero(f.importe)]),
        nombreArchivo: "ventas_por_categoria",
      });
    },
  },

  {
    codigo: "productos-por-estacion-ventas",
    titulo: "Ventas por estación de preparación",
    descripcion: "Cantidad e importe por estación (mismo dato que en ventas, desde el lado del producto).",
    categoria: "Productos",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT e.nombre AS estacion,
                SUM(lc.cantidad)::FLOAT8 AS cantidad,
                SUM(lc.importe)::FLOAT8 AS importe
           FROM linea_cuenta lc
           JOIN producto pr ON pr.id_producto = lc.id_producto
           JOIN estacion e ON e.id_estacion = pr.id_estacion
           JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
           ${where}
          GROUP BY e.nombre
          ORDER BY importe DESC`,
        valores,
      );

      return armar({
        titulo: "Ventas por estación",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estación" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estacion), cantidad(f.cantidad), dinero(f.importe)]),
        nombreArchivo: "ventas_por_estacion_productos",
      });
    },
  },

  {
    codigo: "productos-sin-ventas",
    titulo: "Productos sin ventas en el período",
    descripcion: "Productos del menú que no vendieron en el rango elegido (candidatos a promoción o baja).",
    categoria: "Productos",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c2.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c2.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const filtroCuenta = filtro.length ? filtro.join(" AND ") : "1=1";

      const filas = await consultar(
        `SELECT pr.nombre, c.nombre AS categoria, pr.precio::FLOAT8 AS precio, pr.disponible
           FROM producto pr
           JOIN categoria c ON c.id_categoria = pr.id_categoria
          WHERE NOT EXISTS (
                  SELECT 1 FROM linea_cuenta lc
                    JOIN cuenta c2 ON c2.id_cuenta = lc.id_cuenta
                   WHERE lc.id_producto = pr.id_producto
                     AND (${filtroCuenta})
               )
          ORDER BY pr.disponible DESC, c.nombre, pr.nombre
          LIMIT 100`,
        valores,
      );

      return armar({
        titulo: "Productos sin ventas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Producto" },
          { encabezado: "Categoría" },
          { encabezado: "Precio", alinear: "derecha" },
          { encabezado: "Disponible" },
        ],
        filas: filas.map((f) => [
          texto(f.nombre), texto(f.categoria), dinero(f.precio),
          f.disponible ? "Sí" : "No",
        ]),
        nombreArchivo: "productos_sin_ventas",
      });
    },
  },

  {
    codigo: "precio-promedio-por-categoria",
    titulo: "Precio promedio por categoría",
    descripcion: "Precio medio del catálogo agrupado por categoría.",
    categoria: "Productos",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT c.nombre AS categoria,
                COUNT(*)::INT AS productos,
                AVG(p.precio)::FLOAT8 AS precio_promedio,
                MIN(p.precio)::FLOAT8 AS precio_minimo,
                MAX(p.precio)::FLOAT8 AS precio_maximo
           FROM producto p
           JOIN categoria c ON c.id_categoria = p.id_categoria
          WHERE p.activo
          GROUP BY c.nombre
          ORDER BY precio_promedio DESC`,
        [],
      );

      return armar({
        titulo: "Precio promedio por categoría",
        subtitulo: "Catálogo actual",
        columnas: [
          { encabezado: "Categoría" },
          { encabezado: "Productos", alinear: "derecha" },
          { encabezado: "Precio promedio", alinear: "derecha" },
          { encabezado: "Precio mínimo", alinear: "derecha" },
          { encabezado: "Precio máximo", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.categoria), entero(f.productos), dinero(f.precio_promedio),
          dinero(f.precio_minimo), dinero(f.precio_maximo),
        ]),
        nombreArchivo: "precio_promedio_por_categoria",
      });
    },
  },

  {
    codigo: "productos-agotados",
    titulo: "Productos agotados",
    descripcion: "Productos marcados agotados o no disponibles actualmente.",
    categoria: "Productos",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT p.nombre, c.nombre AS categoria, e.nombre AS estacion,
                p.precio::FLOAT8 AS precio,
                ROUND(EXTRACT(EPOCH FROM (now() - p.modificado_en)) / 3600, 2)::FLOAT8 AS horas
           FROM producto p
           JOIN categoria c ON c.id_categoria = p.id_categoria
           JOIN estacion e  ON e.id_estacion  = p.id_estacion
          WHERE p.activo AND p.disponible = FALSE
          ORDER BY p.modificado_en`,
        [],
      );

      return armar({
        titulo: "Productos agotados",
        subtitulo: "Actualmente sin disponibilidad",
        columnas: [
          { encabezado: "Producto" },
          { encabezado: "Categoría" },
          { encabezado: "Estación" },
          { encabezado: "Precio", alinear: "derecha" },
          { encabezado: "Horas agotado", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.nombre), texto(f.categoria), texto(f.estacion),
          dinero(f.precio), cantidad(f.horas, 1),
        ]),
        nombreArchivo: "productos_agotados",
      });
    },
  },
  /* ============================== COCINA Y COMANDAS ========================= */
  {
    codigo: "comandas-por-estacion",
    titulo: "Comandas por estación y estado",
    descripcion: "Cuántas comandas pasó cada estación y cómo quedaron (Cerrada/Preparado).",
    categoria: "Cocina y comandas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.enviada_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.enviada_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT e.nombre AS estacion, c.estado,
                COUNT(*)::INT AS comandas,
                AVG(EXTRACT(EPOCH FROM (c.cerrada_en - c.enviada_en)) / 60)::NUMERIC(10,2) AS minutos_promedio
           FROM comanda c
           JOIN estacion e ON e.id_estacion = c.id_estacion
           ${where}
          GROUP BY e.nombre, c.estado
          ORDER BY e.nombre, c.estado`,
        valores,
      );

      return armar({
        titulo: "Comandas por estación y estado",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estación" },
          { encabezado: "Estado" },
          { encabezado: "Comandas", alinear: "derecha" },
          { encabezado: "Minutos promedio", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.estacion), texto(f.estado), entero(f.comandas), cantidad(f.minutos_promedio, 1),
        ]),
        nombreArchivo: "comandas_por_estacion",
      });
    },
  },

  {
    codigo: "tiempo-prep-promedio",
    titulo: "Tiempo promedio de preparación por estación",
    descripcion: "Minutos desde que se envió la comanda hasta que se cerró, por estación.",
    categoria: "Cocina y comandas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.enviada_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.enviada_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT e.nombre AS estacion,
                COUNT(*)::INT AS comandas,
                AVG(EXTRACT(EPOCH FROM (c.cerrada_en - c.enviada_en)) / 60)::NUMERIC(10,2) AS minutos_promedio,
                MIN(EXTRACT(EPOCH FROM (c.cerrada_en - c.enviada_en)) / 60)::NUMERIC(10,2) AS minutos_minimo,
                MAX(EXTRACT(EPOCH FROM (c.cerrada_en - c.enviada_en)) / 60)::NUMERIC(10,2) AS minutos_maximo
           FROM comanda c
           JOIN estacion e ON e.id_estacion = c.id_estacion
           ${where}
          GROUP BY e.nombre
          ORDER BY minutos_promedio DESC`,
        valores,
      );

      return armar({
        titulo: "Tiempo de preparación por estación",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estación" },
          { encabezado: "Comandas", alinear: "derecha" },
          { encabezado: "Minutos promedio", alinear: "derecha" },
          { encabezado: "Mínimo", alinear: "derecha" },
          { encabezado: "Máximo", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.estacion), entero(f.comandas), cantidad(f.minutos_promedio, 1),
          cantidad(f.minutos_minimo, 1), cantidad(f.minutos_maximo, 1),
        ]),
        nombreArchivo: "tiempo_prep_estacion",
      });
    },
  },

  {
    codigo: "comandas-anuladas",
    titulo: "Líneas anuladas",
    descripcion: "Líneas de pedido anuladas con la cantidad, el monto y el motivo, por día.",
    categoria: "Cocina y comandas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(lp.creado_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(lp.creado_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT (lp.creado_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS lineas,
                SUM(lp.cantidad)::FLOAT8 AS cantidad,
                SUM(lp.precio_unitario * lp.cantidad)::FLOAT8 AS importe
           FROM linea_pedido lp
          WHERE lp.estado = 'Anulada'
           ${where ? `AND ${filtro.join(" AND ")}` : ""}
          GROUP BY (lp.creado_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Líneas anuladas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Líneas", alinear: "derecha" },
          { encabezado: "Cantidad anulada", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), entero(f.lineas), cantidad(f.cantidad), dinero(f.importe),
        ]),
        nombreArchivo: "lineas_anuladas",
      });
    },
  },

  {
    codigo: "comandas-por-mesa",
    titulo: "Comandas por mesa",
    descripcion: "Cuántas comandas generó cada mesa y cuánto consumieron en importe.",
    categoria: "Cocina y comandas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT m.numero AS mesa,
                z.nombre AS zona,
                COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
                COALESCE(SUM(lc.importe), 0)::FLOAT8 AS importe
           FROM cuenta c
           JOIN mesa m ON m.id_mesa = c.id_mesa
           JOIN zona z ON z.id_zona = m.id_zona
           JOIN linea_cuenta lc ON lc.id_cuenta = c.id_cuenta
           ${where}
          GROUP BY m.numero, z.nombre
          ORDER BY importe DESC`,
        valores,
      );

      return armar({
        titulo: "Consumo por mesa",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Mesa" },
          { encabezado: "Zona" },
          { encabezado: "Cuentas", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          entero(f.mesa), texto(f.zona), entero(f.cuentas), dinero(f.importe),
        ]),
        nombreArchivo: "comandas_por_mesa",
      });
    },
  },

  {
    codigo: "comandas-preparadas-hoy",
    titulo: "Comandas preparadas hoy",
    descripcion: "Comandas cerradas durante hoy (si hoy no hubo servicio, muestra todas).",
    categoria: "Cocina y comandas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.cerrada_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.cerrada_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT e.nombre AS estacion,
                COUNT(*)::INT AS comandas,
                SUM(CASE WHEN c.estado = 'Cerrada' THEN 1 ELSE 0 END)::INT AS cerradas
           FROM comanda c
           JOIN estacion e ON e.id_estacion = c.id_estacion
           ${where}
          GROUP BY e.nombre
          ORDER BY comandas DESC`,
        valores,
      );

      return armar({
        titulo: "Comandas preparadas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estación" },
          { encabezado: "Comandas", alinear: "derecha" },
          { encabezado: "Cerradas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.estacion), entero(f.comandas), entero(f.cerradas),
        ]),
        nombreArchivo: "comandas_preparadas",
      });
    },
  },

  {
    codigo: "cocina-estado-lineas",
    titulo: "Estado de las líneas de pedido",
    descripcion: "Cuántas líneas hay en cada estado del ciclo (Borrador, Guardada, Enviada, Anulada).",
    categoria: "Cocina y comandas",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT lp.estado::text AS estado,
                COUNT(*)::INT AS lineas,
                SUM(lp.cantidad)::FLOAT8 AS cantidad
           FROM linea_pedido lp
          GROUP BY lp.estado
          ORDER BY lp.estado`,
        [],
      );

      return armar({
        titulo: "Estado de las líneas de pedido",
        subtitulo: "Todo el ciclo de cocina",
        columnas: [
          { encabezado: "Estado" },
          { encabezado: "Líneas", alinear: "derecha" },
          { encabezado: "Cantidad", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estado), entero(f.lineas), cantidad(f.cantidad)]),
        nombreArchivo: "estado_lineas_pedido",
      });
    },
  },

  /* ============================== PROPINAS ============================= */
  {
    codigo: "propinas-por-empleado",
    titulo: "Propinas por empleado (total)",
    descripcion: "Suma de propinas y cantidad de registros por empleado.",
    categoria: "Propinas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("pr.registrada_en", desde, hasta);
      const filas = await consultar(
        `SELECT e.nombre AS empleado,
                COUNT(*)::INT AS registros,
                COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
           FROM propina pr
           JOIN empleado e ON e.id_empleado = pr.id_empleado
           ${where}
          GROUP BY e.nombre
          ORDER BY total DESC`,
        valores,
      );

      return armar({
        titulo: "Propinas por empleado",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Empleado" },
          { encabezado: "Registros", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.empleado), entero(f.registros), dinero(f.total)]),
        nombreArchivo: "propinas_por_empleado",
      });
    },
  },

  {
    codigo: "propinas-por-dia",
    titulo: "Propinas por día",
    descripcion: "Propinas sumadas día a día, con su forma de pago principal.",
    categoria: "Propinas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("pr.registrada_en", desde, hasta);
      const filas = await consultar(
        `SELECT (pr.registrada_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total,
                COUNT(*)::INT AS registros
           FROM propina pr
           ${where}
          GROUP BY (pr.registrada_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Propinas por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Registros", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.registros), dinero(f.total)]),
        nombreArchivo: "propinas_por_dia",
      });
    },
  },

  {
    codigo: "propina-vs-ventas",
    titulo: "Propinas vs ventas (%)",
    descripcion: "Propinas del día expresadas como porcentaje de las ventas del mismo día.",
    categoria: "Propinas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const valores = [];
      const d = desde ? `(c.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date` : null;
      const h = hasta ? `(c.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date` : null;
      const filtro = [d, h].filter(Boolean);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT (c.abierta_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS ventas,
                COALESCE(SUM(pr.monto), 0)::FLOAT8 AS propinas,
                (COALESCE(SUM(pr.monto), 0) / NULLIF(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0) * 100)::NUMERIC(10,2) AS porcentaje
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           LEFT JOIN propina pr
             ON pr.id_cuenta = c.id_cuenta
           ${where}
          GROUP BY (c.abierta_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Propinas vs ventas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Ventas", alinear: "derecha" },
          { encabezado: "Propinas", alinear: "derecha" },
          { encabezado: "% Propina", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), dinero(f.ventas), dinero(f.propinas),
          `${cantidad(f.porcentaje, 2)} %`,
        ]),
        nombreArchivo: "propina_vs_ventas",
      });
    },
  },

  {
    codigo: "propinas-por-forma-de-pago",
    titulo: "Propinas por forma de pago",
    descripcion: "Distribución de las propinas por forma de pago.",
    categoria: "Propinas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("pr.registrada_en", desde, hasta);
      const filas = await consultar(
        `SELECT pr.forma::text AS forma,
                COUNT(*)::INT AS registros,
                COALESCE(SUM(pr.monto), 0)::FLOAT8 AS total
           FROM propina pr
           ${where}
          GROUP BY pr.forma
          ORDER BY total DESC`,
        valores,
      );

      return armar({
        titulo: "Propinas por forma de pago",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Forma" },
          { encabezado: "Registros", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.forma), entero(f.registros), dinero(f.total)]),
        nombreArchivo: "propinas_por_forma_de_pago",
      });
    },
  },

  {
    codigo: "cierre-propinas-detalle",
    titulo: "Conciliación de propinas",
    descripcion: "Esperado vs contado por empleado y fecha, con la diferencia.",
    categoria: "Propinas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`cp.fecha >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`cp.fecha <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT e.nombre AS empleado, cp.fecha,
                cp.esperado::FLOAT8 AS esperado,
                cp.contado::FLOAT8 AS contado,
                cp.diferencia::FLOAT8 AS diferencia
           FROM cierre_propina cp
           JOIN empleado e ON e.id_empleado = cp.id_empleado
           ${where}
          ORDER BY cp.fecha DESC, e.nombre`,
        valores,
      );

      return armar({
        titulo: "Conciliación de propinas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Empleado" },
          { encabezado: "Fecha" },
          { encabezado: "Esperado", alinear: "derecha" },
          { encabezado: "Contado", alinear: "derecha" },
          { encabezado: "Diferencia", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.empleado), texto(f.fecha), dinero(f.esperado),
          dinero(f.contado), dinero(f.diferencia),
        ]),
        nombreArchivo: "cierre_propinas",
      });
    },
  },

  /* ============================== INVENTARIO ============================= */
  {
    codigo: "insumos-bajo-minimo",
    titulo: "Insumos bajo mínimo",
    descripcion: "Existencia, mínimo, faltante y punto de acceso de los insumos críticos.",
    categoria: "Inventario",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT nombre, minimo::FLOAT8 AS minimo, existencia::FLOAT8 AS existencia,
                punto, faltante::FLOAT8 AS faltante
           FROM v_insumos_bajo_minimo
          ORDER BY faltante DESC`,
        [],
      );

      return armar({
        titulo: "Insumos bajo mínimo",
        subtitulo: "Insumos por debajo del mínimo registrado",
        columnas: [
          { encabezado: "Insumo" },
          { encabezado: "Existencia", alinear: "derecha" },
          { encabezado: "Mínimo", alinear: "derecha" },
          { encabezado: "Faltante", alinear: "derecha" },
          { encabezado: "Punto" },
        ],
        filas: filas.map((f) => [
          texto(f.nombre), cantidad(f.existencia), cantidad(f.minimo),
          cantidad(f.faltante), texto(f.punto),
        ]),
        nombreArchivo: "insumos_bajo_minimo",
      });
    },
  },

  {
    codigo: "existencias-por-punto",
    titulo: "Existencias por punto de acceso",
    descripcion: "Suma de existencia por Almacén, Cocina y Barra, con la cantidad de ítems distintos.",
    categoria: "Inventario",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT pa.nombre AS punto,
                COUNT(*)::INT AS insumos,
                COALESCE(SUM(e.existencia), 0)::FLOAT8 AS existencia_total
           FROM existencia e
           JOIN punto_acceso pa ON pa.id_punto = e.id_punto
          GROUP BY pa.nombre
          ORDER BY existencia_total DESC`,
        [],
      );

      return armar({
        titulo: "Existencias por punto de acceso",
        subtitulo: "Sumatoria actual",
        columnas: [
          { encabezado: "Punto" },
          { encabezado: "Insumos", alinear: "derecha" },
          { encabezado: "Existencia total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          texto(f.punto), entero(f.insumos), cantidad(f.existencia_total),
        ]),
        nombreArchivo: "existencias_por_punto",
      });
    },
  },

  {
    codigo: "movimientos-por-tipo",
    titulo: "Movimientos de inventario por tipo",
    descripcion: "Cantidad y suma de movimientos de entrada/salida/ajuste, agrupados por tipo.",
    categoria: "Inventario",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("m.ocurrido_en", desde, hasta);
      const filas = await consultar(
        `SELECT m.tipo::text AS tipo,
                COUNT(*)::INT AS movimientos,
                COALESCE(SUM(m.cantidad), 0)::FLOAT8 AS cantidad_total
           FROM movimiento_inventario m
           ${where}
          GROUP BY m.tipo
          ORDER BY cantidad_total DESC`,
        valores,
      );

      return armar({
        titulo: "Movimientos de inventario por tipo",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Tipo de movimiento" },
          { encabezado: "Movimientos", alinear: "derecha" },
          { encabezado: "Cantidad total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.tipo), entero(f.movimientos), cantidad(f.cantidad_total)]),
        nombreArchivo: "movimientos_por_tipo",
      });
    },
  },

  {
    codigo: "movimientos-por-dia",
    titulo: "Movimientos de inventario por día",
    descripcion: "Movimientos agrupados por día, con fecha y cantidad total.",
    categoria: "Inventario",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("m.ocurrido_en", desde, hasta);
      const filas = await consultar(
        `SELECT (m.ocurrido_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS movimientos,
                COALESCE(SUM(m.cantidad), 0)::FLOAT8 AS cantidad_total
           FROM movimiento_inventario m
           ${where}
          GROUP BY (m.ocurrido_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Movimientos de inventario por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Movimientos", alinear: "derecha" },
          { encabezado: "Cantidad total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.movimientos), cantidad(f.cantidad_total)]),
        nombreArchivo: "movimientos_por_dia",
      });
    },
  },

  {
    codigo: "compras-por-proveedor",
    titulo: "Compras acumuladas por proveedor",
    descripcion: "Lo comprado por proveedor (suma de entradas de compra).",
    categoria: "Inventario",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(m.ocurrido_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(m.ocurrido_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT p.nombre AS proveedor,
                COUNT(*)::INT AS compras,
                COALESCE(SUM(m.cantidad), 0)::FLOAT8 AS cantidad
           FROM movimiento_inventario m
           JOIN proveedor p ON p.id_proveedor = m.id_proveedor
           ${where}
             AND m.tipo = 'Entrada de compra'
          GROUP BY p.nombre
          ORDER BY cantidad DESC`,
        valores,
      );

      return armar({
        titulo: "Compras por proveedor",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Proveedor" },
          { encabezado: "Compras", alinear: "derecha" },
          { encabezado: "Cantidad", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.proveedor), entero(f.compras), cantidad(f.cantidad)]),
        nombreArchivo: "compras_por_proveedor",
      });
    },
  },

  /* ============================== RESERVAS ============================== */
  {
    codigo: "reservas-por-estado",
    titulo: "Reservas por estado",
    descripcion: "Cuántas reservas están en cada estado (Abierta / Cancelada).",
    categoria: "Reservas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("r.fecha", desde, hasta);
      const filas = await consultar(
        `SELECT r.estado::text AS estado, COUNT(*)::INT AS reservas
           FROM reserva r
           ${where}
          GROUP BY r.estado
          ORDER BY reservas DESC`,
        valores,
      );

      return armar({
        titulo: "Reservas por estado",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Estado" },
          { encabezado: "Reservas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estado), entero(f.reservas)]),
        nombreArchivo: "reservas_por_estado",
      });
    },
  },

  {
    codigo: "reservas-por-dia",
    titulo: "Reservas por día",
    descripcion: "Reservas agrupadas por día (cantidad y personas).",
    categoria: "Reservas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("r.fecha", desde, hasta);
      const filas = await consultar(
        `SELECT r.fecha,
                COUNT(*)::INT AS reservas,
                SUM(r.personas)::INT AS personas
           FROM reserva r
           ${where}
          GROUP BY r.fecha
          ORDER BY r.fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Reservas por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Reservas", alinear: "derecha" },
          { encabezado: "Personas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.reservas), entero(f.personas)]),
        nombreArchivo: "reservas_por_dia",
      });
    },
  },

  {
    codigo: "reservas-por-mesa",
    titulo: "Reservas por mesa",
    descripcion: "Mesas más reservadas con su consumo y zona.",
    categoria: "Reservas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("r.fecha", desde, hasta);
      const filas = await consultar(
        `SELECT m.numero AS mesa, z.nombre AS zona,
                COUNT(*)::INT AS reservas,
                SUM(r.personas)::INT AS personas
           FROM reserva r
           JOIN mesa m ON m.id_mesa = r.id_mesa
           JOIN zona z ON z.id_zona = m.id_zona
           ${where}
          GROUP BY m.numero, z.nombre
          ORDER BY reservas DESC`,
        valores,
      );

      return armar({
        titulo: "Reservas por mesa",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Mesa" },
          { encabezado: "Zona" },
          { encabezado: "Reservas", alinear: "derecha" },
          { encabezado: "Personas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          entero(f.mesa), texto(f.zona), entero(f.reservas), entero(f.personas),
        ]),
        nombreArchivo: "reservas_por_mesa",
      });
    },
  },

  {
    codigo: "reservas-por-mesero",
    titulo: "Reservas por mesero",
    descripcion: "Reservas asignadas a cada mesero, con personas total.",
    categoria: "Reservas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("r.fecha", desde, hasta);
      const filas = await consultar(
        `SELECT COALESCE(e.nombre, 'Sin asignar') AS mesero,
                COUNT(*)::INT AS reservas,
                SUM(r.personas)::INT AS personas
           FROM reserva r
           LEFT JOIN empleado e ON e.id_empleado = r.id_mesero_asignado
           ${where}
          GROUP BY e.nombre
          ORDER BY reservas DESC`,
        valores,
      );

      return armar({
        titulo: "Reservas por mesero",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Mesero" },
          { encabezado: "Reservas", alinear: "derecha" },
          { encabezado: "Personas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.mesero), entero(f.reservas), entero(f.personas)]),
        nombreArchivo: "reservas_por_mesero",
      });
    },
  },

  {
    codigo: "reservas-canceladas",
    titulo: "Reservas canceladas (detalle)",
    descripcion: "Detalle de las reservas canceladas: fecha, cliente, personas, mesa y motivo.",
    categoria: "Reservas",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("r.fecha", desde, hasta);
      const filas = await consultar(
        `SELECT r.fecha, r.hora::text AS hora, r.nombre_cliente, r.personas,
                z.nombre AS zona, m.numero AS mesa, r.motivo_cancelacion
           FROM reserva r
           JOIN mesa m ON m.id_mesa = r.id_mesa
           JOIN zona z ON z.id_zona = m.id_zona
           ${where ? `WHERE r.estado = 'Cancelada' AND ${where.slice(6)}` : "WHERE r.estado = 'Cancelada'"}
          ORDER BY r.fecha DESC, r.hora DESC`,
        valores,
      );

      return armar({
        titulo: "Reservas canceladas",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Hora" },
          { encabezado: "Cliente" },
          { encabezado: "Personas", alinear: "derecha" },
          { encabezado: "Mesa", alinear: "derecha" },
          { encabezado: "Zona" },
          { encabezado: "Motivo" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), texto(f.hora?.slice(0, 5)), texto(f.nombre_cliente),
          entero(f.personas), entero(f.mesa), texto(f.zona), texto(f.motivo_cancelacion ?? ""),
        ]),
        nombreArchivo: "reservas_canceladas",
      });
    },
  },

  /* ============================== PERSONAL ============================= */
  {
    codigo: "empleados-por-rol",
    titulo: "Empleados por rol",
    descripcion: "Cuántos empleados activos hay en cada rol del sistema.",
    categoria: "Personal",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT r.codigo AS rol,
                r.nombre AS rol_nombre,
                COUNT(e.id_empleado)::INT AS empleados
           FROM rol r
           LEFT JOIN empleado e ON e.id_rol = r.id_rol AND e.estado = 'Activo'
          GROUP BY r.codigo, r.nombre
          ORDER BY empleados DESC, r.codigo`,
        [],
      );

      return armar({
        titulo: "Empleados por rol",
        subtitulo: "Empleados activos al momento",
        columnas: [
          { encabezado: "Rol" },
          { encabezado: "Área" },
          { encabezado: "Empleados", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.rol_nombre), texto(f.rol), entero(f.empleados)]),
        nombreArchivo: "empleados_por_rol",
      });
    },
  },

  {
    codigo: "usuarios-por-estado",
    titulo: "Usuarios del sistema por estado",
    descripcion: "Cuentas de acceso agrupadas por estado (Activo/Inactivo/Bloqueado).",
    categoria: "Personal",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT u.estado::text AS estado, COUNT(*)::INT AS usuarios
           FROM usuario u
          GROUP BY u.estado
          ORDER BY usuarios DESC`,
        [],
      );

      return armar({
        titulo: "Usuarios del sistema por estado",
        subtitulo: "Todas las cuentas, incluyendo la administración",
        columnas: [
          { encabezado: "Estado" },
          { encabezado: "Usuarios", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estado), entero(f.usuarios)]),
        nombreArchivo: "usuarios_por_estado",
      });
    },
  },

  /* ========================== RESUMEN EJECUTIVO ======================== */
  {
    codigo: "resumen-del-periodo",
    titulo: "Resumen ejecutivo del período",
    descripcion: "Cuentas, bruto, neto, descuentos, propinas, ticket promedio y pagos.",
    categoria: "Resumen ejecutivo",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.abierta_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const [fila] = await consultar(
        `SELECT
            COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
            COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS bruto,
            COALESCE(SUM(ds.total_descuento), 0)::FLOAT8 AS descuentos,
            (COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)
             - COALESCE(SUM(ds.total_descuento), 0))::FLOAT8 AS neto,
            COALESCE(SUM(pr.monto), 0)::FLOAT8 AS propinas,
            COUNT(*)::INT AS pagos,
            (COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)
             / NULLIF(COUNT(DISTINCT c.id_cuenta), 0))::FLOAT8 AS ticket
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           LEFT JOIN (
                SELECT c2.id_cuenta, SUM(d.monto) AS total_descuento
                  FROM descuento d JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
                 GROUP BY c2.id_cuenta) ds ON ds.id_cuenta = c.id_cuenta
           LEFT JOIN propina pr ON pr.id_cuenta = c.id_cuenta
           ${where}`,
        valores,
      );

      return armar({
        titulo: "Resumen ejecutivo",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Métrica" },
          { encabezado: "Valor", alinear: "derecha" },
        ],
        filas: [
          ["Cuentas cobradas", entero(fila.cuentas)],
          ["Total bruto", dinero(fila.bruto)],
          ["Descuentos", dinero(fila.descuentos)],
          ["Total neto", dinero(fila.neto)],
          ["Propinas", dinero(fila.propinas)],
          ["Pagos registrados", entero(fila.pagos)],
          ["Ticket promedio", dinero(fila.ticket)],
        ],
        nombreArchivo: "resumen_ejecutivo",
      });
    },
  },

  {
    codigo: "resumen-mensual",
    titulo: "Resumen por mes",
    descripcion: "Ventas y pagos agrupados por mes.",
    categoria: "Resumen ejecutivo",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT to_char((c.abierta_en AT TIME ZONE '${ZONA}')::date, 'YYYY-MM') AS mes,
                COUNT(DISTINCT c.id_cuenta)::INT AS cuentas,
                COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total,
                COUNT(*)::INT AS pagos
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           ${where}
          GROUP BY mes
          ORDER BY mes DESC`,
        valores,
      );

      return armar({
        titulo: "Resumen mensual",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Mes" },
          { encabezado: "Cuentas", alinear: "derecha" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.mes), entero(f.cuentas), entero(f.pagos), dinero(f.total)]),
        nombreArchivo: "resumen_mensual",
      });
    },
  },

  {
    codigo: "ventas-acumuladas",
    titulo: "Ventas acumuladas por día",
    descripcion: "Ventas diarias y el acumulado desde el inicio del período.",
    categoria: "Resumen ejecutivo",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("c.abierta_en", desde, hasta);
      const filas = await consultar(
        `SELECT dia::date AS fecha, total, SUM(total) OVER (ORDER BY dia)::FLOAT8 AS acumulado
           FROM (
             SELECT (c.abierta_en AT TIME ZONE '${ZONA}')::date AS dia,
                    COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total
               FROM pago pg
               JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
               ${where}
              GROUP BY (c.abierta_en AT TIME ZONE '${ZONA}')::date
           ) t
          ORDER BY dia`,
        valores,
      );

      return armar({
        titulo: "Ventas acumuladas por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Total del día", alinear: "derecha" },
          { encabezado: "Acumulado", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), dinero(f.total), dinero(f.acumulado)]),
        nombreArchivo: "ventas_acumuladas",
      });
    },
  },

  {
    codigo: "ocupacion-mesas",
    titulo: "Ocupación de mesas ahora",
    descripcion: "Estado actual de las 36 mesas: libres, ocupadas, limpieza y reservadas.",
    categoria: "Resumen ejecutivo",
    necesitaRango: false,
    ejecutar: async () => {
      const filas = await consultar(
        `SELECT m.estado::text AS estado, COUNT(*)::INT AS mesas
           FROM mesa m
          GROUP BY m.estado
          ORDER BY m.estado`,
        [],
      );

      return armar({
        titulo: "Ocupación de mesas",
        subtitulo: "Estado actual del salón",
        columnas: [
          { encabezado: "Estado" },
          { encabezado: "Mesas", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.estado), entero(f.mesas)]),
        nombreArchivo: "ocupacion_mesas",
      });
    },
  },

  {
    codigo: "facturas-emitidas-por-dia",
    titulo: "Facturas emitidas por día",
    descripcion: "Cantidad de comprobantes y su total por día.",
    categoria: "Resumen ejecutivo",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const filtro = [];
      const valores = [];
      if (desde) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date >= $${valores.push(desde)}::date`);
      if (hasta) filtro.push(`(c.emitido_en AT TIME ZONE '${ZONA}')::date <= $${valores.push(hasta)}::date`);
      const where = filtro.length ? `WHERE ${filtro.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT (c.emitido_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS comprobantes,
                COALESCE(SUM(c.total), 0)::FLOAT8 AS total
           FROM comprobante c
           ${where}
          GROUP BY (c.emitido_en AT TIME ZONE '${ZONA}')::date
          ORDER BY fecha DESC`,
        valores,
      );

      return armar({
        titulo: "Facturas emitidas por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Comprobantes", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.comprobantes), dinero(f.total)]),
        nombreArchivo: "facturas_emitidas_por_dia",
      });
    },
  },

  /* ============================== BITÁCORA ============================== */
  {
    codigo: "bitacora-por-mes",
    titulo: "Bitácora de auditoría por mes",
    descripcion: "Registros de auditoría agrupados por mes (estado actual: las acciones guardan como «Otro» — validar resaltó 'Otro' al ejecutar).",
    categoria: "Bitácora",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("b.ocurrido_en", desde, hasta);
      const filas = await consultar(
        `SELECT to_char(date_trunc('month', (b.ocurrido_en AT TIME ZONE '${ZONA}')), 'YYYY-MM') AS mes,
                COUNT(*)::INT AS registros
           FROM bitacora b
           ${where}
          GROUP BY 1
          ORDER BY mes`,
        valores,
      );

      return armar({
        titulo: "Bitácora de auditoría por mes",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Mes" },
          { encabezado: "Registros", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.mes), entero(f.registros)]),
        nombreArchivo: "bitacora_por_mes",
      });
    },
  },

  {
    codigo: "bitacora-por-fecha",
    titulo: "Bitácora de auditoría por día",
    descripcion: "Registros de auditoría agrupados por día.",
    categoria: "Bitácora",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("b.ocurrido_en", desde, hasta);
      const filas = await consultar(
        `SELECT (b.ocurrido_en AT TIME ZONE '${ZONA}')::date AS fecha,
                COUNT(*)::INT AS registros
           FROM bitacora b
           ${where}
          GROUP BY 1
          ORDER BY fecha`,
        valores,
      );

      return armar({
        titulo: "Bitácora de auditoría por día",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Registros", alinear: "derecha" },
        ],
        filas: filas.map((f) => [texto(f.fecha), entero(f.registros)]),
        nombreArchivo: "bitacora_por_fecha",
      });
    },
  },

  {
    codigo: "bitacora-detalle",
    titulo: "Bitácora de auditoría (detalle)",
    descripcion: "Últimos 50 registros de auditoría: fecha, hora, usuario, acción, detalle y tabla afectada.",
    categoria: "Bitácora",
    necesitaRango: true,
    ejecutar: async (desde, hasta) => {
      const { where, valores } = rangoDeFechas("b.ocurrido_en", desde, hasta);
      const filas = await consultar(
        `SELECT (b.ocurrido_en AT TIME ZONE '${ZONA}')::date AS fecha,
                trim(to_char(b.ocurrido_en AT TIME ZONE '${ZONA}', 'HH24:MI:SS')) AS hora,
                b.usuario_nombre AS usuario,
                b.accion,
                b.detalle,
                b.tabla_afectada AS tabla
           FROM bitacora b
           ${where}
          ORDER BY b.ocurrido_en DESC
          LIMIT 50`,
        valores,
      );

      return armar({
        titulo: "Bitácora de auditoría (detalle)",
        subtitulo: subtituloRango(desde, hasta),
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Hora" },
          { encabezado: "Usuario" },
          { encabezado: "Acción" },
          { encabezado: "Detalle" },
          { encabezado: "Tabla" },
        ],
        filas: filas.map((f) => [
          texto(f.fecha), texto(f.hora), texto(f.usuario), texto(f.accion),
          texto(f.detalle), texto(f.tabla),
        ]),
        nombreArchivo: "bitacora_detalle",
      });
    },
  },
];

export default CATALOGO;

