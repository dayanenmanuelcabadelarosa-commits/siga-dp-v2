/*
  Propinas.test.tsx — registrar y cerrar propinas, con la API sustituida.
  ----------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que el servidor responde:

    · La mesa se elige explícitamente: el desplegable empieza vacío y solo
      ofrece las mesas que todavía no tienen propina.
    · Registrar en efectivo manda mesa, monto y forma, y pinta el resumen que
      devolvió el servidor.
    · Con tarjeta, la referencia es obligatoria; sin ella no se llama a la API.
    · Un rechazo del servidor se muestra y no se inventa un estado nuevo.
    · El mesero no ve el cierre; el gerente sí.
    · Cerrar manda lo contado y muestra el cierre oficial de la base.
    · Sin contado no se abre la confirmación; si el servidor rechaza el cierre,
      la ventana sigue abierta con el mensaje.

  Que la base guarde de verdad las propinas y el cierre lo comprueban las
  pruebas del servidor contra PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Propinas } from "../../src/paginas/Propinas";
import { guardarSesion } from "../../src/sesion/almacen";
import { URL_DE_PRUEBA, simularFetch } from "../ayudas/api-falsa";
import {
  apiDePropinas,
  estadoDePropinasDePrueba,
} from "../ayudas/api-de-propinas";
import type {
  ApiDePropinas,
  EstadoDePropinas,
  FalloDePropinas,
} from "../ayudas/api-de-propinas";
import {
  PERMISOS_DEL_GERENTE,
  PERMISOS_DEL_MESERO,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

interface OpcionesDeMontaje {
  permisos?: string[];
  estado?: EstadoDePropinas;
  fallos?: FalloDePropinas[];
}

function montar({
  permisos = PERMISOS_DEL_MESERO,
  estado = estadoDePropinasDePrueba(),
  fallos = [],
}: OpcionesDeMontaje = {}): ApiDePropinas {
  const api = apiDePropinas(estado);
  api.fallos.push(...fallos);

  simularFetch(api.manejador);
  montarConSesion(<Propinas />, { sesion: sesionFalsa({ permisos }) });

  return api;
}

function cambiar(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });
}

/** El primer renglón abierto del cierre; la tabla no tiene botones con nombre propio. */
function primerBotonDeCierre(): HTMLElement {
  const [boton] = screen.getAllByRole("button", { name: "Cerrar propinas" });

  if (boton === undefined) {
    throw new Error("No hay ningún botón de cierre en la tabla.");
  }

  return boton;
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

describe("Propinas — registrar", () => {
  it("muestra las mesas, el total y la mesa se elige sin valor por defecto", async () => {
    montar();

    await screen.findByText("Registrar una propina");

    const mesa = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Mesa",
    });
    expect(mesa.value).toBe("");
    expect(
      within(mesa).getByRole("option", { name: "3 — Barra" }),
    ).toBeTruthy();
    expect(
      within(mesa).queryByRole("option", { name: "1 — Salón" }),
    ).toBeNull();
    expect(screen.getByText("RD$ 350.00")).toBeTruthy();
    expect(screen.getAllByText("Registrada")).toHaveLength(2);
    expect(screen.getByText("Pendiente")).toBeTruthy();
  });

  it("registra en efectivo con los datos que se eligieron", async () => {
    const api = montar();

    await screen.findByText("Registrar una propina");

    cambiar("Mesa", "3");
    cambiar("Monto", "75.50");
    cambiar("Forma de pago", "Efectivo");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar propina" }),
    );

    await screen.findByText("Propina de la mesa 3 registrada.");
    await waitFor(() => {
      expect(screen.getByText("RD$ 425.50")).toBeTruthy();
    });

    const peticion = api.peticiones.find(
      (actual) => actual.metodo === "POST",
    );
    expect(peticion?.cuerpo).toEqual({
      mesa: 3,
      monto: "75.50",
      forma: "Efectivo",
    });
    expect(api.resumen().propinas).toHaveLength(3);
    expect(api.resumen().total).toBe(425.5);
  });

  it("con tarjeta exige la referencia y no llama a la API si falta", async () => {
    const api = montar();

    await screen.findByText("Registrar una propina");

    cambiar("Mesa", "3");
    cambiar("Monto", "50.00");
    cambiar("Forma de pago", "Tarjeta");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar propina" }),
    );

    expect(
      await screen.findByText("Escribe la referencia de la tarjeta."),
    ).toBeTruthy();
    expect(
      api.peticiones.filter((actual) => actual.metodo === "POST"),
    ).toHaveLength(0);
  });

  it("con tarjeta manda la referencia", async () => {
    const api = montar();

    await screen.findByText("Registrar una propina");

    cambiar("Mesa", "3");
    cambiar("Monto", "50.00");
    cambiar("Forma de pago", "Tarjeta");
    cambiar("Referencia", "AUTH-9");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar propina" }),
    );

    await screen.findByText("Propina de la mesa 3 registrada.");

    const peticion = api.peticiones.find(
      (actual) => actual.metodo === "POST",
    );
    expect(peticion?.cuerpo).toEqual({
      mesa: 3,
      monto: "50.00",
      forma: "Tarjeta",
      referencia: "AUTH-9",
    });
  });

  it("muestra el rechazo del servidor y no cambia el total", async () => {
    const api = montar({
      fallos: [
        {
          metodo: "POST",
          sufijo: "/api/propinas",
          codigo: "CONFLICTO_DE_ESTADO",
          mensaje: "Ya registraste una propina para esa mesa hoy.",
          estado: 409,
        },
      ],
    });

    await screen.findByText("Registrar una propina");

    cambiar("Mesa", "3");
    cambiar("Monto", "75.50");
    cambiar("Forma de pago", "Efectivo");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar propina" }),
    );

    expect(
      await screen.findByText(
        "Ya registraste una propina para esa mesa hoy.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("RD$ 350.00")).toBeTruthy();
    expect(api.resumen().propinas).toHaveLength(2);
  });

  it("sin mesas lo dice y no muestra el formulario", async () => {
    const estado = estadoDePropinasDePrueba();
    estado.mesas = [];
    estado.propinas = [];
    estado.filas = [];

    montar({ estado });

    expect(
      (await screen.findAllByText(/No tienes mesas con pedido hoy/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Mesa")).toBeNull();
  });

  it("si la carga falla, explica y Refrescar vuelve a pedir", async () => {
    const api = montar({
      fallos: [
        {
          metodo: "GET",
          sufijo: "/api/propinas",
          codigo: "ERROR_DE_SERVIDOR",
          mensaje: "El servidor no respondió.",
          estado: 500,
        },
      ],
    });

    expect(await screen.findByText("El servidor no respondió.")).toBeTruthy();

    api.fallos.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Refrescar/ }));

    expect(await screen.findByText("RD$ 350.00")).toBeTruthy();
  });

  it("el mesero no ve la pestaña de cierre", async () => {
    montar();

    await screen.findByText("Registrar una propina");

    expect(
      screen.queryByRole("tab", { name: "Cierre del día" }),
    ).toBeNull();
  });
});

