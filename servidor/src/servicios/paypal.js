/*
  servicios/paypal.js — la integración real con PayPal (Fase 8).
  -------------------------------------------------------------

  Reglas de esta casa:

    · Nada se simula. Si no hay credenciales, se dice que no las hay y el cobro
      no se hace. No hay un "modo simulado" que finja que el dinero se movió.
    · Las credenciales viven en `servidor/.env` (RN-25), nunca en la base.
    · Cada función acepta `opciones.fetch` y `opciones.config` para que las
      pruebas aisladas puedan ejercitar la respuesta de PayPal sin internet.

  PayPal tiene dos entornos: `sandbox` (para pruebas, gratis) y `produccion`.
*/

import { ErrorDeApi } from "../errores.js";

const BASE_DE_PAYPAL = {
  sandbox: "https://api-m.sandbox.paypal.com",
  produccion: "https://api-m.paypal.com",
};

/** Lee la configuración de PayPal del entorno. */
export function leerConfigPaypal(entorno = process.env) {
  return {
    entorno: (entorno.PAYPAL_ENTORNO || "sandbox").toLowerCase(),
    clientId: entorno.PAYPAL_CLIENT_ID || "",
    clientSecret: entorno.PAYPAL_CLIENT_SECRET || "",
    moneda: entorno.PAYPAL_MONEDA || "USD",
    webhookId: entorno.PAYPAL_WEBHOOK_ID || "",
  };
}

/** La dirección de la API según el entorno. */
export function baseDePaypal(entorno) {
  return BASE_DE_PAYPAL[entorno] ?? BASE_DE_PAYPAL.sandbox;
}

/** ¿Hay credenciales para llamar a PayPal? */
export function hayCredenciales(config = leerConfigPaypal()) {
  return config.clientId !== "" && config.clientSecret !== "";
}

function sinCredenciales() {
  return new ErrorDeApi(
    503,
    "INTEGRACION_NO_CONFIGURADA",
    "PayPal no está configurado. Faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en servidor/.env.",
  );
}

/**
 * Pide un token de acceso a PayPal. Se guarda en memoria un rato, porque el
 * token dura poco y no tiene sentido pedirlo en cada llamada.
 */
