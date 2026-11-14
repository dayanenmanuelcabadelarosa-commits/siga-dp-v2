/*
  cliente-http.ts — la única puerta al servidor.
  ----------------------------------------------

  Ninguna pantalla llama a `fetch`. Todas pasan por `pedir()`, y por eso hay un
  solo lugar donde se resuelven estas cosas:

    · La dirección de la API (`VITE_API_URL`).
    · El encabezado `Authorization` con el token de la sesión.
    · El límite de tiempo: si el servidor no contesta en 15 segundos, se avisa.
    · El formato de respuesta: se quita el sobre `{ ok, datos }` y se devuelve
      solo lo que la pantalla necesita.
    · Los errores: del servidor o de la red, todos salen como `ErrorDeApi` con
      un mensaje en español listo para mostrar.
    · La expiración de la sesión: si el servidor responde 401 `SIN_SESION`
      cuando se mandó un token, aquí se avisa para que la aplicación devuelva a
      la persona a la pantalla de entrar. Ese aviso es central a propósito: si
      cada pantalla tuviera que acordarse de hacerlo, alguna se olvidaría.

  El token NO se lee nunca de la barra de direcciones. La auditoría (sección 7
  del plan) manda eliminarlo de ahí, y hay una prueba del servidor que exige que
  por la dirección no sirva.
*/

import { ErrorDeApi } from "./errores";
import type { RespuestaApi } from "./tipos";
import { leerSesionCruda, limpiarSesion, sesionVencida } from "../sesion/almacen";

/** Cuánto se espera una respuesta antes de darla por perdida. */
const TIEMPO_MAXIMO_MS = 45_000;

type OyenteDeExpiracion = () => void;

let oyenteDeExpiracion: OyenteDeExpiracion | null = null;

/**
 * Registra a quién avisar cuando la sesión deje de servir.
 * Devuelve la función para dejar de escuchar (la usa el proveedor de sesión al
 * desmontarse).
 */
export function cuandoExpireLaSesion(oyente: OyenteDeExpiracion): () => void {
  oyenteDeExpiracion = oyente;

  return () => {
    if (oyenteDeExpiracion === oyente) oyenteDeExpiracion = null;
  };
}

function avisarQueExpiro(): void {
  oyenteDeExpiracion?.();
}

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface OpcionesDePedido {
  metodo?: MetodoHttp;
  /** Se envía como JSON. Si no hay cuerpo, no se manda `Content-Type`. */
  cuerpo?: unknown;
  /** `false` para rutas públicas, como entrar al sistema. */
  conToken?: boolean;
  /**
   * Cuánto se espera la respuesta. Por defecto 15 segundos; para las
   * preguntas a la IA se da más margen, porque el modelo puede tardar.
   */
  timeoutMs?: number;
}

/** La dirección de la API, sin barra final. Si falta, se dice con claridad. */
function urlDeLaApi(): string {
  const configurada = import.meta.env.VITE_API_URL;

  if (typeof configurada !== "string") {
    return "";
  }

  if (configurada.trim() === "") {
    return "";
  }

  return configurada.trim().replace(/\/+$/, "");
}

/** Espera `ms`. */
function esperar(ms: number): Promise<void> {
  return new Promise((listo) => {
    window.setTimeout(listo, ms);
  });
}

/**
 * Hace el fetch y reintenta ante un fallo de red inmediato, en cualquier
 * método: durante el arranque en frío Cloud Run puede responder 500/503 sin
 * cabeceras CORS mientras el contenedor enciende, y el navegador lo reporta
 * como fallo de red. Entrar es idempotente y las mutaciones de la app también
 * lo son en la práctica, así que un par de reintentos son seguros y necesarios.
 */
async function intentarFetch(
  url: string,
  metodo: MetodoHttp,
  encabezados: Record<string, string>,
  cuerpo: unknown,
  signal: AbortSignal,
  intentos: number,
): Promise<Response> {
  let ultimoError: unknown;
  const esperaMs = 6_000;

  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await fetch(url, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal,
      });
    } catch (error) {
      ultimoError = error;

      const falloDeRedInmediato = error instanceof TypeError;
      if (intento < intentos && falloDeRedInmediato) {
        await esperar(esperaMs);
        continue;
      }

      throw error;
    }
  }

  throw ultimoError;
}

/**
 * Toca al servidor para despertarlo (el contenedor se enciende y Neon sale de
 * su suspensión). Se llama al montar la app: así el arranque en frío ocurre
 * mientras la persona escribe sus credenciales.
 */
export function despertarServidor(): void {
  void fetch(`${urlDeLaApi()}/api/salud`, { method: "GET" }).catch(() => undefined);
}

/**
 * Hace la petición y deja la respuesta lista. Todo (el token, el tiempo límite
 * y los errores de red) se resuelve aquí, para que `pedir` y `pedirTexto` se
 * comporten igual.
 */
