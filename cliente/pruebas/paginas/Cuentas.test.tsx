/*
  Cuentas.test.tsx — generar y ver el detalle de una cuenta, con la API sustituida.
  ---------------------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que responde el servidor:

    · Lista las cuentas abiertas y las mesas por facturar sin inventar montos.
    · No deja generar si todavía hay líneas sin enviar.
    · Al generar, manda el POST y pinta la cuenta que devolvió el servidor.
    · El detalle muestra las líneas y el total que calculó PostgreSQL.
    · Un rechazo del servidor se muestra y no se cambia la lista.
    · Si la carga falla, se explica y Refrescar vuelve a pedir.
    · El cobro se confirma antes de ofrecer la emisión fiscal.

  Que el total coincida con `fn_total_cuenta` y que la base guarde la cuenta lo
  comprueban las pruebas de integración del servidor.
*/

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cuentas } from "../../src/paginas/Cuentas";
import { guardarSesion } from "../../src/sesion/almacen";
import { URL_DE_PRUEBA, simularFetch } from "../ayudas/api-falsa";
import {
  apiDeCuentas,
  estadoDeCuentasDePrueba,
} from "../ayudas/api-de-cuentas";
import type {
  ApiDeCuentas,
  EstadoDeCuentas,
  FalloDeCuentas,
} from "../ayudas/api-de-cuentas";
import {
  PERMISOS_DEL_GERENTE,
  montarConSesion,
  sesionFalsa,
} from "../ayudas/sesion-de-prueba";

interface OpcionesDeMontaje {
  estado?: EstadoDeCuentas;
  fallos?: FalloDeCuentas[];
}

/** El cobro vive en el paso 2 del detalle: se entra a él como lo haría el cajero. */
function pasarAlPasoDeCobrar() {
  fireEvent.click(screen.getByRole("tab", { name: "2. Cobrar" }));
}


