/*
  servicios/imecf.js — la plataforma de facturación electrónica (Fase 8).
  -------------------------------------------------------------------------

  Tu sistema habla con la plataforma por HTTP:

      POST /api/v1/ecf/send          manda el comprobante
      GET  /api/v1/ecf/{id}/status   cómo va
      GET  /api/v1/ecf/{id}/track    estado en la DGII
      GET  /api/v1/ecf/{id}/xml      el XML firmado

  La autenticación es el encabezado `X-API-Key` con la clave de la empresa. La
  clave vive en `servidor/.env` (RN-25), nunca en la base.

  Si el JSON enviado NO trae `eNCF`, la plataforma asigna el siguiente número
  disponible de los rangos configurados en su panel. Por eso este servicio no
  inventa números: los pide a la plataforma y guarda lo que devuelve.
*/

import { ErrorDeApi } from "../errores.js";

const URL_POR_DEFECTO = "https://ecf-platform-backend-50801509587.us-central1.run.app";

/** Lee la configuración de la plataforma del entorno. */
export function leerConfigImecf(entorno = process.env) {
  return {
    url: (entorno.IMECF_API_URL || URL_POR_DEFECTO).replace(/\/+$/, ""),
    clave: entorno.IMECF_API_KEY || "",
    /*
      La ruta del envío. En esta plataforma es /api/v1/ecf/send; si el
      proveedor la cambia (o te dan otra en su documentación), se cambia aquí
      y en el .env, sin tocar código.
    */
    endpoint: entorno.IMECF_ENDPOINT || "/api/v1/ecf/send",
  };
}

export function hayClave(config = leerConfigImecf()) {
  return config.clave !== "";
}

/** Lee la respuesta de la plataforma. Puede ser JSON o el XML firmado. */
async function leerTexto(respuesta, nombre) {
  const texto = await respuesta.text();

  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      `${nombre} devolvió algo que no es JSON (código ${respuesta.status}).`,
    );
  }
}

/**
 * Llama a la plataforma. Todas las funciones públicas pasan por aquí, para que
 * el manejo de errores sea el mismo en todas.
 */
async function llamarImecf(ruta, metodo, cuerpo, opciones) {
  const config = opciones.config ?? leerConfigImecf();
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayClave(config)) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Falta IMECF_API_KEY en servidor/.env. Sin esa clave no se puede facturar.",
    );
  }

  let respuesta;

  try {
    respuesta = await pedir(`${config.url}${ruta}`, {
      method: metodo,
      headers: {
        "X-API-Key": config.clave,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con la plataforma de facturación.",
    );
  }

  const datos = await leerTexto(respuesta, "La plataforma de facturación");

  if (!respuesta.ok) {
    const motivo = datos.message ?? datos.error ?? `HTTP ${respuesta.status}`;
    const documento = datos.documentId ?? datos.id ?? null;

    /*
      La plataforma crea el documento y le pone el número ANTES de mandarlo a
      la DGII. Si la DGII lo rechaza, el documento existe igual (está en el
      panel de la plataforma) pero aquí no se guarda: por eso el aviso lleva
      el identificador, para poder seguirlo.
    */
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      documento === null
        ? `La plataforma rechazó la operación: ${motivo}`
        : `La plataforma creó el documento ${documento} pero la DGII lo rechazó: ${motivo}. Ese documento se puede revisar en el panel de la plataforma.`,
    );
  }

  return datos;
}

/**
 * Manda el comprobante. La plataforma devuelve el id, el eNCF que asignó, el
 * trackId y el enlace del timbre. Se leen con nombres alternativos porque la
 * plataforma los llama de varias formas (`encf`, `eNCF`, `data.encf`...).
 */
