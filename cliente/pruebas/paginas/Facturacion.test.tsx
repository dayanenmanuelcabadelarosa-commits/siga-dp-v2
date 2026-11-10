/*
  Facturacion.test.tsx — la anulación fiscal no se pide por accidente.
  --------------------------------------------------------------------

  Anular un comprobante le avisa a la DGII y no se puede deshacer. Se prueba que:

    · Pulsar "Solicitar anulación fiscal" solo abre una ventana de confirmación.
    · Cancelar no manda nada al servidor.
    · Confirmar manda el NCF correcto.
*/

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistroDeComprobante } from "../../src/api/cuentas";
import { Facturacion } from "../../src/paginas/Facturacion";

const { listarComprobantes, anularComprobante } = vi.hoisted(() => ({
  listarComprobantes: vi.fn(),
  anularComprobante: vi.fn(),
}));

vi.mock("../../src/api/cuentas", () => ({
  listarComprobantes,
  anularComprobante,
  estadoDelComprobante: vi.fn(),
  xmlDelComprobante: vi.fn(),
}));

function comprobante(): RegistroDeComprobante {
  return {
    id: 7,
    ncf: "B0200000001",
    tipo: "B02",
    cliente: "Consumidor final",
    rncCliente: null,
    base: 1000,
    impuesto: 180,
    total: 1180,
    formaPago: "Efectivo",
    estado: "Emitido",
    estadoEcF: null,
    emitidoEn: "2026-10-25T20:10:00",
    anuladoEn: null,
    idEcF: null,
    trackId: null,
    dgiiUrl: null,
    pagoId: 3,
    comensal: null,
    numeroCuenta: "C-1",
    mesa: 4,
    emisor: "Cajero",
  };
}

describe("Facturación — anulación fiscal", () => {
  beforeEach(() => {
    listarComprobantes.mockReset();
    anularComprobante.mockReset();
    listarComprobantes.mockResolvedValue([comprobante()]);
  });

  it("pide confirmación y cancelar no manda nada", async () => {
    render(<Facturacion />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Solicitar anulación fiscal" }),
    );

    expect(
      await screen.findByText("¿Solicitar la anulación fiscal?"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByText("¿Solicitar la anulación fiscal?")).toBeNull();
    });
    expect(anularComprobante).not.toHaveBeenCalled();
  });

  it("al confirmar anula el comprobante elegido", async () => {
    anularComprobante.mockResolvedValue({ mensaje: "Anulación solicitada." });

    render(<Facturacion />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Solicitar anulación fiscal" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Sí, solicitar la anulación",
      }),
    );

    await waitFor(() => {
      expect(anularComprobante).toHaveBeenCalledWith("B0200000001");
    });
    expect(await screen.findByText("Anulación solicitada.")).not.toBeNull();
  });
});
