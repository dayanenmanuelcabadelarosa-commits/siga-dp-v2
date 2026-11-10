/*
  acceso.test.ts — que las tres llamadas del acceso apunten a donde deben.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as acceso from "../../src/api/acceso";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  autorizacionDe,
  respuestaDeExito,
  simularFetch,
} from "../ayudas/api-falsa";

const TOKEN = "token-de-prueba";

const USUARIO = {
  id_usuario: 7,
  usuario: "gerente",
  nombre: "Ana Pérez",
  id_empleado: 3,
  rol: "gerente",
  rol_nombre: "Gerente",
  nivel: 5,
};

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  guardarSesion({
    token: TOKEN,
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("acceso", () => {
  it("entrar llama a la ruta pública con usuario y clave, sin token", async () => {
    const falso = simularFetch(() =>
      respuestaDeExito({
        token: "nuevo-token",
        expira_en: "2026-10-19T10:00:00.000Z",
        usuario: USUARIO,
      }),
    );

    const datos = await acceso.entrar("gerente", "clave-real");

    expect(datos.token).toBe("nuevo-token");

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/acceso/entrar`);
    expect(inicio?.method).toBe("POST");
    expect(inicio?.body).toBe(JSON.stringify({ usuario: "gerente", clave: "clave-real" }));
    expect(autorizacionDe(inicio)).toBeNull();
  });

  it("yo pide la sesión con el token puesto", async () => {
    const falso = simularFetch(() =>
      respuestaDeExito({
        usuario: USUARIO,
        permisos: ["CAPTURAR_PEDIDO"],
        expira_en: "2026-10-19T10:00:00.000Z",
      }),
    );

    const datos = await acceso.yo();

    expect(datos.permisos).toEqual(["CAPTURAR_PEDIDO"]);

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/acceso/yo`);
    expect(autorizacionDe(inicio)).toBe(`Bearer ${TOKEN}`);
  });

  it("salir avisa al servidor con el token puesto", async () => {
    const falso = simularFetch(() => respuestaDeExito({ mensaje: "Hasta luego." }));

    const datos = await acceso.salir();

    expect(datos.mensaje).toBe("Hasta luego.");

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/acceso/salir`);
    expect(inicio?.method).toBe("POST");
    expect(autorizacionDe(inicio)).toBe(`Bearer ${TOKEN}`);
  });
});
