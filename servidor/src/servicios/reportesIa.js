/*
  reportesIa.js — herramientas de reportes para el asistente de Doña Pula.
  -----------------------------------------------------------------------

  El modelo (Groq) decide qué reporte quiere quien pregunta a partir de su
  mensaje libre, y con qué parámetros (por ejemplo, "esta semana" o
  "del último mes"). Aquí se ejecuta la consulta contra PostgreSQL y se
  devuelve el reporte ya armado: título, subtítulo, columnas y filas
  (las mismas estructuras que entiende el generador de PDF del cliente).

  Regla de oro: los números NUNCA los inventa el modelo; los ponen las
  consultas. El modelo solo pide la herramienta y redacta el cierre.
*/

import {
  cortesDeCaja,
  insumosBajoMinimo,
  productosAgotados,
  productosMasVendidos,
  propinasDetalle,
  propinasPorEmpleado,
  resumenNegocio,
  reservasDelPeriodo,
  ventasPorCanal,
  ventasPorDia,
  ventasPorFormaDePago,
  hoyLocal,
} from "./reportesDatos.js";
import {
  formatearDinero,
} from "./formato-reporte.js";

const MAX_FILAS_PARA_MODELO = 20;

function dinero(valor) {
  return formatearDinero(Number(valor ?? 0));
}

export function numero(valor, decimales = 0) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n.toFixed(decimales) : "0";
}

function horaMinuto(fecha) {
  const f = new Date(fecha);
  if (Number.isNaN(f.getTime())) return "";
  return f.toISOString().slice(11, 16);
}

/* -------------------------------------------------------------- periodos */

function hoyDate() {
  return new Date(`${hoyLocal()}T12:00:00`);
}

function iso(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sumarDias(fecha, dias) {
  const f = new Date(fecha);
  f.setDate(f.getDate() + dias);
  return f;
}

/**
 * Convierte un período relativo ("hoy", "esta semana", "mes pasado"...) en
 * un rango YYYY-MM-DD. Si no reconoce el período, devuelve el historial
 * completo (desde=null).
 */
export function rangoDesdePeriodo(periodo) {
  const hoy = hoyDate();

  if (periodo === "hoy") return { desde: iso(hoy), hasta: iso(hoy) };

  if (periodo === "ayer") {
    const ayer = sumarDias(hoy, -1);
    return { desde: iso(ayer), hasta: iso(ayer) };
  }

  if (periodo === "esta_semana" || periodo === "semana_actual") {
    const dia = (hoy.getDay() + 6) % 7; // lunes = 0
    const lunes = sumarDias(hoy, -dia);
    return { desde: iso(lunes), hasta: iso(hoy) };
  }

  if (periodo === "semana_pasada") {
    const dia = (hoy.getDay() + 6) % 7;
    const lunes = sumarDias(hoy, -dia - 7);
    const domingo = sumarDias(lunes, 6);
    return { desde: iso(lunes), hasta: iso(domingo) };
  }

  if (periodo === "este_mes") {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: iso(primero), hasta: iso(hoy) };
  }

  if (periodo === "mes_pasado") {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: iso(primero), hasta: iso(ultimo) };
  }

  const ultimos = {
    ultimos_7_dias: 7,
    ultimos_14_dias: 14,
    ultimos_30_dias: 30,
  };

  if (ultimos[periodo] !== undefined) {
    return { desde: iso(sumarDias(hoy, -ultimos[periodo] + 1)), hasta: iso(hoy) };
  }

  if (periodo === "todo" || periodo === "historial" || periodo === undefined) {
    return { desde: null, hasta: null };
  }

  return { desde: null, hasta: null };
}

function normalizarRango({ periodo, desde, hasta } = {}) {
  if (periodo !== undefined && periodo !== "") {
    return rangoDesdePeriodo(periodo);
  }

  const fecha = (valor) => {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
  };

  return { desde: fecha(desde), hasta: fecha(hasta) };
}

function subtituloRango({ desde, hasta }) {
  if (desde === null && hasta === null) return "Todo el historial disponible";
  if (desde !== null && hasta !== null && desde === hasta) return `Del ${desde}`;
  if (desde !== null && hasta !== null) return `Del ${desde} al ${hasta}`;
  if (desde !== null) return `Desde ${desde}`;
  return `Hasta ${hasta}`;
}