async function obtenerToken(config, opciones) {
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayCredenciales(config)) throw sinCredenciales();

  const credenciales = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  let respuesta;

  try {
    respuesta = await pedir(
      `${baseDePaypal(config.entorno)}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credenciales}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con PayPal. Revisa la conexión a internet.",
    );
  }

  const datos = await leerJson(respuesta, "PayPal");

  if (!respuesta.ok) {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      `PayPal rechazó las credenciales: ${datos.error_description || datos.error || `HTTP ${respuesta.status}`}`,
    );
  }

  if (typeof datos.access_token !== "string") {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      "PayPal no devolvió un token de acceso.",
    );
  }

  return {
    valor: datos.access_token,
    expira: Date.now() + Number(datos.expires_in ?? 3600) * 1000,
  };
}

/** Lee la respuesta de la API externa y avisa si no es JSON. */
async function leerJson(respuesta, nombre) {
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

const CACHE_DE_TOKENS = new Map();

/**
 * El token se guarda en memoria un rato, porque dura poco y no tiene sentido
 * pedirlo en cada llamada. Las pruebas pueden pasar su propio caché para no
 * depender del orden.
 */
function cacheDe(opciones) {
  return opciones.cache ?? CACHE_DE_TOKENS;
}

async function llamarPaypal(ruta, metodo, cuerpo, opciones) {
  const config = opciones.config ?? leerConfigPaypal();
  const pedir = opciones.fetch ?? globalThis.fetch;

  if (!hayCredenciales(config)) throw sinCredenciales();

  const cache = cacheDe(opciones);
  const llave = `${config.entorno}:${config.clientId}`;
  const guardado = cache.get(llave);

  if (!guardado || guardado.expira <= Date.now() + 30000) {
    cache.set(llave, await obtenerToken(config, opciones));
  }

  const token = cache.get(llave);

  let respuesta;

  try {
    respuesta = await pedir(`${baseDePaypal(config.entorno)}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token.valor}`,
        "Content-Type": "application/json",
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con PayPal. Revisa la conexión a internet.",
    );
  }

  const datos = await leerJson(respuesta, "PayPal");

  if (!respuesta.ok) {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      `PayPal rechazó la operación: ${datos.message || `HTTP ${respuesta.status}`}`,
    );
  }

  return datos;
}

/**
 * Convierte pesos dominicanos a dólares con la tasa del negocio
 * (cuántos pesos vale un dólar). Redondea a dos decimales, como los demás
 * montos del sistema.
 */
export function convertirADolares(totalEnPesos, tasa) {
  return Math.round((Number(totalEnPesos) / Number(tasa)) * 100) / 100;
}

/** Crea el pedido de PayPal para que el cliente lo apruebe. */
export async function crearPedido(monto, referencia, opciones = {}) {
  const config = opciones.config ?? leerConfigPaypal();
  const datos = await llamarPaypal(
    "/v2/checkout/orders",
    "POST",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: referencia || "SIGA-DP",
          description: "Consumo en Asadero Doña Pula",
          amount: {
            currency_code: config.moneda,
            value: Number(monto).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Asadero Doña Pula",
        user_action: "PAY_NOW",
      },
    },
    opciones,
  );

  return {
    id: datos.id,
    estado: datos.status,
    referencia: datos.purchase_units?.[0]?.reference_id ?? referencia ?? datos.id,
    monto: Number(datos.purchase_units?.[0]?.amount?.value ?? monto),
    moneda: datos.purchase_units?.[0]?.amount?.currency_code ?? config.moneda,
    enlace:
      datos.links?.find((enlace) => enlace.rel === "approve")?.href ?? null,
    creado: datos.create_time ?? null,
  };
}

/** Pregunta en qué estado está el pedido. */
export async function consultarPedido(id, opciones = {}) {
  const config = opciones.config ?? leerConfigPaypal();
  const datos = await llamarPaypal(
    `/v2/checkout/orders/${id}`,
    "GET",
    undefined,
    opciones,
  );

  return {
    id: datos.id,
    estado: datos.status,
    referencia: datos.purchase_units?.[0]?.reference_id ?? id,
    monto: Number(datos.purchase_units?.[0]?.amount?.value ?? 0),
    moneda: datos.purchase_units?.[0]?.amount?.currency_code ?? config.moneda,
    enlace:
      datos.links?.find((enlace) => enlace.rel === "approve")?.href ?? null,
    creado: datos.create_time ?? null,
  };
}

/** Captura el pago aprobado y devuelve el identificador del cobro. */
export async function capturarPedido(id, opciones = {}) {
  const config = opciones.config ?? leerConfigPaypal();
  const datos = await llamarPaypal(
    `/v2/checkout/orders/${id}/capture`,
    "POST",
    {},
    opciones,
  );

  const compra = datos.purchase_units?.[0];
  const cobro = compra?.payments?.captures?.[0];
  const pagador = cobro?.payer ?? datos.payer ?? null;

  return {
    id: datos.id,
    estado: datos.status,
    referencia: compra?.reference_id ?? id,
    monto: Number(cobro?.amount?.value ?? 0),
    moneda: cobro?.amount?.currency_code ?? config.moneda,
    identificadorPago: cobro?.id ?? null,
    estadoPago: cobro?.status ?? null,
    /** El correo del comprador: hace falta para facturar a un consumidor final. */
    correo: pagador?.email_address ?? null,
    nombre: pagador?.name
      ? `${pagador.name.given_name ?? ""} ${pagador.name.surname ?? ""}`.trim()
      : null,
  };
}

/**
 * Los webhooks que tiene la cuenta de PayPal. Sirve para revisar que el
 * webhook de esta máquina sigue registrado y apuntando aquí: si el túnel se
 * levantó con otra dirección, el aviso del pago se pierde.
 */
export async function listarWebhooks(config = leerConfigPaypal(), opciones = {}) {
  const pedir = opciones.fetch ?? globalThis.fetch;
  const token = await obtenerToken(config, opciones);

  let respuesta;

  try {
    respuesta = await pedir(`${baseDePaypal(config.entorno)}/v1/notifications/webhooks`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token.valor}` },
    });
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo contactar con PayPal para revisar los webhooks.",
    );
  }

  if (!respuesta.ok) {
    return [];
  }

  const datos = await respuesta.json();

  return Array.isArray(datos.webhooks) ? datos.webhooks : [];
}

