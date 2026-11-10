/*
  personal.test.ts — que las llamadas del módulo apunten a donde deben.
  -------------------------------------------------------------------

  Se comprueba el cable, no la pantalla: la ruta, el método, el cuerpo y el
  token. Que el servidor haga bien su trabajo lo comprueban sus 29 pruebas
  contra PostgreSQL.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as personal from "../../src/api/personal";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  autorizacionDe,
  respuestaDeExito,
  simularFetch,
} from "../ayudas/api-falsa";

const TOKEN = "token-de-prueba";

const EMPLEADO = {
  id_empleado: 8,
  cedula: "001-0000008-1",
  nombre: "Luis Gómez",
  telefono: null,
  fecha_ingreso: "2026-01-15",
  id_rol: 4,
  rol: "mesero",
  rol_nombre: "Mesero",
  nivel: 2,
  id_usuario: 8,
  usuario: "lgomez",
  estado: "Activo",
  estado_empleado: "Activo",
  estado_usuario: "Activo",
  intentos_fallidos: 0,
  ultimo_acceso: null,
} as const;

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

describe("personal", () => {
  it("listarPersonal pide la lista con el token puesto", async () => {
    const falso = simularFetch(() =>
      respuestaDeExito({
        empleados: [EMPLEADO],
        roles: [
          {
            id_rol: 4,
            codigo: "mesero",
            nombre: "Mesero",
            nivel: 2,
            descripcion: null,
          },
        ],
      }),
    );

    const datos = await personal.listarPersonal();

    expect(datos.empleados).toHaveLength(1);
    expect(datos.roles[0]?.codigo).toBe("mesero");

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/personal`);
    expect(inicio?.method).toBe("GET");
    expect(autorizacionDe(inicio)).toBe(`Bearer ${TOKEN}`);
  });

  it("crearEmpleado manda el cuerpo tal cual", async () => {
    const falso = simularFetch(() => respuestaDeExito(EMPLEADO, 201));

    const datos = {
      cedula: "001-0000008-1",
      nombre: "Luis Gómez",
      telefono: "",
      id_rol: 4,
      usuario: "lgomez",
      clave: "clave-de-prueba",
    };

    await personal.crearEmpleado(datos);

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/personal`);
    expect(inicio?.method).toBe("POST");
    expect(inicio?.body).toBe(JSON.stringify(datos));
    expect(autorizacionDe(inicio)).toBe(`Bearer ${TOKEN}`);
  });

  it("editarEmpleado usa PATCH en la ruta del empleado", async () => {
    const falso = simularFetch(() => respuestaDeExito(EMPLEADO));

    await personal.editarEmpleado(8, {
      nombre: "Luis Gómez Pérez",
      telefono: "809-555-0101",
      id_rol: 4,
    });

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/personal/8`);
    expect(inicio?.method).toBe("PATCH");
  });

  it("baja, reactivar y desbloquear usan POST en su ruta", async () => {
    const falso = simularFetch(() => respuestaDeExito(EMPLEADO));

    await personal.darDeBajaEmpleado(8);
    await personal.reactivarEmpleado(8);
    await personal.desbloquearEmpleado(8);

    const rutas = falso.mock.calls.map(([url, inicio]) => [
      url,
      inicio?.method,
    ]);

    expect(rutas).toEqual([
      [`${URL_DE_PRUEBA}/api/personal/8/baja`, "POST"],
      [`${URL_DE_PRUEBA}/api/personal/8/reactivar`, "POST"],
      [`${URL_DE_PRUEBA}/api/personal/8/desbloquear`, "POST"],
    ]);
  });

  it("cambiarClaveDeEmpleado manda la clave nueva", async () => {
    const falso = simularFetch(() =>
      respuestaDeExito({ mensaje: "La clave quedó actualizada." }),
    );

    const datos = await personal.cambiarClaveDeEmpleado(8, "clave-nueva-123");

    expect(datos.mensaje).toBe("La clave quedó actualizada.");

    const [url, inicio] = falso.mock.calls[0] ?? [];
    expect(url).toBe(`${URL_DE_PRUEBA}/api/personal/8/clave`);
    expect(inicio?.method).toBe("POST");
    expect(inicio?.body).toBe(JSON.stringify({ clave: "clave-nueva-123" }));
  });
});