function limitar(filas, max = MAX_FILAS_PARA_MODELO) {
  return filas.length <= max ? filas : filas.slice(0, max);
}

/* ------------------------------------------------------- constructores */

function armarReporte({ titulo, subtitulo, columnas, filas, nombreArchivo }) {
  return {
    titulo,
    subtitulo,
    columnas,
    filas,
    generadoEn: new Date().toISOString(),
    nombreArchivo,
  };
}

export async function ejecutarHerramienta(nombre, args, puedeVerVentas) {
  if (!puedeVerVentas) {
    const error = new Error("Sin permiso para consultar reportes.");
    error.reporte = null;
    error.esPermiso = true;
    throw error;
  }

  const rango = normalizarRango(args);
  const subtitulo = subtituloRango(rango);

  if (nombre === "generar_reporte_ventas") {
    const filas = await ventasPorDia(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Ventas por día",
        subtitulo,
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Efectivo", alinear: "derecha" },
          { encabezado: "Tarjeta", alinear: "derecha" },
          { encabezado: "PayPal", alinear: "derecha" },
          { encabezado: "Crédito", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "Descuentos", alinear: "derecha" },
          { encabezado: "Pagos", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          f.fecha, dinero(f.efectivo), dinero(f.tarjeta), dinero(f.paypal),
          dinero(f.credito), dinero(f.total), dinero(f.descuentos), String(f.pagos),
        ]),
        nombreArchivo: "reporte_ventas_por_dia",
      }),
      datos: {
        totalGeneral: dinero(filas.reduce((suma, f) => suma + Number(f.total), 0)),
        dias: filas.length,
        recientes: limitar(filas.map((f) => ({
          fecha: f.fecha, total: dinero(f.total), pagos: f.pagos,
        }))),
      },
    };
  }

  if (nombre === "generar_reporte_productos_mas_vendidos") {
    const limite = Number.parseInt(String(args?.limite ?? 10), 10) || 10;
    const ordenarPor = args?.ordenarPor === "importe" ? "importe" : "cantidad";
    const filas = await productosMasVendidos(
      rango.desde ?? undefined,
      rango.hasta ?? undefined,
      limite,
      ordenarPor,
    );

    return {
      reporte: armarReporte({
        titulo: `Productos más vendidos${ordenarPor === "importe" ? " (por importe)" : " (por cantidad)"}`,
        subtitulo,
        columnas: [
          { encabezado: "#", alinear: "derecha" },
          { encabezado: "Producto" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Importe", alinear: "derecha" },
        ],
        filas: filas.map((f, indice) => [
          String(indice + 1), f.nombre, numero(f.cantidad), dinero(f.importe),
        ]),
        nombreArchivo: "productos_mas_vendidos",
      }),
      datos: {
        totalUnidades: numero(filas.reduce((suma, f) => suma + Number(f.cantidad), 0)),
        mejores: limitar(filas.map((f) => ({
          nombre: f.nombre, cantidad: numero(f.cantidad), importe: dinero(f.importe),
        }))),
      },
    };
  }

  if (nombre === "generar_reporte_propinas") {
    const detalle = await propinasDetalle(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Propinas",
        subtitulo,
        columnas: [
          { encabezado: "Empleado" },
          { encabezado: "Fecha" },
          { encabezado: "Cantidad", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: detalle.map((f) => [f.empleado, f.fecha, String(f.cantidad), dinero(f.total)]),
        nombreArchivo: "reporte_propinas",
      }),
      datos: {
        porEmpleado: limitar(
          (await propinasPorEmpleado(rango.desde ?? undefined, rango.hasta ?? undefined))
            .map((f) => ({ empleado: f.empleado, cantidad: f.cantidad, total: dinero(f.total) })),
        ),
      },
    };
  }

  if (nombre === "generar_reporte_formas_de_pago") {
    const filas = await ventasPorFormaDePago(rango.desde ?? undefined, rango.hasta ?? undefined);
    const total = filas.reduce((suma, f) => suma + Number(f.total), 0);

    return {
      reporte: armarReporte({
        titulo: "Ventas por forma de pago",
        subtitulo,
        columnas: [
          { encabezado: "Forma de pago" },
          { encabezado: "Pagos", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
          { encabezado: "% del total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [
          f.forma,
          String(f.pagos),
          dinero(f.total),
          total > 0 ? `${numero((Number(f.total) / total) * 100, 1)} %` : "0.0 %",
        ]),
        nombreArchivo: "ventas_por_forma_de_pago",
      }),
      datos: { total: dinero(total), formas: filas.length },
    };
  }

  if (nombre === "generar_reporte_canales") {
    const filas = await ventasPorCanal(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Ventas por canal",
        subtitulo,
        columnas: [
          { encabezado: "Canal" },
          { encabezado: "Ventas", alinear: "derecha" },
          { encabezado: "Total", alinear: "derecha" },
        ],
        filas: filas.map((f) => [f.canal, String(f.ventas), dinero(f.total)]),
        nombreArchivo: "ventas_por_canal",
      }),
      datos: {
        total: dinero(filas.reduce((suma, f) => suma + Number(f.total), 0)),
        canales: limitar(filas.map((f) => ({ canal: f.canal, total: dinero(f.total) }))),
      },
    };
  }

  if (nombre === "generar_reporte_inventario") {
    const filas = await insumosBajoMinimo();

    return {
      reporte: armarReporte({
        titulo: "Insumos bajo mínimo",
        subtitulo: "Insumos por debajo del mínimo registrado",
        columnas: [
          { encabezado: "Insumo" },
          { encabezado: "Existencia", alinear: "derecha" },
          { encabezado: "Mínimo", alinear: "derecha" },
          { encabezado: "Faltante", alinear: "derecha" },
          { encabezado: "Punto" },
        ],
        filas: filas.map((f) => [f.nombre, numero(f.existencia, 2), numero(f.minimo, 2), numero(f.faltante, 2), f.punto]),
        nombreArchivo: "insumos_bajo_minimo",
      }),
      datos: { bajoMinimo: filas.length, urgentes: limitar(filas.map((f) => f.nombre)) },
    };
  }

  if (nombre === "generar_reporte_productos_agotados") {
    const filas = await productosAgotados();

    return {
      reporte: armarReporte({
        titulo: "Productos agotados",
        subtitulo: "Productos marcados agotados/no disponibles actualmente",
        columnas: [
          { encabezado: "Producto" },
          { encabezado: "Categoría" },
          { encabezado: "Estación" },
          { encabezado: "Precio", alinear: "derecha" },
          { encabezado: "Horas agotado", alinear: "derecha" },
        ],
        filas: filas.map((f) => [f.nombre, f.categoria, f.estacion, dinero(f.precio), numero(f.horas, 1)]),
        nombreArchivo: "productos_agotados",
      }),
      datos: { agotados: filas.length },
    };
  }

  if (nombre === "generar_reporte_cortes_de_caja") {
    const filas = await cortesDeCaja(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Cortes de caja",
        subtitulo,
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
          f.fecha, dinero(f.efectivo), dinero(f.tarjeta), dinero(f.paypal),
          dinero(f.credito), dinero(f.total), dinero(f.descuentos), f.estado,
        ]),
        nombreArchivo: "cortes_de_caja",
      }),
      datos: {
        totalVentas: dinero(filas.reduce((suma, f) => suma + Number(f.total), 0)),
        cortes: filas.length,
      },
    };
  }

  if (nombre === "generar_reporte_reservas") {
    const filas = await reservasDelPeriodo(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Reservas",
        subtitulo,
        columnas: [
          { encabezado: "Fecha" },
          { encabezado: "Hora" },
          { encabezado: "Cliente" },
          { encabezado: "Personas", alinear: "derecha" },
          { encabezado: "Mesa", alinear: "derecha" },
          { encabezado: "Zona" },
          { encabezado: "Estado" },
        ],
        filas: filas.map((f) => [
          f.fecha, horaMinuto(`${f.fecha}T${f.hora}`) || f.hora, f.nombre_cliente,
          f.personas, f.mesa, f.zona, f.estado,
        ]),
        nombreArchivo: "reservas",
      }),
      datos: { total: filas.length, personas: filas.reduce((suma, f) => suma + Number(f.personas), 0) },
    };
  }

  if (nombre === "generar_reporte_resumen") {
    const [fila] = await resumenNegocio(rango.desde ?? undefined, rango.hasta ?? undefined);

    return {
      reporte: armarReporte({
        titulo: "Resumen del negocio",
        subtitulo,
        columnas: [
          { encabezado: "Métrica" },
          { encabezado: "Valor", alinear: "derecha" },
        ],
        filas: [
          ["Cuentas cobradas", String(fila.cuentas)],
          ["Total bruto", dinero(fila.total_bruto)],
          ["Descuentos", dinero(fila.descuentos)],
          ["Total neto", dinero(fila.total_neto)],
          ["Propinas", dinero(fila.propinas)],
          ["Pagos registrados", String(fila.pagos)],
        ],
        nombreArchivo: "resumen_del_negocio",
      }),
      datos: {
        cuentas: fila.cuentas,
        totalBruto: dinero(fila.total_bruto),
        totalNeto: dinero(fila.total_neto),
        propinas: dinero(fila.propinas),
      },
    };
  }

  const error = new Error(`Herramienta desconocida: ${nombre}`);
  error.reporte = null;
  throw error;
}

