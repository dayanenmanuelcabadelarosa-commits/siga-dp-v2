/*
  Cocina.test.tsx — el tablero de comandas, con la API sustituida.
  ---------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    · Las comandas muestran número, mesa, mesero, estación, líneas y la
      observación del cliente.
    · El filtro por estación pide solo esa estación y cambia lo que se ve.
    · Empezar una comanda manda el POST y pinta el estado nuevo; marcar lista
      hace lo mismo con el paso siguiente.
    · Una comanda que no se puede mover deja el mensaje del servidor visible y
      no cambia la tarjeta.
    · Sin CONFIRMAR_PREPARACION no se ven los botones de avance.
    · Si la carga falla, se explica y Refrescar vuelve a pedir todo.
    · Sin comandas, la pantalla lo dice sin inventar tarjetas.

  Que la base guarde el avance de verdad lo comprueban las pruebas del servidor
  contra PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cocina } from "../../src/paginas/Cocina";
import { guardarSesion } from "../../src/sesion/almacen";
import {
  URL_DE_PRUEBA,
  simularFetch,
} from "../ayudas/api-falsa";
import {
  apiDeCocina,
  estadoDeCocinaDePrueba,
} from "../ayudas/api-de-cocina";
import type { ApiDeCocina } from "../ayudas/api-de-cocina";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

function montar(permisos: string[] = PERMISOS_DEL_GERENTE): ApiDeCocina {
  const api = apiDeCocina(estadoDeCocinaDePrueba());

  simularFetch(api.manejador);

  montarConSesion(<Cocina />, {
    sesion: sesionFalsa({ permisos }),
  });

  return api;
}

function tarjeta(numero: number): HTMLElement {
  return screen.getByRole("listitem", {
    name: `Comanda ${numero} de la mesa ${
      numero === 1041 ? 1 : 2
    }`,
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  guardarSesion({
    token: "token-de-prueba",
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("Cocina", () => {
  it("muestra las comandas con mesa, mesero, estación y líneas", async () => {
    montar();

    const primera = await screen.findByText("Comanda 1041");
    expect(primera).toBeTruthy();

    const comanda = within(tarjeta(1041));
    expect(comanda.getByText("Mesa 1 · Luis")).toBeTruthy();
    expect(comanda.getByText(/Parrilla · enviada a las/)).toBeTruthy();
    expect(comanda.getByText("2 × Pollo a la brasa")).toBeTruthy();
    expect(comanda.getByText("sin cebolla")).toBeTruthy();
    expect(comanda.getByText("Pendiente")).toBeTruthy();
  });

  it("filtra por estación y pide solo esa estación al servidor", async () => {
    const api = montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(screen.getByRole("button", { name: /Barra/ }));

    await waitFor(() => {
      expect(screen.queryByText("Comanda 1041")).toBeNull();
    });

    expect(screen.getByText("Comanda 1042")).toBeTruthy();
    expect(
      api.peticiones.some((peticion) =>
        peticion.url.endsWith("/api/cocina/comandas?estacion=2"),
      ),
    ).toBe(true);
  });

  it("empezar una comanda la deja en preparación", async () => {
    const api = montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(
      screen.getByRole("button", { name: "Empezar la comanda 1041" }),
    );

    await waitFor(() => {
      expect(
        within(tarjeta(1041)).getByText("En preparación"),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", { name: "Marcar lista la comanda 1041" }),
    ).toBeTruthy();
    expect(
      api.peticiones.some(
        (peticion) =>
          peticion.metodo === "POST" &&
          peticion.url.endsWith("/api/cocina/comandas/1/iniciar"),
      ),
    ).toBe(true);
  });

  it("marcar lista una comanda la deja preparada para servir", async () => {
    const api = montar();

    await screen.findByText("Comanda 1042");
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar lista la comanda 1042" }),
    );

    await waitFor(() => {
      expect(within(tarjeta(1042)).getByText("Lista para servir")).toBeTruthy();
    });

    expect(within(tarjeta(1042)).getByText("Preparado")).toBeTruthy();
    expect(
      api.peticiones.some(
        (peticion) =>
          peticion.metodo === "POST" &&
          peticion.url.endsWith("/api/cocina/comandas/2/preparar"),
      ),
    ).toBe(true);
  });

  it("si la comanda no se puede mover, muestra el mensaje y no cambia la tarjeta", async () => {
    const api = montar();
    await screen.findByText("Comanda 1041");

    api.fallos.push({
      metodo: "POST",
      sufijo: "/api/cocina/comandas/1/iniciar",
      codigo: "CONFLICTO_DE_ESTADO",
      mensaje: "Esa comanda ya se empezó.",
      estado: 409,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Empezar la comanda 1041" }),
    );

    await screen.findByText("Esa comanda ya se empezó.");
    expect(
      screen.getByRole("button", { name: "Empezar la comanda 1041" }),
    ).toBeTruthy();
    expect(api.comandas()[0]?.estado).toBe("Pendiente");
  });

  it("sin CONFIRMAR_PREPARACION no muestra los botones de avance", async () => {
    montar([]);

    await screen.findByText("Comanda 1041");

    expect(
      screen.queryByRole("button", { name: /Empezar la comanda/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Marcar lista la comanda/ }),
    ).toBeNull();
  });

  it("si la carga falla, lo explica y Refrescar vuelve a pedir todo", async () => {
    const api = apiDeCocina(estadoDeCocinaDePrueba());
    api.fallos.push({
      metodo: "GET",
      sufijo: "/api/cocina/comandas",
      codigo: "SIN_CONEXION",
      mensaje: "No se pudo contactar con el servidor.",
      estado: 500,
    });
    simularFetch(api.manejador);
    montarConSesion(<Cocina />, {
      sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
    });

    await screen.findByText("No se pudo contactar con el servidor.");

    api.fallos.splice(0, api.fallos.length);
    fireEvent.click(screen.getByRole("button", { name: /Refrescar/ }));

    await screen.findByText("Comanda 1041");
    expect(screen.queryByText("No se pudo contactar con el servidor.")).toBeNull();
  });

  it("sin comandas activas lo dice sin inventar tarjetas", async () => {
    const api = apiDeCocina({
      estaciones: [
        { id_estacion: 1, nombre: "Parrilla", pendientes: 0 },
        { id_estacion: 2, nombre: "Barra", pendientes: 0 },
      ],
      comandas: [],
      productos: [],
    });
    simularFetch(api.manejador);
    montarConSesion(<Cocina />, {
      sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
    });

    expect(
      await screen.findByText(/No hay comandas activas/),
    ).toBeTruthy();
    expect(screen.queryByText(/^Comanda 1041$/)).toBeNull();
  });

  it("la pestaña Disponibilidad lista los productos con su estado", async () => {
    montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad" }));

    expect(await screen.findByText("Pollo a la brasa")).toBeTruthy();
    expect(screen.getByText("Jugo de chinola")).toBeTruthy();
    expect(screen.getByText("Disponible")).toBeTruthy();
    expect(screen.getByText("Agotado")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Marcar agotado Pollo a la brasa" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reponer Jugo de chinola" }),
    ).toBeTruthy();
  });

  it("marcar agotado manda el estado y lo pinta", async () => {
    const api = montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad" }));
    await screen.findByText("Pollo a la brasa");

    fireEvent.click(
      screen.getByRole("button", { name: "Marcar agotado Pollo a la brasa" }),
    );

    await screen.findByText("Pollo a la brasa quedó marcado como agotado.");
    expect(
      screen.getByRole("button", { name: "Reponer Pollo a la brasa" }),
    ).toBeTruthy();
    expect(
      api.peticiones.some(
        (peticion) =>
          peticion.metodo === "PATCH" &&
          peticion.url.endsWith(
            "/api/cocina/productos/1/disponibilidad",
          ) &&
          peticion.cuerpo?.disponible === false,
      ),
    ).toBe(true);
  });

  it("reponer un agotado manda el estado contrario", async () => {
    const api = montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad" }));
    await screen.findByText("Jugo de chinola");

    fireEvent.click(
      screen.getByRole("button", { name: "Reponer Jugo de chinola" }),
    );

    await screen.findByText("Jugo de chinola vuelve a estar disponible.");
    expect(
      screen.getByRole("button", { name: "Marcar agotado Jugo de chinola" }),
    ).toBeTruthy();
    expect(
      api.peticiones.some(
        (peticion) =>
          peticion.metodo === "PATCH" &&
          peticion.url.endsWith(
            "/api/cocina/productos/2/disponibilidad",
          ) &&
          peticion.cuerpo?.disponible === true,
      ),
    ).toBe(true);
  });

  it("sin REPORTAR_AGOTADO no aparece la pestaña de disponibilidad", async () => {
    montar(["CONFIRMAR_PREPARACION"]);

    await screen.findByText("Comanda 1041");

    expect(
      screen.queryByRole("tab", { name: "Disponibilidad" }),
    ).toBeNull();
    expect(screen.getByRole("tab", { name: "Comandas" })).toBeTruthy();
  });

  it("si el cambio de disponibilidad falla, muestra el mensaje y no lo pinta", async () => {
    const api = montar();

    await screen.findByText("Comanda 1041");
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad" }));
    await screen.findByText("Pollo a la brasa");

    api.fallos.push({
      metodo: "PATCH",
      sufijo: "/api/cocina/productos/1/disponibilidad",
      codigo: "NO_ENCONTRADO",
      mensaje: "Ese producto no existe.",
      estado: 404,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Marcar agotado Pollo a la brasa" }),
    );

    await screen.findByText("Ese producto no existe.");
    expect(
      screen.getByRole("button", { name: "Marcar agotado Pollo a la brasa" }),
    ).toBeTruthy();
    expect(api.productos()[0]?.disponible).toBe(true);
  });
});
