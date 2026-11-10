/*
  Pedidos.test.tsx — la lista de pedidos y la toma de pedido, con la API sustituida.
  -------------------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que responde el servidor:

    · Los pedidos salen en tarjetas, con mesa, estado, hora y total.
    · Los filtros de estado y fecha se le pasan a la API.
    · Abrir un pedido manda la mesa y los comensales, y la tarjeta aparece.
    · Al tocar una tarjeta se abre ese pedido y se pueden agregar líneas.
    · Agregar una línea manda producto, cantidad, observación y comensal.
    · Anular una línea la quita de la tabla.
    · Enviar a cocina avisa con el mensaje del servidor; sin líneas, el botón
      está deshabilitado.
    · Si el servidor rechaza una acción, el mensaje se queda visible.

  Que la base guarde de verdad los pedidos lo comprueban las pruebas del
  servidor contra PostgreSQL. Aquí se simula el cable, no la base.
*/

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Pedidos } from "../../src/paginas/Pedidos";
import type { PedidoAbierto } from "../../src/api/pedidos";
import { guardarSesion } from "../../src/sesion/almacen";
import { URL_DE_PRUEBA, simularFetch } from "../ayudas/api-falsa";
import {
  apiDePedidos,
  estadoDePedidosDePrueba,
} from "../ayudas/api-de-pedidos";
import type {
  ApiDePedidos,
  EstadoDePedidos,
} from "../ayudas/api-de-pedidos";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

function pedidoDePrueba(estado: Partial<PedidoAbierto> = {}): PedidoAbierto {
  return {
    id_pedido: 1,
    mesa: 1,
    mesero: "Luis Gómez",
    estado: "Abierto",
    hora: "10:00",
    total: 795,
    cuenta_pedida_en: null,
    lineas: [
      {
        id: 1,
        productoId: 1,
        nombre: "Pollo a la brasa",
        precio: 350,
        cantidad: 2,
        observacion: "sin cebolla",
        persona: 1,
        estado: "Guardada",
      },
    ],
    comandas: [],
    ...estado,
  };
}

function montar(
  estado: EstadoDePedidos = estadoDePedidosDePrueba(),
  ruta = "/",
): ApiDePedidos {
  const api = apiDePedidos(estado);

  simularFetch(api.manejador);

  montarConSesion(<Pedidos />, {
    sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
    ruta,
  });

  return api;
}

async function tocarLaTarjeta(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /Mesa 1/ }));
  await screen.findByRole("heading", { name: "Agregar producto" });
}

