/*
  servicios/asistente.js — el asistente que recomienda platos (Fase 8).
  -----------------------------------------------------------------------

  Cómo funciona:

    · El modelo solo elige **qué platos** del menú encajan y **por
      qué**. El precio y el tiempo de preparación **siempre** salen del
      catálogo de PostgreSQL: nunca de lo que conteste el modelo y nunca de un
      número fijo (Fase 8 del plan).
    · Si el modelo propone un plato que no está en el menú, esa sugerencia se
      descarta.
    · Si no hay clave o la API externa no responde, las sugerencias se arman con
      lo que la base ya sabe (lo más pedido) y se avisa claramente en `aviso` de
      que no vinieron del modelo. No se finge que la IA respondió.

  La clave vive en `servidor/.env` (RN-25).
*/

import {
  BASE_DE_GROQ,
  completarConGroq,
  hayClaveGroq,
  leerConfigGroq,
} from "./groq.js";

/** Lee la configuración del asistente del entorno. */
export function leerConfigAsistente(entorno = process.env) {
  return leerConfigGroq(entorno);
}

export function hayClave(config = leerConfigAsistente()) {
  return hayClaveGroq(config);
}

/* ------------------------------------------------------------------ prompt */

/**
 * Se le explica el trabajo y se le da el menú. Se le pide que conteste solo con
 * un JSON, porque así es fácil leer lo que devuelve.
 */
function armarPrompt(contexto) {
  const catalogo = contexto.catalogo
    .map(
      (producto) =>
        `- ${producto.nombre} (${producto.categoria}, ${producto.estacion}, RD$${producto.precio}${
          producto.disponible ? "" : ", agotado"
        })`,
    )
    .join("\n");

  const pedido =
    contexto.pedido.length > 0
      ? contexto.pedido.map((linea) => `- ${linea.cantidad} x ${linea.nombre}`).join("\n")
      : "(la mesa todavía no ha pedido nada)";

  return `Eres el asistente de un asadero dominicano llamado "Doña Pula".
Tu trabajo es sugerirle al mesero qué platillos y bebidas agregar al pedido de una mesa.

MENÚ DEL LOCAL:
${catalogo}

LO QUE LA MESA YA PIDIÓ:
${pedido}

TAREA:
Sugiere hasta 3 productos del menú que encajen bien con lo que ya pidieron.
Si la mesa ya pidió algo, sugiere acompañantes o bebidas que no estén repetidos.
Si la mesa no ha pedido nada, sugiere los platos más pedidos del local.

Responde SOLO con este JSON, sin texto antes ni después:
{
  "sugerencias": [
    { "nombre": "nombre exacto del producto del menú", "motivo": "por qué conviene, en una frase corta" }
  ]
}

Reglas:
- El campo "nombre" debe coincidir exactamente con un nombre del menú.
- No inventes productos que no estén en la lista.
- "motivo" debe tener máximo 15 palabras.`;
}

/* --------------------------------------------------------------- respuesta */

/**
 * El modelo puede envolver el JSON en ```json o añadir texto antes del
 * primer {. Aquí se limpia la respuesta y se lee como objeto.
 */
export function leerRespuesta(texto) {
  let limpio = String(texto ?? "").trim();

  limpio = limpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");

  if (inicio >= 0 && fin > inicio) {
    limpio = limpio.slice(inicio, fin + 1);
  }

  return JSON.parse(limpio);
}

/* ------------------------------------------------------------ consulta real */

async function preguntarAGroq(contexto, opciones) {
  const config = opciones.config ?? leerConfigAsistente();

  const salida = await completarConGroq(
    [{ role: "user", content: armarPrompt(contexto) }],
    {
      config,
      fetch: opciones.fetch,
      maxTokens: 1024,
      formatoJson: true,
    },
  );

  return leerRespuesta(salida);
}

/* ------------------------------------------- sugerencias sin el modelo */