/**
 * Verifica la firma de un webhook de PayPal. PayPal manda la firma en los
 * encabezados y hay que comprobarla contra su propio servicio: si no se
 * verifica, cualquiera podría mandar un "pago completado" falso.
 */
export async function verificarFirmaDeWebhook(cabeceras, evento, opciones = {}) {
  const config = opciones.config ?? leerConfigPaypal();
  const pedir = opciones.fetch ?? globalThis.fetch;
  const idWebhook = opciones.idWebhook ?? process.env.PAYPAL_WEBHOOK_ID;

  if (!hayCredenciales(config)) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Faltan las credenciales de PayPal: no se puede verificar el webhook.",
    );
  }

  if (!idWebhook) {
    throw new ErrorDeApi(
      503,
      "INTEGRACION_NO_CONFIGURADA",
      "Falta PAYPAL_WEBHOOK_ID en servidor/.env: no se sabe qué webhook es.",
    );
  }

  const token = await obtenerToken(config, opciones);

  let respuesta;

  try {
    respuesta = await pedir(
      `${baseDePaypal(config.entorno)}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.valor}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transmission_id: cabeceras["paypal-transmission-id"],
          transmission_time: cabeceras["paypal-transmission-time"],
          transmission_sig: cabeceras["paypal-transmission-sig"],
          cert_url: cabeceras["paypal-cert-url"],
          auth_algo: cabeceras["paypal-auth-algo"],
          webhook_id: idWebhook,
          webhook_event: evento,
        }),
      },
    );
  } catch {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      "No se pudo verificar la firma del webhook con PayPal.",
    );
  }

  const datos = await leerJson(respuesta, "PayPal");

  if (!respuesta.ok) {
    throw new ErrorDeApi(
      502,
      "INTEGRACION_FALLIDA",
      `PayPal no pudo verificar la firma: ${datos.message ?? `HTTP ${respuesta.status}`}`,
    );
  }

  return datos.verification_status === "SUCCESS";
}

/**
 * Revisa la integración sin cobrar nada: pide un token y dice qué pasa.
 * Es lo primero que hay que ver cuando PayPal no funciona.
 *
 * Además mira los webhooks de la cuenta: el pago se puede capturar desde la
 * pantalla (el cajero la tiene abierta), pero si el cliente paga con la
 * ventana cerrada, el aviso llega por el webhook. Si el webhook no apunta a
 * esta maquina, el pago se queda sin avisar.
 */
export async function diagnostico(opciones = {}) {
  const config = opciones.config ?? leerConfigPaypal();

  if (!hayCredenciales(config)) {
    return {
      nombre: "PayPal",
      listo: false,
      url: baseDePaypal(config.entorno),
      mensaje:
        "Faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en servidor/.env.",
    };
  }

  try {
    await obtenerToken(config, opciones);

    const webhooks = await listarWebhooks(config, opciones);

    if (webhooks.length === 0) {
      return {
        nombre: "PayPal",
        listo: true,
        url: baseDePaypal(config.entorno),
        mensaje: `Credenciales aceptadas (${config.entorno}). No hay ningun webhook registrado: el pago se captura desde la pantalla, pero si el cliente paga con la ventana cerrada no llegara el aviso.`,
      };
    }

    const idEsperado = config.webhookId;
    const propio = webhooks.find((webhook) => webhook.id === idEsperado);
    const otro = webhooks.find((webhook) => webhook.id !== idEsperado);

    if (idEsperado === "" || propio === undefined) {
      return {
        nombre: "PayPal",
        listo: true,
        url: baseDePaypal(config.entorno),
        mensaje: `Credenciales aceptadas (${config.entorno}). OJO: el webhook de esta maquina no esta registrado en PayPal (${otro === undefined ? "no hay ninguno" : "el que hay apunta a otra URL"}). Pon el id del webhook correcto en PAYPAL_WEBHOOK_ID.`,
      };
    }

    return {
      nombre: "PayPal",
      listo: true,
      url: baseDePaypal(config.entorno),
      mensaje: `Credenciales aceptadas (${config.entorno}) y webhook registrado.`,
    };
  } catch (fallo) {
    return {
      nombre: "PayPal",
      listo: false,
      url: baseDePaypal(config.entorno),
      mensaje: fallo.message,
    };
  }
}