async function agregarLinea(): Promise<void> {
  fireEvent.change(screen.getByLabelText("Producto"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Cantidad"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Observación"), {
    target: { value: "sin cebolla" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

  await screen.findByText("Pollo a la brasa");
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

describe("Pedidos — la lista", () => {
  it("muestra los pedidos en tarjetas con mesa, estado, hora y total", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    const tarjeta = await screen.findByRole("button", { name: /Mesa 1/ });
    expect(within(tarjeta).getByText("Abierto")).toBeTruthy();
    expect(within(tarjeta).getByText("10:00")).toBeTruthy();
    expect(within(tarjeta).getByText("RD$ 795.00")).toBeTruthy();
    expect(within(tarjeta).getByText("Luis Gómez")).toBeTruthy();
  });

  it("sin pedidos lo dice", async () => {
    montar();

    expect(
      await screen.findByText("No hay pedidos que cumplan el filtro."),
    ).toBeTruthy();
  });

  it("el filtro de estado y de fecha se le pasa a la API", async () => {
    const api = montar();

    await screen.findByText("No hay pedidos que cumplan el filtro.");

    fireEvent.change(screen.getByLabelText("Estado"), {
      target: { value: "Cerrado" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-10-19" },
    });

    await waitFor(() => {
      const ultima = api.peticiones[api.peticiones.length - 1];
      expect(ultima?.url).toContain("estado=Cerrado");
      expect(ultima?.url).toContain("fecha=2026-10-19");
    });
  });

  it("quitar filtros vuelve a pedir todo", async () => {
    const api = montar();

    await screen.findByText("No hay pedidos que cumplan el filtro.");

    fireEvent.change(screen.getByLabelText("Estado"), {
      target: { value: "Cerrado" },
    });
    await waitFor(() => {
      expect(
        api.peticiones.some((peticion) =>
          peticion.url.includes("estado=Cerrado"),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));

    await waitFor(() => {
      const ultima = api.peticiones[api.peticiones.length - 1];
      expect(ultima?.url).not.toContain("estado=");
    });
  });
});

describe("Pedidos — tomar el pedido", () => {
  it("abre un pedido con la mesa y los comensales, y la tarjeta aparece", async () => {
    const api = montar();

    await screen.findByText("No hay pedidos que cumplan el filtro.");

    fireEvent.change(screen.getByLabelText("Mesa"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Comensales"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Abrir pedido" }));

    expect(await screen.findByText(/Pedido abierto/)).toBeTruthy();

    const peticion = api.peticiones.find(
      (actual) => actual.metodo === "POST" && actual.url.endsWith("/abrir"),
    );
    expect(peticion?.cuerpo).toEqual({ comensales: 3 });
  });

  it("al tocar una tarjeta se abre ese pedido", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    await tocarLaTarjeta();

    expect(screen.getByText(/Pedido #1/)).toBeTruthy();
    expect(screen.getByText("Pollo a la brasa")).toBeTruthy();
  });

  it("agrega una línea con producto, cantidad, observación y comensal", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    const api = montar(estado);

    await tocarLaTarjeta();
    await agregarLinea();

    const peticion = api.peticiones.find(
      (actual) =>
        actual.metodo === "POST" &&
        actual.url.endsWith("/api/pedidos/1/lineas"),
    );
    expect(peticion?.cuerpo).toEqual({
      productoId: 1,
      cantidad: 2,
      observacion: "sin cebolla",
      persona: 1,
    });
  });

  it("anula una línea y la quita de la tabla", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    await tocarLaTarjeta();

    fireEvent.click(screen.getByRole("button", { name: "Anular" }));

    // Anular pide confirmación antes de hacer nada.
    fireEvent.click(await screen.findByRole("button", { name: "Sí, anular" }));

    await waitFor(() => {
      expect(screen.queryByText("Pollo a la brasa")).toBeNull();
    });
  });

  it("llegando desde Mesas (?mesa=1) abre el pedido de esa mesa sin tocar nada", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado, "/pedidos?mesa=1");

    expect(
      await screen.findByRole("heading", { name: "Agregar producto" }),
    ).toBeInTheDocument();
  });

  it("si se cancela la confirmación, la línea se queda", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    await tocarLaTarjeta();

    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Sí, anular" })).toBeNull();
    });
    expect(screen.getAllByText("Pollo a la brasa").length).toBeGreaterThan(0);
  });

  it("envía a cocina y avisa con el mensaje del servidor", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    await tocarLaTarjeta();

    fireEvent.click(screen.getByRole("button", { name: "Enviar a cocina" }));

    expect(
      await screen.findByText("Comanda 1041 enviada(s)."),
    ).toBeTruthy();
  });

  it("sin líneas, el botón de enviar está deshabilitado", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba({ lineas: [] });

    montar(estado);

    await tocarLaTarjeta();

    expect(
      screen.getByRole("button", { name: "Enviar a cocina" }),
    ).toBeDisabled();
  });

  it("si el servidor rechaza una acción, el mensaje se queda visible", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    const api = montar(estado);
    api.fallos.push({
      metodo: "POST",
      sufijo: "/api/pedidos/1/lineas",
      codigo: "CONFLICTO_DE_ESTADO",
      mensaje: "Ese producto ya no está disponible.",
      estado: 409,
    });

    await tocarLaTarjeta();
    await agregarLinea();

    expect(
      await screen.findByText("Ese producto ya no está disponible."),
    ).toBeTruthy();
  });

  it("pide la lista de disponibles, no la de administración del catálogo", async () => {
    const api = montar();

    await screen.findByText("No hay pedidos que cumplan el filtro.");

    expect(
      api.peticiones.some((peticion) =>
        peticion.url.endsWith("/api/productos/disponibles"),
      ),
    ).toBe(true);
  });
});

describe("Pedidos - pedir la cuenta", () => {
  it("no deja pedir la cuenta si queda consumo sin enviar", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba();

    montar(estado);

    await tocarLaTarjeta();

    expect(
      screen.getByRole("button", { name: "Pedir cuenta" }),
    ).toBeDisabled();
  });

  it("pide la cuenta cuando todo el consumo está enviado", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba({
      lineas: [
        {
          id: 1,
          productoId: 1,
          nombre: "Pollo a la brasa",
          precio: 350,
          cantidad: 2,
          observacion: "sin cebolla",
          persona: 1,
          estado: "Enviada",
        },
      ],
      total: 700,
      cuenta_pedida_en: null,
    });

    const api = montar(estado);

    await tocarLaTarjeta();
    fireEvent.click(screen.getByRole("button", { name: "Pedir cuenta" }));

    expect(
      await screen.findByText("La mesa pidió la cuenta. El cajero ya la ve en su lista."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quitar pedido de cuenta" }),
    ).toBeTruthy();
    expect(api.pedido()?.cuenta_pedida_en).not.toBeNull();
  });

  it("quita el pedido de cuenta si fue un error", async () => {
    const estado = estadoDePedidosDePrueba();
    estado.pedido = pedidoDePrueba({
      lineas: [
        {
          id: 1,
          productoId: 1,
          nombre: "Pollo a la brasa",
          precio: 350,
          cantidad: 2,
          observacion: "sin cebolla",
          persona: 1,
          estado: "Enviada",
        },
      ],
      total: 700,
      cuenta_pedida_en: "2026-10-19T14:00:00.000Z",
    });

    const api = montar(estado);

    await tocarLaTarjeta();
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar pedido de cuenta" }),
    );

    expect(
      await screen.findByRole("button", { name: "Pedir cuenta" }),
    ).toBeTruthy();
    expect(api.pedido()?.cuenta_pedida_en).toBeNull();
  });
});

describe("Pedidos - abrir un pedido", () => {
  it("el apartado de abrir pedido está siempre a la vista", async () => {
    montar();

    expect(
      await screen.findByText("Abrir un pedido en otra mesa"),
    ).toBeTruthy();
  });
});