function montar({
  estado = estadoDeCuentasDePrueba(),
  fallos = [],
}: OpcionesDeMontaje = {}): ApiDeCuentas {
  const api = apiDeCuentas(estado);
  api.fallos.push(...fallos);

  simularFetch(api.manejador);
  montarConSesion(<Cuentas />, {
    sesion: sesionFalsa({ permisos: PERMISOS_DEL_GERENTE }),
  });

  return api;
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

describe("Cuentas — lista", () => {
  it("muestra las cuentas abiertas y las mesas por facturar", async () => {
    montar();

    expect(
      await screen.findByRole("heading", { name: "Cuentas" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Mesas por cobrar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cuentas abiertas" }),
    ).toBeInTheDocument();

    expect(screen.getByText("F-0001")).toBeInTheDocument();
    expect(screen.getByText("RD$ 500.00")).toBeInTheDocument();
    expect(screen.getByText("Lista para generar")).toBeInTheDocument();
    expect(screen.getByText("1 línea sin enviar")).toBeInTheDocument();
  });

  it("no deja generar si todavía hay líneas sin enviar", async () => {
    montar();

    const mesaTres = await screen.findByRole("button", {
      name: "Generar la cuenta de la mesa 3",
    });
    const mesaDos = screen.getByRole("button", {
      name: "Generar la cuenta de la mesa 2",
    });

    expect(mesaTres).toBeDisabled();
    expect(mesaDos).toBeEnabled();
  });

  it("sin mesas por facturar lo dice y no inventa filas", async () => {
    const estado = estadoDeCuentasDePrueba();
    estado.porGenerar = [];

    montar({ estado });

    expect(
      await screen.findByText(
        "No hay mesas esperando cuenta.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("F-0001")).toBeInTheDocument();
  });
});

describe("Cuentas - cola de cuentas pedidas", () => {
  it("muestra las mesas que pidieron la cuenta primero, en la misma cola", async () => {
    const estado = estadoDeCuentasDePrueba();
    const pedida = {
      ...estado.porGenerar[0]!,
      cuentaPedidaEn: "2026-10-19T16:05:00.000Z",
      horaPedida: "12:05",
    };
    estado.pedidas = [pedida];
    estado.porGenerar = estado.porGenerar.filter(
      (mesa) => mesa.numero !== pedida.numero,
    );

    montar({ estado });

    expect(
      await screen.findByRole("heading", {
        name: "Mesas por cobrar",
      }),
    ).toBeInTheDocument();

    const tabla = screen.getByRole("table", {
      name: "Mesas por cobrar",
    });
    expect(within(tabla).getByText("Pidió la cuenta")).toBeInTheDocument();
    expect(within(tabla).getByText("Terraza")).toBeInTheDocument();
    expect(within(tabla).getByText("12:05")).toBeInTheDocument();
  });

  it("vuelve a pedir la lista sola para ver las cuentas pedidas", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = montar();
      await screen.findByText("F-0001");

      const antes = api.peticiones.filter(
        (peticion) =>
          peticion.metodo === "GET" &&
          peticion.url.endsWith("/api/cuentas"),
      ).length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      await waitFor(() => {
        const despues = api.peticiones.filter(
          (peticion) =>
            peticion.metodo === "GET" &&
            peticion.url.endsWith("/api/cuentas"),
        ).length;
        expect(despues).toBeGreaterThan(antes);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Cuentas - detalle", () => {
  it("abre el detalle con las líneas y el total de PostgreSQL", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Cuenta F-0001 · Mesa 1",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Pollo a la brasa")).toBeInTheDocument();
    expect(screen.getByText("Jugo de chinola")).toBeInTheDocument();
    expect(screen.getAllByText("RD$ 500.00").length).toBeGreaterThan(0);
    // El texto técnico para programadores ya no se le enseña al cajero.
    expect(screen.queryByText(/fn_total_cuenta/)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /Emitir comprobante/i }),
    ).not.toBeInTheDocument();

    const peticion = api.peticiones.find(
      (actual) => actual.metodo === "GET" && actual.url.endsWith("/api/cuentas/1"),
    );
    expect(peticion).toBeTruthy();
  });

  it("si la cuenta ya no existe, lo explica y no muestra un detalle inventado", async () => {
    const api = montar();
    api.fallos.push({
      metodo: "GET",
      sufijo: "/api/cuentas/1",
      codigo: "NO_ENCONTRADO",
      mensaje: "Esa cuenta ya no existe.",
      estado: 404,
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    expect(
      await screen.findByText("Esa cuenta ya no existe."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Cuenta F-0001/ }),
    ).toBeNull();
  });
});

describe("Cuentas — generar", () => {
  it("genera la cuenta y pinta el resultado que devolvió el servidor", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Generar la cuenta de la mesa 2",
      }),
    );

    expect(
      await screen.findByText("Cuenta F-0002 generada para la mesa 2."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cuenta F-0002 · Mesa 2" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("RD$ 700.00").length).toBeGreaterThan(0);

    const peticion = api.peticiones.find(
      (actual) => actual.metodo === "POST",
    );
    expect(peticion?.url.endsWith("/api/cuentas/2/generar")).toBe(true);
    expect(peticion?.cuerpo).toBeNull();

    const despues = api.resumen();
    expect(despues.abiertas.some((cuenta) => cuenta.mesa === 2)).toBe(true);
    expect(despues.porGenerar.some((mesa) => mesa.numero === 2)).toBe(false);
  });

  it("muestra el rechazo del servidor y no cambia la lista", async () => {
    const api = montar({
      fallos: [
        {
          metodo: "POST",
          sufijo: "/api/cuentas/2/generar",
          codigo: "CONFLICTO_DE_ESTADO",
          mensaje: "La mesa 2 tiene una línea sin enviar.",
          estado: 409,
        },
      ],
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Generar la cuenta de la mesa 2",
      }),
    );

    expect(
      await screen.findByText("La mesa 2 tiene una línea sin enviar."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Cuenta F-0002/ }),
    ).toBeNull();
    expect(api.resumen().abiertas).toHaveLength(1);
    expect(api.resumen().porGenerar).toHaveLength(2);
  });

  it("si la carga falla, explica y Refrescar vuelve a pedir", async () => {
    const api = montar({
      fallos: [
        {
          metodo: "GET",
          sufijo: "/api/cuentas",
          codigo: "ERROR_DE_SERVIDOR",
          mensaje: "El servidor no respondió.",
          estado: 500,
        },
      ],
    });

    expect(await screen.findByText("El servidor no respondió.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No se pudieron cargar las cuentas. Usa Refrescar para intentarlo otra vez.",
      ),
    ).toBeInTheDocument();

    api.fallos.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Refrescar/ }));

    expect(await screen.findByText("F-0001")).toBeInTheDocument();
  });

  it("con PayPal se abre la ventana y, cuando el cliente aprueba, la cuenta queda pagada", async () => {
    const api = montar();
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
    pasarAlPasoDeCobrar();

    fireEvent.change(screen.getByLabelText("Forma de pago"), {
      target: { value: "PayPal" },
    });
    expect(
      screen.getByLabelText<HTMLSelectElement>("Forma de pago").value,
    ).toBe("PayPal");
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));

    // Se abre la ventana de PayPal y se espera la aprobación del cliente.
    expect(api.peticiones.map((peticion) => peticion.url)).toContain(
      "http://api.de-prueba/api/paypal/pedidos",
    );
    expect(await screen.findByText("ORDER-PRUEBA-1")).toBeTruthy();
    expect(screen.getByText("US$ 8.27")).toBeTruthy();
    expect(abrirVentana).toHaveBeenCalled();

    // Cuando el cliente aprueba, la cuenta se cobra sola.
    api.aprobarPago();
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar el pago ahora" }),
    );

    expect(
      await screen.findByText(/Pago de PayPal confirmado/),
    ).toBeTruthy();
    expect(api.resumen().abiertas).toHaveLength(0);
  });

  it("al cobrar en efectivo, muestra lo que hay que cobrar y el cambio", async () => {
    montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
    pasarAlPasoDeCobrar();

    // "Recibido" se deja con el total de la cuenta.
    const recibido = screen.getByLabelText<HTMLInputElement>("Recibido");
    await waitFor(() => {
      expect(recibido.value).toBe("500.00");
    });

    fireEvent.change(recibido, { target: { value: "700.00" } });

    // El total a cobrar (RD$ 500.00) y el cambio (RD$ 200.00) se ven juntos.
    const resumenDelCobro = screen.getByText(/Total a cobrar/);
    expect(resumenDelCobro.textContent).toContain("RD$ 500.00");
    expect(resumenDelCobro.textContent).toContain("Cambio:");
    expect(resumenDelCobro.textContent).toContain("RD$ 200.00");
  });

  it("el detalle empieza en 'Revisar': muestra las líneas y esconde el cobro hasta el paso 2", async () => {
    montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });

    expect(
      screen.getByRole("tab", { name: "1. Revisar", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pollo a la brasa")).toBeInTheDocument();
    expect(screen.queryByLabelText("Forma de pago")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continuar a cobrar" }));

    expect(
      screen.getByRole("tab", { name: "2. Cobrar", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Forma de pago")).toBeInTheDocument();
    expect(screen.queryByText("Pollo a la brasa")).toBeNull();
  });

  it("el total se ve en cualquier paso", async () => {
    montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });

    const pasos = screen.getByRole("tablist", {
      name: "Pasos para cobrar la cuenta",
    });
    expect(pasos.textContent).toContain("RD$ 500.00");

    fireEvent.click(screen.getByRole("tab", { name: "3. Comprobante" }));
    expect(pasos.textContent).toContain("RD$ 500.00");
    expect(screen.getByText(/Todavía no hay cobros/)).toBeInTheDocument();
  });

  it("ajusta el efectivo exacto al agregar propina y respeta un monto editado", async () => {
    montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    fireEvent.click(await screen.findByRole("tab", { name: "2. Cobrar" }));
    const recibido = await screen.findByLabelText<HTMLInputElement>("Recibido");
    const propina = screen.getByLabelText<HTMLInputElement>("Propina");

    fireEvent.change(propina, { target: { value: "50" } });
    expect(recibido.value).toBe("550.00");
    expect(screen.getByText(/Total a cobrar/).textContent).toContain(
      "RD$ 550.00",
    );

    fireEvent.change(recibido, { target: { value: "700" } });
    fireEvent.change(propina, { target: { value: "25" } });

    expect(recibido.value).toBe("700");
    expect(screen.getByText(/Total a cobrar/).textContent).toContain(
      "RD$ 525.00",
    );
  });

  it("cobra primero y permite emitir el comprobante con el pago ya registrado", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
    pasarAlPasoDeCobrar();
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>("Recibido").value).toBe(
        "500.00",
      );
    });

    expect(
      screen.queryByRole("heading", { name: /Emitir comprobante/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(
      await screen.findByRole("heading", {
        name: "Cobro confirmado · Cuenta F-0001",
      }),
    ).toBeInTheDocument();
    expect(api.resumen().abiertas).toHaveLength(0);

    /*
      Después de cobrar se pregunta si quiere comprobante: el formulario no
      sale hasta que dice que sí.
    */
    expect(
      await screen.findByText("¿Quiere comprobante fiscal?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Emitir comprobante" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Sí, emitir comprobante" }),
    );

    expect(
      screen.getByRole("button", { name: "Emitir comprobante" }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: "Cliente de prueba" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Emitir comprobante" }));

    expect(await screen.findByText("E320000000001")).toBeInTheDocument();

    const solicitud = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/api/cuentas/1/comprobantes"),
    );
    expect(solicitud?.metodo).toBe("POST");
    expect(solicitud?.cuerpo).toMatchObject({
      tipo: "B02",
      cliente: "Cliente de prueba",
      forma: "Efectivo",
    });
  });

  it("el visto verde dura cinco segundos y después vuelve a la lista de cuentas", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      montar();

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Ver el detalle de la cuenta de la mesa 1",
        }),
      );
      await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
      pasarAlPasoDeCobrar();

      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>("Recibido").value).toBe(
          "500.00",
        );
      });

      fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));

      expect(
        await screen.findByText("¿Quiere comprobante fiscal?"),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Sí, emitir comprobante" }),
      );
      fireEvent.change(screen.getByLabelText("Cliente"), {
        target: { value: "Cliente de prueba" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Emitir comprobante" }));

      // El visto verde.
      expect(await screen.findByText("Comprobante aprobado")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Comprobante aprobado"),
        ).not.toBeInTheDocument();
      });

      // Y la pantalla vuelve a la lista de cuentas.
      expect(
        screen.queryByRole("heading", { name: "Cuenta F-0001 · Mesa 1" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("si no quiere comprobante, se sigue sin emitir", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
    pasarAlPasoDeCobrar();

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>("Recibido").value).toBe(
        "500.00",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(
      await screen.findByText("¿Quiere comprobante fiscal?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No, gracias" }));

    await waitFor(() => {
      expect(
        screen.queryByText("¿Quiere comprobante fiscal?"),
      ).not.toBeInTheDocument();
    });

    expect(
      api.peticiones.some((peticion) =>
        peticion.url.endsWith("/api/cuentas/1/comprobantes"),
      ),
    ).toBe(false);
  });

  it("explica que la tarjeta necesita referencia y no manda el cobro", async () => {
    const api = montar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );
    await screen.findByRole("heading", { name: "Cuenta F-0001 · Mesa 1" });
    pasarAlPasoDeCobrar();

    fireEvent.change(screen.getByLabelText("Forma de pago"), {
      target: { value: "Tarjeta" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(
      await screen.findByText(
        "Escribe el número de aprobación de la tarjeta.",
      ),
    ).toBeInTheDocument();
    expect(
      api.peticiones.some((peticion) =>
        peticion.url.endsWith("/api/cuentas/1/cobrar"),
      ),
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("Referencia"), {
      target: { value: "APROBACION-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await screen.findByRole("heading", {
      name: "Cobro confirmado · Cuenta F-0001",
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Sí, emitir comprobante" }),
    );

    // La referencia de la tarjeta se ve en el formulario del comprobante.
    expect(screen.getByText("APROBACION-123")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: "Cliente de tarjeta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Emitir comprobante" }));
    await screen.findByText("E320000000001");

    const comprobante = api.peticiones.find((peticion) =>
      peticion.url.endsWith("/api/cuentas/1/comprobantes"),
    );
    expect(comprobante?.cuerpo).toMatchObject({
      forma: "Tarjeta",
      referencia: "APROBACION-123",
    });
  });

  it("la lista no muestra acciones de cuenta antes de abrir un detalle", async () => {
    montar();

    await screen.findByRole("heading", { name: "Cuentas" });

    const acciones = screen.queryAllByRole("button");

    expect(
      acciones.some((boton) =>
        /cobrar|comprobante|descuento|dividir/i.test(boton.textContent ?? ""),
      ),
    ).toBe(false);
  });
});

describe("Cuentas — comprobante de un cobro que ya se hizo", () => {
  /*
    Si la emisión falla (o el cajero siguió de largo y recargó la página), el
    comprobante se tiene que poder emitir después, sin volver a cobrar. Por eso
    el detalle de la cuenta trae sus cobros.
  */
  it("ofrece emitir el comprobante de un cobro que todavía no lo tiene", async () => {
    const estado = estadoDeCuentasDePrueba();
    const detalle = estado.detalles[1];

    if (detalle === undefined) {
      throw new Error("La cuenta de prueba de la mesa 1 no está.");
    }

    detalle.estado = "Pagada";
    detalle.pagos = [
      {
        id: 7,
        comensal: null,
        forma: "Efectivo",
        referencia: null,
        total: 500,
        comprobanteId: null,
        comprobanteNcf: null,
      },
    ];

    const api = montar({ estado });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Emitir el comprobante del cobro 7 de la cuenta F-0001",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: /Cobro confirmado/ }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: "Cliente de la mesa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Emitir comprobante" }));

    await screen.findByText("E320000000001");

    const peticion = api.peticiones.find((item) =>
      item.url.endsWith("/api/cuentas/1/comprobantes"),
    );

    expect(peticion?.cuerpo).toMatchObject({ pagoId: 7 });
  });

  it("no ofrece emitir cuando el cobro ya tiene comprobante", async () => {
    const estado = estadoDeCuentasDePrueba();
    const detalle = estado.detalles[1];

    if (detalle === undefined) {
      throw new Error("La cuenta de prueba de la mesa 1 no está.");
    }

    detalle.estado = "Pagada";
    detalle.pagos = [
      {
        id: 7,
        comensal: null,
        forma: "Efectivo",
        referencia: null,
        total: 500,
        comprobanteId: 3,
        comprobanteNcf: "E320000000002",
      },
    ];

    montar({ estado });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver el detalle de la cuenta de la mesa 1",
      }),
    );

    expect(await screen.findByText("E320000000002")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Emitir el comprobante del cobro 7 de la cuenta F-0001",
      }),
    ).not.toBeInTheDocument();
  });
});
