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
import { hoyLocal } from "./reportesDatos.js";
import {
  HERRAMIENTAS,
  ejecutarHerramienta,
} from "./reportesIa.js";
import {
  completarConHerramientas,
  completarConGroq,
  leerConfigGroq,
} from "./groq.js";

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

function bloqueMenu(menu) {
  /* Formato compacto: el plan gratuito de Groq limita a 8 000 tokens por minuto.
     El menú completo en una línea por producto entra sin problema. */
  return menu
    .map(
      (producto) =>
        `- ${producto.nombre} · ${producto.categoria} · RD$${producto.precio.toFixed(2)}${
          producto.disponible ? "" : " · AGOTADO"
        }${producto.minutos === null ? "" : ` · ${producto.minutos}m`}`,
    )
    .join("\n");
}

function armarPrompt(pregunta, menu, ventas) {
  const catalogo = bloqueMenu(menu);

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

const PALABRAS_DE_REPORTE =
  /reporte|reporta|vendid|ventas?\b|venta\b|factura|cobrad|caja\b|propina|más vendido|mas vendido|mejor vendid|corte de caja|reservas?\b|inventario|agotados?|resumen|total\b|ganancias|ingreso|cuánto\s|cantidades?\s|pedidos\b/i;

/** ¿La pregunta suena a reporte? Entonces el menú sobra y baja el costo de tokens. */
function esPreguntaDeReporte(pregunta) {
  return PALABRAS_DE_REPORTE.test(String(pregunta));
}

function armarPromptReportes(pregunta) {
  return `Eres Doña Pula, la dueña del asadero. Hoy es ${hoyLocal()} (hora de Santo Domingo). Alguien te pide datos de tu negocio.

PREGUNTA: ${pregunta}

REGLAS:
- Usa las herramientas disponibles para generar el reporte pedido. Nunca inventes números: los números salen de la base.
- Interpreta el período con naturalidad ("esta semana" → esta_semana, "el mes pasado" → mes_pasado, "últimos 7/14/30 días", "hoy", "ayer", "todo"). Si no hay período explícito, usa "este_mes".
- Si no hay herramienta exacta, usa la más cercana.
- Con el resultado, responde en UNA O DOS frases con los datos principales (por ejemplo, el total y la mayor venta).
- No agregues análisis ni recomendaciones largas.`;
}

function armarPromptHerramientas(pregunta, menu, incluirMenu = true) {
  const catalogo = incluirMenu ? bloqueMenu(menu) : "(El menú no hace falta para esta consulta.)";

  return `Eres Doña Pula, la dueña del asadero. Hoy es ${hoyLocal()} (hora de Santo Domingo). Alguien te pregunta sobre tu local.

PREGUNTA: ${pregunta}

Tu tarea es doble: (1) responder preguntas del menú con los datos de abajo y (2) generar REPORTES cuando te los pidan, usando las herramientas disponibles.

MENÚ DE HOY (esto es todo lo que sabes del menú; si un producto no está aquí, no existe):
${catalogo}

REGLAS PARA REPORTES:
- Si la pregunta pide un reporte, un listado, un resumen, "cuánto" o "cuáles son" sobre ventas, productos, propinas, pagos, canales, cortes de caja, reservas, inventario o resumen del negocio: LLAMA la herramienta que corresponde. Nunca inventes los números.
- Interpreta el período con naturalidad ("esta semana", "el mes pasado", "últimos 14 días", "hoy", "ayer", "todo"). Si no hay período explícito, usa "este_mes" o el que sea razonable y dilo en la respuesta.
- Si no hay herramienta exacta, usa la más cercana.
- Con el resultado devuelve una respuesta breve en español (máximo 4 frases) con los datos principales.
- Los resultados de las herramientas son datos REALES de la base; no los alteres.

REGLAS GENERALES:
- NO pidas aclaraciones, NO saludes y NO preguntes de qué se trata: ya sabes de qué se trata.
- Para el menú: respondes con el catálogo de arriba; nunca inventes un precio o disponibilidad.
- No respondas preguntas que no tengan que ver con el local, el menú o los reportes.
- Máximo 4 frases, salvo que el reporte lo requiera.`;
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
 * para verlas. Con permiso, primero se intenta el flujo con herramientas
 * (el modelo puede pedir un reporte en lenguaje natural); sin permiso, se
 * queda con el menú de siempre.
 *
 * Devuelve { respuesta, origen, puedeVerVentas, reporte? } — `reporte` es el
 * reporte listo para pintar/exportar cuando la IA lo generó.
 */
export async function responder(pregunta, menu, ventas, opciones = {}) {
  const config = opciones.config ?? leerConfigChat();
  const puedeVerVentas = ventas !== null;

  /* Sin permiso para reportes: flujo clásico, solo menú. */
  if (!puedeVerVentas) {
    try {
      const texto = await completarConGroq(
        [{ role: "user", content: armarPrompt(pregunta, menu, ventas) }],
        {
          config,
          fetch: opciones.fetch,
          maxTokens: 2048,
        },
      );

      return { respuesta: texto, origen: "groq", puedeVerVentas: false };
    } catch (fallo) {
      if (fallo.codigo === "INTEGRACION_NO_CONFIGURADA") throw fallo;

      const motivo =
        fallo.estado === 502
          ? fallo.message.replace(/^Groq rechazó la consulta: /, "")
          : "no se pudo contactar con la API";

      return {
        respuesta: respuestaDeRespaldo(pregunta, menu, null, motivo),
        origen: "base",
        puedeVerVentas: false,
      };
    }
  }

  /* Con permiso: primero la vía de reportes con herramientas. */
  const preguntaDeReporte = esPreguntaDeReporte(pregunta);

  /** Un reintento corto para cuando el plan gratuito se agota por minuto. */
  const intentarConEspera = async () => {
    const mensajes = [
      {
        role: "system",
        content: preguntaDeReporte
          ? armarPromptReportes(pregunta)
          : armarPromptHerramientas(pregunta, menu, true),
      },
      { role: "user", content: pregunta },
    ];

    const primera = await completarConHerramientas(mensajes, HERRAMIENTAS, {
      config,
      fetch: opciones.fetch,
      maxTokens: 1024,
    });

    if (primera.herramienta === null) {
      return { respuesta: primera.texto, origen: "groq", puedeVerVentas: true };
    }

    const { reporte, datos } = await ejecutarHerramienta(
      primera.herramienta.nombre,
      primera.herramienta.argumentos,
      true,
    );

    const mensajesDespues = [
      ...mensajes,
      { role: "assistant", content: null, tool_calls: [primera.herramienta.cruda] },
      {
        role: "tool",
        tool_call_id: primera.herramienta.cruda.id,
        content: JSON.stringify(datos),
      },
    ];

    const segunda = await completarConGroq(mensajesDespues, {
      config,
      fetch: opciones.fetch,
      maxTokens: 1024,
    });

    return {
      respuesta: segunda,
      origen: "groq",
      puedeVerVentas: true,
      reporte,
    };
  };

  try {
    return await intentarConEspera();
  } catch (primerFallo) {
    /* Si es límite de cuota por minuto, esperar y reintentar una sola vez. */
    if (/rate limit|tokens per minute|try again in/i.test(String(primerFallo.message))) {
      await new Promise((listo) => {
        setTimeout(listo, 8_000);
      });

      try {
        return await intentarConEspera();
      } catch (segundoFallo) {
        primerFallo = segundoFallo;
      }
    }

    const fallo = primerFallo;
    if (fallo.codigo === "INTEGRACION_NO_CONFIGURADA") throw fallo;

    console.error("[chat] fallo en flujo con herramientas:", fallo?.message);

    /* Si algo falla con herramientas, se intenta el flujo clásico. */
    try {
      const texto = await completarConGroq(
        [{ role: "user", content: armarPrompt(pregunta, menu, ventas) }],
        {
          config,
          fetch: opciones.fetch,
          maxTokens: 2048,
        },
      );

      return { respuesta: texto, origen: "groq", puedeVerVentas: true };
    } catch {
      const motivo =
        fallo.estado === 502
          ? fallo.message.replace(/^Groq rechazó la consulta: /, "")
          : "no se pudo contactar con la API";

      console.error("[chat] también falló el flujo clásico:", fallo?.message);

      return {
        respuesta: respuestaDeRespaldo(pregunta, menu, ventas, motivo),
        origen: "base",
        puedeVerVentas: true,
      };
    }
  }
}