export async function enviarComprobante(payload, opciones = {}) {
  const config = opciones.config ?? leerConfigImecf();
  const datos = await llamarImecf(
    config.endpoint ?? "/api/v1/ecf/send",
    "POST",
    payload,
    opciones,
  );
  const dentro = datos.data ?? datos;

  return {
    id: dentro.id ?? dentro.idComprobante ?? null,
    encf: dentro.encf ?? dentro.eNCF ?? dentro.numero ?? null,
    trackId: dentro.trackId ?? dentro.track_id ?? null,
    dgiiUrl: dentro.dgiiUrl ?? dentro.dgii_url ?? null,
    estado: dentro.estado ?? dentro.status ?? "Enviado",
    respuesta: datos,
  };
}

/** Cómo va el comprobante en la plataforma. */
export async function consultarEstado(id, opciones = {}) {
  return llamarImecf(`/api/v1/ecf/${id}/status`, "GET", undefined, opciones);
}

/**
 * Los últimos documentos que tiene la plataforma. Sirve para el diagnóstico:
 * si el último comprobante quedó en error, el mensaje lo dice con nombre y
 * apellido, en vez de un "la clave está puesta" que no explica nada.
 */
export async function listarDocumentos(opciones = {}) {
  const datos = await llamarImecf("/api/v1/ecf", "GET", undefined, opciones);
  const lista = datos.data ?? datos;

  return Array.isArray(lista) ? lista : [];
}

/** El estado del timbre en la DGII. */
export async function consultarTrack(id, opciones = {}) {
  return llamarImecf(`/api/v1/ecf/${id}/track`, "GET", undefined, opciones);
}

/**
 * El XML firmado. Este es el único que NO es JSON: se devuelve el texto tal
 * cual, porque es el archivo que se descarga.
 */
export async function descargarXml(id, opciones = {}) {
  const config = opciones.config ?? leerConfigImecf();
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayClave(config)) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Falta IMECF_API_KEY en servidor/.env. Sin esa clave no se puede facturar.",
    );
  }

  let respuesta;

  try {
    respuesta = await pedir(`${config.url}/api/v1/ecf/${id}/xml`, {
      method: "GET",
      headers: { "X-API-Key": config.clave, Accept: "application/xml" },
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con la plataforma de facturación.",
    );
  }

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      `La plataforma no devolvió el XML (código ${respuesta.status}).`,
    );
  }

  return texto;
}

/**
 * Revisa la integración con la plataforma de verdad: pregunta por los últimos
 * documentos y dice qué pasó con el último. Es lo primero que hay que ver
 * cuando la facturación no funciona, porque "la clave está puesta" no
 * explica por qué la DGII rechaza el comprobante.
 */
export async function diagnostico(opciones = {}) {
  const config = opciones.config ?? leerConfigImecf();
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayClave(config)) {
    return {
      nombre: "Facturación electrónica (IMECF)",
      listo: false,
      url: config.url,
      mensaje: "Falta IMECF_API_KEY en servidor/.env.",
    };
  }

  try {
    const documentos = await listarDocumentos({ config, fetch: pedir });
    const ultimo = documentos[0];

    if (ultimo === undefined) {
      return {
        nombre: "Facturación electrónica (IMECF)",
        listo: true,
        url: config.url,
        mensaje:
          "La clave funciona: la plataforma responde y todavía no hay comprobantes enviados.",
      };
    }

    const numero = ultimo.encf ?? "sin número";
    const estado = ultimo.estado ?? "desconocido";
    const error = ultimo.errorMessage ?? null;

    if (error !== null) {
      return {
        nombre: "Facturación electrónica (IMECF)",
        listo: false,
        url: config.url,
        mensaje: `La clave funciona, pero el último comprobante (${numero}) quedó en estado ${estado}: ${error}. La plataforma crea el documento y es la DGII quien lo rechaza.`,
      };
    }

    return {
      nombre: "Facturación electrónica (IMECF)",
      listo: true,
      url: config.url,
      mensaje: `La clave funciona: el último comprobante (${numero}) está en estado ${estado}.`,
    };
  } catch (fallo) {
    return {
      nombre: "Facturación electrónica (IMECF)",
      listo: false,
      url: config.url,
      mensaje: `La plataforma no respondió: ${fallo.message ?? "no se pudo contactar con ella"}.`,
    };
  }
}