/* ---------------------------------------------------- herramientas IA */

const PARAMETROS_PERIODO = {
  type: "object",
  properties: {
    periodo: {
      type: "string",
      enum: ["hoy", "ayer", "esta_semana", "semana_pasada", "este_mes", "mes_pasado", "ultimos_7_dias", "ultimos_14_dias", "ultimos_30_dias", "todo"],
      description: "Período del reporte. Úsalo la mayoría de las veces.",
    },
    desde: { type: "string", description: "Fecha inicial YYYY-MM-DD, solo si el usuario dio fechas explícitas." },
    hasta: { type: "string", description: "Fecha final YYYY-MM-DD, solo si el usuario dio fechas explícitas." },
  },
};

export const HERRAMIENTAS = [
  {
    type: "function",
    function: {
      name: "generar_reporte_ventas",
      description:
        "Reporte de ventas por día: efectivo, tarjeta, PayPal, crédito, total, descuentos y pagos. Úsalo para preguntas como '¿cómo fueron las ventas de esta semana?' o 'genera el reporte de ventas del mes'.",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_productos_mas_vendidos",
      description:
        "Los productos más vendidos por cantidad o por importe facturado. Úsalo para preguntas como '¿cuáles son los platos más vendidos del mes?' o 'top 5 de la semana'.",
      parameters: {
        type: "object",
        properties: {
          periodo: PARAMETROS_PERIODO.properties.periodo,
          desde: PARAMETROS_PERIODO.properties.desde,
          hasta: PARAMETROS_PERIODO.properties.hasta,
          limite: { type: "integer", description: "Cuántos productos mostrar (por defecto 10, máximo 20)." },
          ordenarPor: { type: "string", enum: ["cantidad", "importe"], description: "Por cantidad vendida o por importe facturado (por defecto cantidad)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_propinas",
      description:
        "Propinas registradas por empleado y por fecha en un período. Úsalo para preguntas sobre propinas del equipo.",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_formas_de_pago",
      description:
        "Distribución de ventas por forma de pago (efectivo, tarjeta, PayPal y crédito), con el % del total.",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_canales",
      description:
        "Ventas agrupadas por canal: delivery, para llevar, salón. Úsalo para preguntas sobre de dónde vienen las ventas.",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_inventario",
      description:
        "Insumos por debajo del mínimo registrado, con punto de acceso y cantidad faltante.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_productos_agotados",
      description:
        "Productos marcados agotados o no disponibles actualmente en el catálogo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_cortes_de_caja",
      description:
        "Cortes de caja por fecha con efectivo, tarjeta, PayPal, crédito, total, descuentos y estado (Abierto/Cerrado).",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_reservas",
      description:
        "Reservas del período: fecha, hora, cliente, personas, mesa, zona y estado.",
      parameters: PARAMETROS_PERIODO,
    },
  },
  {
    type: "function",
    function: {
      name: "generar_reporte_resumen",
      description:
        "Resumen ejecutivo del período: cuentas cobradas, total bruto, descuentos, total neto, propinas y pagos. Úsalo para '¿cómo nos fue este mes?', 'resumen del negocio', etc.",
      parameters: PARAMETROS_PERIODO,
    },
  },
];
