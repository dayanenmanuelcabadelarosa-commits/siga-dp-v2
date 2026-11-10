/*
  api-falsa.ts — un servidor de mentira para las pruebas del cliente.
  ------------------------------------------------------------------

  Las pruebas del cliente sustituyen `fetch` para poder provocar, a voluntad,
  un 500, un 401, una respuesta rota o un servidor apagado. Lo que se comprueba
  con eso es **nuestro** cliente: que mande el token, que lea el sobre, que arme
  los errores.

  Que el servidor de verdad responda bien lo comprueban las 157 pruebas del
  servidor, contra PostgreSQL. Aquí no se simula la base: se simula el cable.
*/

import { vi } from "vitest";
import type { Mock } from "vitest";

/** La dirección que se usa en todas las pruebas. */
export const URL_DE_PRUEBA = "http://api.de-prueba";

type Manejador = (url: string, inicio?: RequestInit) => Response | Promise<Response>;

/** El cuerpo de un éxito, como lo manda el servidor. */
export function respuestaDeExito<T>(datos: T, estado = 200): Response {
  return respuestaJson({ ok: true, datos }, estado);
}

/** El cuerpo de un error, como lo manda el servidor. */
export function respuestaDeError(
  codigo: string,
  mensaje: string,
  estado = 400,
): Response {
  return respuestaJson({ ok: false, error: { codigo, mensaje } }, estado);
}

/** Una respuesta JSON cruda, para probar también lo que no tiene la forma esperada. */
export function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

/** Una respuesta que no es JSON (por ejemplo, la página de error de un proxy). */
export function respuestaQueNoEsJson(estado = 502): Response {
  return new Response("<html>Bad gateway</html>", {
    status: estado,
    headers: { "Content-Type": "text/html" },
  });
}

function urlDe(entrada: RequestInfo | URL): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.toString();
  return entrada.url;
}

/**
 * Cambia `fetch` por el manejador dado y devuelve el doble, para poder mirar
 * qué se le pidió. Hay que llamar a `vi.unstubAllGlobals()` al terminar.
 */
export function simularFetch(manejador: Manejador): Mock<typeof fetch> {
  const falso = vi.fn<typeof fetch>((entrada, inicio) =>
    Promise.resolve(manejador(urlDe(entrada), inicio)),
  );

  vi.stubGlobal("fetch", falso);

  return falso;
}

/** La cabecera `Authorization` de una llamada, si la llevaba. */
export function autorizacionDe(inicio: RequestInit | undefined): string | null {
  const encabezados = inicio?.headers;
  if (encabezados === undefined) return null;

  if (encabezados instanceof Headers) {
    return encabezados.get("Authorization");
  }

  if (Array.isArray(encabezados)) {
    const par = encabezados.find(([nombre]) => nombre === "Authorization");
    return par?.[1] ?? null;
  }

  const valor = encabezados.Authorization;
  return valor ?? null;
}
