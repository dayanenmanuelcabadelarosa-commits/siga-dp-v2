/*
  cliente-http.test.ts — el cliente HTTP, probado por lo que manda y por lo que
  hace con lo que le contestan.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cuandoExpireLaSesion, pedir } from "../../src/api/cliente-http";
import { ErrorDeApi, mensajeDeError } from "../../src/api/errores";
import { guardarSesion, leerSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  autorizacionDe,
  respuestaDeError,
  respuestaDeExito,
  respuestaJson,
  respuestaQueNoEsJson,
  simularFetch,
} from "../ayudas/api-falsa";

const TOKEN = "token-de-prueba";

function guardarSesionVigente(): void {
  guardarSesion({
    token: TOKEN,
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("pedir()", () => {
  it("manda el token en Authorization y devuelve solo los datos", async () => {
    guardarSesionVigente();
    const falso = simularFetch(() => respuestaDeExito({ saludo: "hola" }));

    const datos = await pedir<{ saludo: string }>("/api/algo");

    expect(datos).toEqual({ saludo: "hola" });

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/algo`);
    expect(inicio?.method).toBe("GET");
    expect(autorizacionDe(inicio)).toBe(`Bearer ${TOKEN}`);
  });

  it("no manda token en una ruta pública", async () => {
    guardarSesionVigente();
    const falso = simularFetch(() => respuestaDeExito({}));

    await pedir("/api/acceso/entrar", { metodo: "POST", cuerpo: {}, conToken: false });

    const [, inicio] = falso.mock.calls[0] ?? [];
    expect(autorizacionDe(inicio)).toBeNull();
  });

  it("manda el cuerpo como JSON, con su Content-Type", async () => {
    const falso = simularFetch(() => respuestaDeExito({}));

    await pedir("/api/algo", { metodo: "POST", cuerpo: { usuario: "ana" } });

    const [, inicio] = falso.mock.calls[0] ?? [];
    expect(inicio?.body).toBe(JSON.stringify({ usuario: "ana" }));
    expect((inicio?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("quita la barra final de la dirección de la API", async () => {
    guardarSesionVigente();
    vi.stubEnv("VITE_API_URL", `${URL_DE_PRUEBA}/`);
    const falso = simularFetch(() => respuestaDeExito({}));

    await pedir("/api/algo");

    const [url] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/algo`);
  });

  it("convierte un error del servidor en ErrorDeApi, con su código y su mensaje", async () => {
    guardarSesionVigente();
    simularFetch(() =>
      respuestaDeError("DATOS_INVALIDOS", "El usuario no puede ir vacío.", 400),
    );

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(ErrorDeApi);
    expect(fallo).toMatchObject({
      codigo: "DATOS_INVALIDOS",
      estado: 400,
      message: "El usuario no puede ir vacío.",
    });
  });

  it("avisa y borra el token cuando el servidor dice SIN_SESION", async () => {
    const aviso = vi.fn();
    const dejarDeEscuchar = cuandoExpireLaSesion(aviso);
    guardarSesionVigente();
    simularFetch(() =>
      respuestaDeError("SIN_SESION", "Necesitas iniciar sesión.", 401),
    );

    await expect(pedir("/api/algo")).rejects.toBeInstanceOf(ErrorDeApi);

    expect(aviso).toHaveBeenCalledTimes(1);
    expect(leerSesion()).toBeNull();

    dejarDeEscuchar();
  });

  it("no avisa de sesión vencida si el 401 fue al escribir mal la clave", async () => {
    const aviso = vi.fn();
    const dejarDeEscuchar = cuandoExpireLaSesion(aviso);
    simularFetch(() =>
      respuestaDeError("CREDENCIALES_INVALIDAS", "Usuario o clave incorrectos.", 401),
    );

    await expect(
      pedir("/api/acceso/entrar", { metodo: "POST", cuerpo: {}, conToken: false }),
    ).rejects.toMatchObject({ codigo: "CREDENCIALES_INVALIDAS" });

    expect(aviso).not.toHaveBeenCalled();

    dejarDeEscuchar();
  });

  it("no avisa de sesión vencida por otros 401 (cuenta bloqueada)", async () => {
    const aviso = vi.fn();
    const dejarDeEscuchar = cuandoExpireLaSesion(aviso);
    guardarSesionVigente();
    simularFetch(() =>
      respuestaDeError("CUENTA_BLOQUEADA", "La cuenta está bloqueada.", 401),
    );

    await expect(pedir("/api/algo")).rejects.toMatchObject({
      codigo: "CUENTA_BLOQUEADA",
    });

    expect(aviso).not.toHaveBeenCalled();
    expect(leerSesion()).not.toBeNull();

    dejarDeEscuchar();
  });

  it("dice con claridad que no hay conexión", async () => {
    guardarSesionVigente();
    simularFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toMatchObject({ codigo: "SIN_CONEXION" });
    expect(mensajeDeError(fallo)).toMatch(/no se pudo contactar/i);
    expect(mensajeDeError(fallo)).not.toMatch(/failed to fetch/i);
  });

  it("dice con claridad que el servidor tardó demasiado", async () => {
    guardarSesionVigente();
    simularFetch(() => Promise.reject(new DOMException("Aborted", "AbortError")));

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toMatchObject({ codigo: "TIEMPO_AGOTADO" });
  });

  it("rechaza una respuesta que no es JSON, en vez de romperse", async () => {
    guardarSesionVigente();
    simularFetch(() => respuestaQueNoEsJson());

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toMatchObject({ codigo: "RESPUESTA_INVALIDA", estado: 502 });
  });

  it("rechaza un JSON con otra forma (sin ok)", async () => {
    guardarSesionVigente();
    simularFetch(() => respuestaJson({ resultado: "no es el sobre" }));

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toMatchObject({ codigo: "RESPUESTA_INVALIDA" });
  });

  it("no gasta la petición si el token guardado ya venció", async () => {
    const aviso = vi.fn();
    const dejarDeEscuchar = cuandoExpireLaSesion(aviso);
    guardarSesion({
      token: TOKEN,
      expiraEn: new Date(Date.now() - 1000).toISOString(),
    });
    const falso = simularFetch(() => respuestaDeExito({}));

    await expect(pedir("/api/algo")).rejects.toMatchObject({
      codigo: "SESION_VENCIDA",
    });

    expect(falso).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(leerSesion()).toBeNull();

    dejarDeEscuchar();
  });

  it("explica qué falta si no está configurada la dirección de la API", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const falso = simularFetch(() => respuestaDeExito({}));

    const fallo = await pedir("/api/algo").catch((error: unknown) => error);

    expect(fallo).toMatchObject({ codigo: "CONFIGURACION" });
    expect(mensajeDeError(fallo)).toMatch(/VITE_API_URL/);
    expect(falso).not.toHaveBeenCalled();
  });
});
