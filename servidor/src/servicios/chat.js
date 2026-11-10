/*
  servicios/chat.js — el chatbot de Doña Pula (Fase 8).
  -------------------------------------------------------

  Pregunta sobre el menú (productos, precios, disponibilidad) y, si el rol
  tiene permiso, sobre las ventas.

  Tres reglas que no se negocian:

    · SOLO CONSULTA. Aquí no se escribe nada en la base: el servicio solo lee.
    · Los datos salen de PostgreSQL, no de la memoria del modelo. Al modelo se
      le pasa el menú y, si corresponde, las ventas del día; él solo redacta la
      respuesta.
    · Las ventas solo se le enseñan a quien tiene CONSULTAR_REPORTES. Si el rol no
      lo tiene, el modelo ni se entera de que existen.
*/

import { consultar } from "../db/conexion.js";
import { completarConGroq, leerConfigGroq } from "./groq.js";

/** La configuración del proveedor compartido con el asistente de sugerencias. */
export function leerConfigChat(entorno = process.env) {
  return leerConfigGroq(entorno);
}

/**
 * El menú tal como está ahora mismo en la base. Si un producto está agotado
 * o le cambiaron el precio, aquí sale el valor nuevo: el modelo no inventa
 * precios.
 */
export async function menuDelLocal() {
  const productos = await consultar(
    `SELECT p.nombre,
            c.nombre AS categoria,
            e.nombre AS estacion,
            p.precio::FLOAT8 AS precio,
            p.disponible,
            p.tiempo_estimado_minutos AS minutos
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       JOIN estacion e  ON e.id_estacion  = p.id_estacion
      WHERE p.activo
      ORDER BY c.nombre, p.nombre`,
  );

  return productos.map((producto) => ({
    nombre: producto.nombre,
    categoria: producto.categoria,
    estacion: producto.estacion,
    precio: Number(producto.precio),
    disponible: producto.disponible,
    minutos: producto.minutos,
  }));
}

/**
 * Las ventas de hoy. Solo se llama cuando el rol tiene permiso: quien no lo
 * tiene, ni siquiera llega a verlas.
 */
export async function ventasDeHoy() {
  const porForma = await consultar(
    `SELECT pg.forma_pago AS forma,
            COALESCE(SUM(pg.monto_recibido - COALESCE(pg.cambio, 0)), 0)::FLOAT8 AS total,
            COUNT(*)::INT AS pagos
       FROM pago pg
       JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
      WHERE (c.abierta_en AT TIME ZONE 'America/Santo_Domingo')::date
            = (now() AT TIME ZONE 'America/Santo_Domingo')::date
      GROUP BY pg.forma_pago
      ORDER BY pg.forma_pago`,
  );

  const masVendidos = await consultar(
    `SELECT pr.nombre,
            SUM(lc.cantidad)::FLOAT8 AS cantidad,
            SUM(lc.importe)::FLOAT8 AS importe
       FROM linea_cuenta lc
       JOIN producto pr ON pr.id_producto = lc.id_producto
       JOIN cuenta c ON c.id_cuenta = lc.id_cuenta
      WHERE (c.abierta_en AT TIME ZONE 'America/Santo_Domingo')::date
            = (now() AT TIME ZONE 'America/Santo_Domingo')::date
      GROUP BY pr.nombre
      ORDER BY cantidad DESC
      LIMIT 5`,
  );

  const cuentas = await consultar(
    `SELECT COUNT(*)::INT AS cuentas,
            COALESCE(SUM(fn_total_cuenta(c.id_cuenta)), 0)::FLOAT8 AS total
       FROM cuenta c
      WHERE (c.abierta_en AT TIME ZONE 'America/Santo_Domingo')::date
            = (now() AT TIME ZONE 'America/Santo_Domingo')::date`,
  );

  return {
    porForma,
    masVendidos,
    cuentas: cuentas[0]?.cuentas ?? 0,
    total: Number(cuentas[0]?.total ?? 0),
  };
}

/* ------------------------------------------------------------------ prompt */

