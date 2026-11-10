/*
  App.test.tsx — el recorrido completo del cliente, con la sesión de verdad.
  ------------------------------------------------------------------------

  Se monta la aplicación entera (router, proveedor de sesión y pantallas) con la
  API sustituida. Se comprueba lo que pide el criterio de salida de la Fase 3:

    · Sin sesión, se llega a la pantalla de entrar.
    · Con sesión, se ve el inicio.
    · Cada rol ve solo sus pantallas en el menú.
    · Escribir a mano la dirección de una pantalla sin permiso no la abre.
    · Se puede cerrar sesión y volver al login.
*/

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { guardarSesion } from "../src/sesion/almacen";
import { ProveedorSesion } from "../src/sesion/ContextoSesion";
import type { UsuarioDeSesion } from "../src/api/tipos";
import {
  URL_DE_PRUEBA,
  respuestaDeError,
  respuestaDeExito,
  simularFetch,
} from "./ayudas/api-falsa";
import {
  PERMISOS_DEL_GERENTE,
  PERMISOS_DEL_MESERO,
  USUARIO_DE_PRUEBA,
} from "./ayudas/sesion-de-prueba";

const USUARIO_MESERO: UsuarioDeSesion = {
  ...USUARIO_DE_PRUEBA,
  id_usuario: 2,
  usuario: "mesero",
  nombre: "Luis Gómez",
  rol: "mesero",
  rol_nombre: "Mesero",
  nivel: 2,
};

/** Una fila de la lista de personal, con la forma que devuelve la API. */
const EMPLEADO_DE_PRUEBA = {
  id_empleado: 1,
  cedula: "001-0000001-1",
  nombre: "Ana Pérez",
  telefono: "809-555-0101",
  fecha_ingreso: "2026-01-15",
  id_rol: 2,
  rol: "gerente",
  rol_nombre: "Gerente",
  nivel: 5,
  id_usuario: 1,
  usuario: "gerente",
  estado: "Activo",
  estado_empleado: "Activo",
  estado_usuario: "Activo",
  intentos_fallidos: 0,
  ultimo_acceso: null,
} as const;

function enUnaHora(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function montar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  );
}

/** Deja una sesión lista y responde a `/yo` (y a `/salir`). */
function prepararSesion(usuario: UsuarioDeSesion, permisos: string[]) {
  guardarSesion({ token: "token-de-prueba", expiraEn: enUnaHora() });

  return simularFetch((url) => {
    if (url.endsWith("/api/acceso/yo")) {
      return respuestaDeExito({ usuario, permisos, expira_en: enUnaHora() });
    }

    if (url.endsWith("/api/acceso/salir")) {
      return respuestaDeExito({ mensaje: "Hasta luego." });
    }

    if (url.endsWith("/api/personal")) {
      return respuestaDeExito({
        empleados: [EMPLEADO_DE_PRUEBA],
        roles: [],
      });
    }

    return respuestaDeError("NO_ENCONTRADO", "Esa ruta no existe.", 404);
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("App", () => {
  it("sin sesión, muestra la pantalla de entrar", async () => {
    simularFetch(() => respuestaDeExito({}));

    montar("/");

    expect(
      await screen.findByRole("heading", { name: "Asadero Doña Pula" }),
    ).toBeInTheDocument();
  });

  it("el gerente ve el inicio y sus pantallas", async () => {
    prepararSesion(USUARIO_DE_PRUEBA, PERMISOS_DEL_GERENTE);

    montar("/");

    expect(
      await screen.findByRole("heading", { name: /Ana/ }),
    ).toBeInTheDocument();

    const menu = screen.getByRole("navigation", { name: "Pantallas" });

    expect(
      within(menu).getByRole("link", { name: "Personal y usuarios" }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Pedidos" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Propinas" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Cuentas" })).toBeInTheDocument();

    /* Y en el contenido están las tarjetas de esos mismos módulos. */
    const contenido = screen.getByRole("main");

    expect(
      within(contenido).getByRole("link", { name: /Personal y usuarios/ }),
    ).toBeInTheDocument();
  });

  it("el mesero solo ve sus pantallas, no las de gerencia", async () => {
    prepararSesion(USUARIO_MESERO, PERMISOS_DEL_MESERO);

    montar("/");

    expect(
      await screen.findByRole("heading", { name: /Luis/ }),
    ).toBeInTheDocument();

    const menu = screen.getByRole("navigation", { name: "Pantallas" });

    expect(within(menu).getByRole("link", { name: "Pedidos" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Propinas" })).toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "Personal y usuarios" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "Parámetros del sistema" }),
    ).not.toBeInTheDocument();

    const contenido = screen.getByRole("main");

    expect(
      within(contenido).getByRole("link", { name: /Pedidos/ }),
    ).toBeInTheDocument();
    expect(
      within(contenido).getByRole("link", { name: /Propinas/ }),
    ).toBeInTheDocument();
    expect(
      within(contenido).queryByRole("link", { name: /Personal y usuarios/ }),
    ).not.toBeInTheDocument();
  });

  it("el mesero no abre una pantalla de gerencia escribiendo la dirección", async () => {
    prepararSesion(USUARIO_MESERO, PERMISOS_DEL_MESERO);

    montar("/personal");

    expect(
      await screen.findByRole("heading", {
        name: "No tienes permiso para esta pantalla",
      }),
    ).toBeInTheDocument();
  });

  it("el gerente abre un módulo que todavía no existe y se le dice en qué fase llega", async () => {
    prepararSesion(USUARIO_DE_PRUEBA, PERMISOS_DEL_GERENTE);

    montar("/parametros");

    expect(
      await screen.findByRole("heading", {
        name: "Esta pantalla se está cocinando",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/Próximamente/)).toBeInTheDocument();
  });

  it("el gerente abre Personal y ve la lista que devolvió el servidor", async () => {
    prepararSesion(USUARIO_DE_PRUEBA, PERMISOS_DEL_GERENTE);

    montar("/personal");

    expect(
      await screen.findByRole("heading", { name: "Personal y usuarios" }),
    ).toBeInTheDocument();

    const tabla = await screen.findByRole("table", {
      name: "Personal registrado",
    });

    expect(within(tabla).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(tabla).getByText("001-0000001-1")).toBeInTheDocument();
    expect(within(tabla).getByText("gerente")).toBeInTheDocument();
  });

  it("cerrar sesión devuelve a la pantalla de entrar", async () => {
    prepararSesion(USUARIO_DE_PRUEBA, PERMISOS_DEL_GERENTE);

    montar("/");

    await screen.findByRole("heading", { name: /Ana/ });

    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(
      await screen.findByRole("heading", { name: "Asadero Doña Pula" }),
    ).toBeInTheDocument();
  });
});