describe("Propinas — cierre del día", () => {
  it("el gerente ve lo esperado por cada mesero", async () => {
    montar({ permisos: PERMISOS_DEL_GERENTE });

    const pestana = await screen.findByRole("tab", {
      name: "Cierre del día",
    });
    fireEvent.click(pestana);

    expect(await screen.findByText("Luis Gómez")).toBeTruthy();
    expect(screen.getByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByText("RD$ 100.00")).toBeTruthy();
    expect(screen.getByText("RD$ 250.00")).toBeTruthy();
    expect(screen.getAllByText("RD$ 350.00").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Contado de Luis Gómez")).toBeTruthy();
  });

  it("cierra con lo contado y muestra el resultado de la base", async () => {
    const api = montar({ permisos: PERMISOS_DEL_GERENTE });

    fireEvent.click(
      await screen.findByRole("tab", { name: "Cierre del día" }),
    );
    await screen.findByText("Luis Gómez");

    cambiar("Contado de Luis Gómez", "90.00");
    fireEvent.click(primerBotonDeCierre());

    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Cerrar propinas" }),
    );

    await screen.findByText("Propinas de Luis Gómez cerradas.");
    expect(screen.getByText("Cerrado")).toBeTruthy();
    expect(screen.getAllByText("RD$ -10.00").length).toBeGreaterThan(0);

    const peticion = api.peticiones.find(
      (actual) =>
        actual.metodo === "POST" &&
        actual.url.endsWith("/api/propinas/cierre"),
    );
    expect(peticion?.cuerpo).toEqual({
      idEmpleado: 7,
      contado: "90.00",
    });
    expect(api.cierre().filas[0]?.cierre?.diferencia).toBe(-10);
  });

  it("sin contado no abre la confirmación ni llama a la API", async () => {
    const api = montar({ permisos: PERMISOS_DEL_GERENTE });

    fireEvent.click(
      await screen.findByRole("tab", { name: "Cierre del día" }),
    );
    await screen.findByText("Luis Gómez");

    fireEvent.click(primerBotonDeCierre());

    expect(
      await screen.findByText(
        "Escribe lo contado con hasta dos decimales antes de cerrar.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      api.peticiones.filter(
        (actual) =>
          actual.metodo === "POST" &&
          actual.url.endsWith("/api/propinas/cierre"),
      ),
    ).toHaveLength(0);
  });

  it("si el servidor rechaza el cierre, la ventana sigue abierta con el mensaje", async () => {
    montar({
      permisos: PERMISOS_DEL_GERENTE,
      fallos: [
        {
          metodo: "POST",
          sufijo: "/api/propinas/cierre",
          codigo: "CONFLICTO_DE_ESTADO",
          mensaje: "Ya se cerraron las propinas de Luis Gómez hoy.",
          estado: 409,
        },
      ],
    });

    fireEvent.click(
      await screen.findByRole("tab", { name: "Cierre del día" }),
    );
    await screen.findByText("Luis Gómez");

    cambiar("Contado de Luis Gómez", "100.00");
    fireEvent.click(primerBotonDeCierre());

    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Cerrar propinas" }),
    );

    expect(
      await screen.findByText(
        "Ya se cerraron las propinas de Luis Gómez hoy.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByText("Abierto")).toHaveLength(2);
  });
});