function armarPrompt(pregunta, menu, ventas) {
  const catalogo = menu
    .map(
      (producto) =>
        `- ${producto.nombre} | categoría: ${producto.categoria} | estación: ${producto.estacion} | precio: ${producto.precio.toFixed(2)} pesos | ${
          producto.disponible ? "disponible" : "agotado"
        }${producto.minutos === null ? "" : ` | ${producto.minutos} min`}`,
    )
    .join("\n");

  const bloqueDeVentas =
    ventas === null
      ? "NO TENES DATOS DE VENTAS. Si te preguntan por ventas o por dinero, di que esa información solo la ven la gerencia."
      : `VENTAS DE HOY (autorizado):
- Cuentas abiertas hoy: ${ventas.cuentas}
- Total de las cuentas: RD$${ventas.total.toFixed(2)}
${ventas.porForma.map((forma) => `- ${forma.forma}: RD$${Number(forma.total).toFixed(2)} (${forma.pagos} pagos)`).join("\n")}
Más vendidos:
${ventas.masVendidos.map((plato) => `- ${plato.nombre}: ${plato.cantidad} unidades`).join("\n")}`;

  return `Eres Doña Pula, la dueña del asadero. Alguien te pregunta sobre tu local.

PREGUNTA: ${pregunta}

Contesta DENTRO de esta conversación: da la respuesta de una vez, completa y corta.
NO pidas aclaraciones, NO saludes y NO preguntes de qué se trata: ya sabes de qué se trata.

MENÚ DE HOY (esto es todo lo que sabes del menú; si un producto no está aquí, no existe):
${catalogo}

${bloqueDeVentas}

REGLAS:
- Responde SOLO con los datos de arriba. NUNCA inventes un precio, un producto o una cantidad.
- Cuando digas un precio, cópialo textual del catálogo (el mismo número, sin recalcular ni poner ceros).
- Si la pregunta no se puede responder con esos datos, dilo con franqueza: "Eso no lo sé" o "de eso no tengo el dato aquí".
- Si preguntan por el menú en general, da la lista de los productos con su precio y si están disponibles.
- NO hagas preguntas de seguimiento: contesta con lo que ya sabes.
- No respondas preguntas que no tengan que ver con el local, el menú o las ventas.
- Máximo 4 frases.`;
}

/* --------------------------------------------------------------- respuesta */

/**
 * Cuando el modelo no contesta (está con mucha demanda, se acabaron las
 * cuota o hay red), la respuesta se arma con los MISMOS datos de la base: el
 * producto que nombra la pregunta, las ventas del día o el menú completo.
 *
 * No es una simulación: son los datos reales, leídos de PostgreSQL. Lo que se
 * avisa es que los puso el sistema y no el modelo.
 */
export function respuestaDeRespaldo(pregunta, menu, ventas, motivo) {
  const enMinusculas = pregunta.toLowerCase();

  const nombrado = menu.find((producto) =>
    enMinusculas.includes(producto.nombre.toLowerCase()),
  );

  if (nombrado !== undefined) {
    return `${nombrado.nombre}: ${nombrado.precio.toFixed(2)} pesos, ${
      nombrado.disponible ? "disponible" : "agotado"
    }${nombrado.minutos === null ? "" : `, se toma ${nombrado.minutos} minutos`}.`;
  }

  const hablaDeVentas = /(vend|ventas|cobr|dinero|factur|caja|ganado)/i.test(
    enMinusculas,
  );

  if (hablaDeVentas && ventas !== null) {
    const porForma = ventas.porForma
      .map((forma) => `${forma.forma}: ${Number(forma.total).toFixed(2)}`)
      .join(", ");

    return `Hoy hay ${ventas.cuentas} cuentas abiertas por ${ventas.total.toFixed(
      2,
    )} pesos en total${porForma.length > 0 ? ` (${porForma})` : ""}.`;
  }

  const lista = menu
    .slice(0, 12)
    .map(
      (producto) =>
        `${producto.nombre} (${producto.precio.toFixed(2)} pesos, ${
          producto.disponible ? "disponible" : "agotado"
        })`,
    )
    .join("; ");

  const donde = motivo === undefined ? "" : ` (${motivo})`;

  return `El asistente está ocupado ahora mismo${donde}, así que te paso el menú de verdad: ${lista}.`;
}

/**
 * Responde una pregunta. `ventas` es `null` cuando el rol no tiene permiso
 * para verlas.
 */
export async function responder(pregunta, menu, ventas, opciones = {}) {
  const config = opciones.config ?? leerConfigChat();

  try {
    const texto = await completarConGroq(
      [{ role: "user", content: armarPrompt(pregunta, menu, ventas) }],
      {
        config,
        fetch: opciones.fetch,
        maxTokens: 4096,
      },
    );

    return { respuesta: texto, origen: "groq" };
  } catch (fallo) {
    if (fallo.codigo === "INTEGRACION_NO_CONFIGURADA") throw fallo;

    const motivo =
      fallo.estado === 502
        ? fallo.message.replace(/^Groq rechazó la consulta: /, "")
        : "no se pudo contactar con la API";

    return {
      respuesta: respuestaDeRespaldo(pregunta, menu, ventas, motivo),
      origen: "base",
    };
  }
}
