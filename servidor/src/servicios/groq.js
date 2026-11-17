import { ErrorDeApi } from "../errores.js";

export const BASE_DE_GROQ = "https://api.groq.com/openai/v1";
export function leerConfigGroq(entorno = process.env) {
  return {
    clave: entorno.GROQ_API_KEY || "",
    modelo: entorno.GROQ_MODEL || "openai/gpt-oss-120b",
  };
}

export function hayClaveGroq(config = leerConfigGroq()) {
  return config.clave !== "";
}

export async function completarConGroq(
  mensajes,
  {
    config = leerConfigGroq(),
    fetch: pedir = globalThis.fetch,
    maxTokens = 1024,
    formatoJson = false,
    timeoutMs = 60_000,
  } = {},
) {
  if (!hayClaveGroq(config)) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Falta GROQ_API_KEY en servidor/.env.",
    );
  }

  let respuesta;

  try {
    respuesta = await pedir(`${BASE_DE_GROQ}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.clave}`,
      },
      body: JSON.stringify({
        model: config.modelo,
        messages: mensajes,
        max_completion_tokens: maxTokens,
        ...(formatoJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con Groq. Revisa la conexión a internet.",
    );
  }

  const texto = await respuesta.text();
  let datos;

  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      `Groq devolvió una respuesta inválida (código ${respuesta.status}).`,
    );
  }

  if (!respuesta.ok) {
    const motivo = datos.error?.message || `HTTP ${respuesta.status}`;
    throw new ErrorDeApi(502, "INTEGRACION_FALLIDA", `Groq rechazó la consulta: ${motivo}`);
  }

  const mensaje = datos.choices?.[0]?.message ?? {};
  const contenido = mensaje.content;
  const pensando = mensaje.reasoning;

  if (typeof contenido !== "string" || contenido.trim() === "") {
    /*
      Los modelos que "piensan" (como gpt-oss) gastan parte del presupuesto de
      tokens en razonar. Si se quedan sin tokens, no dejan respuesta: eso no es
      "la clave no sirve", es otra cosa, y el mensaje lo dice.
    */
    if (typeof pensando === "string" && pensando.trim() !== "") {
      throw new ErrorDeApi(
        502,
        "RESPUESTA_VACIA",
        "El modelo se gastó todos los tokens pensando y no dejó respuesta. Sube el límite de tokens.",
      );
    }

    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      "Groq no devolvió texto en la respuesta.",
    );
  }

  return contenido.trim();
}

/* ============================================================ herramientas */

/**
 * Igual que completarConGroq, pero con soporte de herramientas (function
 * calling). Si el modelo decide llamar una herramienta, devuelve los datos
 * para ejecutarla; si contesta texto directamente, devuelve solo el texto.
 *
 * @param {Array<object>} mensajes  Mensajes en formato de OpenAI.
 * @param {Array<object>} herramientas  Herramientas en formato de OpenAI.
 */
export async function completarConHerramientas(
  mensajes,
  herramientas,
  {
    config = leerConfigGroq(),
    fetch: pedir = globalThis.fetch,
    maxTokens = 1024,
    timeoutMs = 90_000,
  } = {},
) {
  if (!hayClaveGroq(config)) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Falta GROQ_API_KEY en servidor/.env.",
    );
  }

  let respuesta;

  try {
    respuesta = await pedir(`${BASE_DE_GROQ}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.clave}`,
      },
      body: JSON.stringify({
        model: config.modelo,
        messages: mensajes,
        tools: herramientas,
        tool_choice: "auto",
        max_completion_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con Groq. Revisa la conexión a internet.",
    );
  }

  const texto = await respuesta.text();
  let datos;

  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      `Groq devolvió una respuesta inválida (código ${respuesta.status}).`,
    );
  }

  if (!respuesta.ok) {
    const motivo = datos.error?.message || `HTTP ${respuesta.status}`;
    throw new ErrorDeApi(502, "INTEGRACION_FALLIDA", `Groq rechazó la consulta: ${motivo}`);
  }

  const mensaje = datos.choices?.[0]?.message ?? {};

  if (Array.isArray(mensaje.tool_calls) && mensaje.tool_calls.length > 0) {
    const llamada = mensaje.tool_calls[0];
    let argumentos = {};

    try {
      argumentos = JSON.parse(llamada.function?.arguments || "{}");
    } catch {
      argumentos = {};
    }

    return { herramienta: { nombre: llamada.function?.name, argumentos, cruda: llamada }, texto: null };
  }

  const contenido = mensaje.content;

  if (typeof contenido !== "string" || contenido.trim() === "") {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      "Groq no devolvió texto en la respuesta.",
    );
  }

  return { herramienta: null, texto: contenido.trim() };
}