/*
  Cuando no hay clave (o el modelo falla), las sugerencias se arman con lo que
  la base ya sabe: los productos más pedidos que no estén en el pedido. El
  precio y el tiempo siguen viniendo del catálogo.
*/
function sugerenciasDesdeLaBase(contexto, motivo) {
  const yaPedidos = new Set(
    contexto.pedido.map((linea) => linea.nombre.toLowerCase()),
  );

  const candidatos = contexto.catalogo
    .filter((producto) => producto.disponible && !yaPedidos.has(producto.nombre.toLowerCase()))
    .sort((a, b) => b.vendidos - a.vendidos)
    .slice(0, 3);

  return {
    sugerencias: candidatos.map((producto) => ({
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      minutos: producto.minutosEstimados,
      motivo: `${producto.categoria}: se han pedido ${producto.vendidos} veces en el local.`,
    })),
    origen: "base",
    aviso: motivo,
  };
}

/* ------------------------------------------------------------ función pública */

/**
 * Devuelve siempre la misma forma, haya modelo o no:

    { sugerencias: [{ productoId, nombre, precio, minutos, motivo }], origen, aviso }

  - origen "groq":    las propuso el modelo
  - origen "base":   las armó el sistema con los datos de PostgreSQL
*/
export async function sugerir(contexto, opciones = {}) {
  const config = opciones.config ?? leerConfigAsistente();

  if (!hayClave(config)) {
    return sugerenciasDesdeLaBase(
      contexto,
      "No hay GROQ_API_KEY en servidor/.env, así que las sugerencias salen de los datos del local.",
    );
  }

  try {
    const respuesta = await preguntarAGroq(contexto, opciones);

    const catalogoPorNombre = new Map(
      contexto.catalogo.map((producto) => [
        producto.nombre.toLowerCase(),
        producto,
      ]),
    );

    const sugerencias = [];

    for (const item of respuesta.sugerencias ?? []) {
      const nombre = String(item.nombre ?? "").trim().toLowerCase();
      const producto = catalogoPorNombre.get(nombre);
      if (producto === undefined) continue;

      sugerencias.push({
        productoId: producto.id,
        nombre: producto.nombre,
        // El precio y el tiempo NUNCA son los del modelo: son del catálogo.
        precio: producto.precio,
        minutos: producto.minutosEstimados,
        motivo: String(item.motivo ?? "").slice(0, 120),
      });

      if (sugerencias.length === 3) break;
    }

    if (sugerencias.length === 0) {
      return sugerenciasDesdeLaBase(
        contexto,
        "El asistente no propuso nada del menú; se usan los datos del local.",
      );
    }

    return { sugerencias, origen: "groq", aviso: null };
  } catch (fallo) {
    return sugerenciasDesdeLaBase(
      contexto,
      `El asistente no respondió (${fallo.message}). Se usan los datos del local.`,
    );
  }
}

/**
 * Revisa la integración sin gastar tokens: con la clave se listan los modelos
 * y se comprueba que la API responde. Es lo primero que hay que ver cuando el
 * asistente no funciona.
 */
export async function diagnostico(opciones = {}) {
  const config = opciones.config ?? leerConfigAsistente();
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayClave(config)) {
    return {
      nombre: "Asistente (Groq)",
      listo: false,
      url: BASE_DE_GROQ,
      mensaje: "Falta GROQ_API_KEY en servidor/.env.",
    };
  }

  try {
    await completarConGroq([{ role: "user", content: "di ok" }], {
      config,
      fetch: pedir,
      // El modelo razona antes de contestar: con 16 tokens se queda pensando
      // y no deja respuesta, que no es lo mismo que "la clave no sirve".
      maxTokens: 512,
      timeoutMs: 30_000,
    });

    return {
      nombre: "Asistente (Groq)",
      listo: true,
      url: BASE_DE_GROQ,
      mensaje: `La clave está puesta y el modelo ${config.modelo} responde.`,
    };
  } catch (fallo) {
    return {
      nombre: "Asistente (Groq)",
      listo: false,
      url: BASE_DE_GROQ,
      mensaje: fallo.message,
    };
  }
}