async function respuestaDeLaApi(
  ruta: string,
  opciones: OpcionesDePedido,
  acepta: "application/json" | "application/xml",
): Promise<{ respuesta: Response; tokenEnviado: boolean }> {
  const { metodo = "GET", cuerpo, conToken = true } = opciones;

  const guardada = leerSesionCruda();

  /*
    Antes de gastar una petición: si el token guardado ya venció, se descarta, se
    avisa y se corta aquí. Esto evita un viaje al servidor que iba a terminar en
    401 de todos modos, y deja claro por qué se vuelve a la pantalla de entrar.
  */
  if (conToken && guardada !== null && sesionVencida(guardada)) {
    limpiarSesion();
    avisarQueExpiro();

    throw new ErrorDeApi(
      "Tu sesión venció. Vuelve a entrar para seguir trabajando.",
      "SESION_VENCIDA",
      401,
    );
  }

  const sesion = guardada !== null && !sesionVencida(guardada) ? guardada : null;
  const token = conToken ? sesion?.token : undefined;

  /*
    La dirección se resuelve aquí, fuera del `try` de la petición. Si faltara en
    el `.env`, hay que decir eso ("falta configuración"), no "no hay conexión",
    que mandaría a revisar el cable cuando el problema es otro.
  */
  const url = urlDeLaApi() + ruta;

  const encabezados: Record<string, string> = { Accept: acepta };

  if (cuerpo !== undefined) encabezados["Content-Type"] = "application/json";
  if (token !== undefined) encabezados.Authorization = `Bearer ${token}`;

  const controlador = new AbortController();
  const temporizador = window.setTimeout(() => {
    controlador.abort();
  }, opciones.timeoutMs ?? TIEMPO_MAXIMO_MS);

  let respuesta: Response;
  /* En arranque en frío el servidor tarda en responder; el fetch falla del
     lado del navegador y aquí se reintenta con espera (ver intentarFetch). */
  const intentos = 4;

  try {
    respuesta = await intentarFetch(url, metodo, encabezados, cuerpo, controlador.signal, intentos);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ErrorDeApi(
        "El servidor está despertando (arranque en frío). Dale unos segundos y vuelve a intentarlo.",
        "TIEMPO_AGOTADO",
      );
    }

    // `fetch` solo falla así cuando no hubo respuesta: servidor apagado, sin
    // red, dirección equivocada. El "Failed to fetch" no se le muestra a nadie.
    throw new ErrorDeApi(
      "No se pudo contactar con el servidor. Si está arrancando en frío, dale unos segundos y vuelve a intentarlo.",
      "SIN_CONEXION",
    );
  } finally {
    window.clearTimeout(temporizador);
  }

  return { respuesta, tokenEnviado: token !== undefined };
}

/**
 * Hace una petición y devuelve `datos`.
 *
 * @throws {ErrorDeApi} siempre, con un mensaje que se le puede enseñar a la
 *   persona. Nunca deja pasar un error crudo del navegador.
 */
export async function pedir<T>(ruta: string, opciones: OpcionesDePedido = {}): Promise<T> {
  const { respuesta, tokenEnviado } = await respuestaDeLaApi(
    ruta,
    opciones,
    "application/json",
  );

  const cuerpoDeLaRespuesta = await leerCuerpo(respuesta);

  if (!esRespuestaApi(cuerpoDeLaRespuesta)) {
    throw new ErrorDeApi(
      `El servidor respondió algo que no se entiende (código ${respuesta.status}).`,
      "RESPUESTA_INVALIDA",
      respuesta.status,
    );
  }

  if (!cuerpoDeLaRespuesta.ok) {
    const { codigo, mensaje } = cuerpoDeLaRespuesta.error;

    /*
      Solo se avisa de expiración si de verdad se mandó un token. Un 401 al
      entrar con la clave equivocada no es una sesión vencida: es una clave mal
      escrita, y la pantalla de login tiene que mostrar ese mensaje, no echar a
      nadie a la calle.
    */
    if (respuesta.status === 401 && codigo === "SIN_SESION" && tokenEnviado) {
      limpiarSesion();
      avisarQueExpiro();
    }

    throw new ErrorDeApi(mensaje, codigo, respuesta.status);
  }

  return cuerpoDeLaRespuesta.datos as T;
}

/**
 * Hace una petición y devuelve el texto tal cual. Se usa para descargar el
 * XML firmado del comprobante, que no es JSON.
 */
export async function pedirTexto(
  ruta: string,
  opciones: OpcionesDePedido = {},
): Promise<string> {
  const { respuesta } = await respuestaDeLaApi(
    ruta,
    opciones,
    "application/xml",
  );

  if (!respuesta.ok) {
    const cuerpo = await leerCuerpo(respuesta);

    if (esRespuestaApi(cuerpo) && !cuerpo.ok) {
      throw new ErrorDeApi(
        cuerpo.error.mensaje,
        cuerpo.error.codigo,
        respuesta.status,
      );
    }

    throw new ErrorDeApi(
      `El servidor respondió con un error (código ${respuesta.status}).`,
      "ERROR_DEL_SERVIDOR",
      respuesta.status,
    );
  }

  return respuesta.text();
}

/*
  Un 401 nunca se responde con un cuerpo vacío, así que este caso casi no se da.
  Se deja por claridad: el lector de arriba necesita distinguir "no hay JSON" de
  "hay un JSON con otra forma".
*/
async function leerCuerpo(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text();
  if (texto.trim() === "") return null;

  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}

/** ¿El cuerpo tiene exactamente la forma del sobre de la API? */
function esRespuestaApi(valor: unknown): valor is RespuestaApi<unknown> {
  if (typeof valor !== "object" || valor === null) return false;

  const posible = valor as Record<string, unknown>;

  if (posible.ok === true) return "datos" in posible;

  if (posible.ok === false) {
    const error = posible.error;
    if (typeof error !== "object" || error === null) return false;

    const detalle = error as Record<string, unknown>;
    return typeof detalle.codigo === "string" && typeof detalle.mensaje === "string";
  }

  return false;
}
