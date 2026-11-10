/*
  Corte.test.tsx — cerrar el corte de caja sin errores de dedo.
  ------------------------------------------------------------

  Se prueba lo que protege a la persona de cerrar un corte por accidente:

    · El efectivo declarado es obligatorio: un campo vacío NO se convierte en 0.
    · Antes de cerrar sale una ventana con lo esperado, lo declarado y la
      diferencia; cancelar no manda nada al servidor.
    · Confirmar manda el monto escrito.
    · Si el servidor rechaza el cierre, el error se queda dentro de la ventana.
*/

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumenDeCorte } from "../../src/api/corte";
import { Corte } from "../../src/paginas/Corte";

const { obtenerCorte, cerrarCorte } = vi.hoisted(() => ({
  obtenerCorte: vi.fn(),
  cerrarCorte: vi.fn(),
}));

vi.mock("../../src/api/corte", () => ({ obtenerCorte, cerrarCorte }));

function resumen(sobre: Partial<ResumenDeCorte> = {}): ResumenDeCorte {
  return {
    fecha: "2026-10-25",
    estado: "Abierto",
    cerradoEn: null,
    cerradoPor: null,
    porForma: { Efectivo: 1000, Tarjeta: 500, PayPal: 0, Crédito: 0 },
    totalVentas: 1500,
    totalDescuentos: 0,
    comprobantes: 3,
    efectivoSistema: 1000,
    efectivoDeclarado: null,
    diferencia: null,
    ...sobre,
  };
}

describe("Corte — cerrar el turno", () => {
  beforeEach(() => {
    obtenerCorte.mockReset();
    cerrarCorte.mockReset();
    obtenerCorte.mockResolvedValue(resumen());
  });

  it("no cierra con el efectivo vacío y no manda nada al servidor", async () => {
    render(<Corte />);

    fireEvent.click(await screen.findByRole("button", { name: "Cerrar corte" }));

    expect(await screen.findByText(/Escribe el efectivo que contaste/)).not.toBeNull();
    expect(screen.queryByText("¿Cerrar el corte de caja?")).toBeNull();
    expect(cerrarCorte).not.toHaveBeenCalled();
  });

  it("rechaza un monto que no es un número", async () => {
    render(<Corte />);

    fireEvent.change(await screen.findByLabelText("Efectivo declarado"), {
      target: { value: "mil" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar corte" }));

    expect(await screen.findByText(/monto válido/)).not.toBeNull();
    expect(cerrarCorte).not.toHaveBeenCalled();
  });

  it("pide confirmación y cancelar no cierra", async () => {
    render(<Corte />);

    fireEvent.change(await screen.findByLabelText("Efectivo declarado"), {
      target: { value: "950" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar corte" }));

    expect(await screen.findByText("¿Cerrar el corte de caja?")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByText("¿Cerrar el corte de caja?")).toBeNull();
    });
    expect(cerrarCorte).not.toHaveBeenCalled();
  });

  it("al confirmar manda el monto escrito, con 0 si de verdad es 0", async () => {
    cerrarCorte.mockResolvedValue({
      id: 1,
      resumen: resumen({ estado: "Cerrado", efectivoDeclarado: 0, diferencia: -1000 }),
      mensaje: "Corte cerrado.",
    });

    render(<Corte />);

    fireEvent.change(await screen.findByLabelText("Efectivo declarado"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar corte" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Sí, cerrar el corte" }),
    );

    await waitFor(() => {
      expect(cerrarCorte).toHaveBeenCalledWith("0");
    });
    expect(await screen.findByText("Corte cerrado.")).not.toBeNull();
  });

  it("si el servidor rechaza el cierre, el error queda dentro de la ventana", async () => {
    cerrarCorte.mockRejectedValue(new Error("Hay cuentas sin cobrar."));

    render(<Corte />);

    fireEvent.change(await screen.findByLabelText("Efectivo declarado"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar corte" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Sí, cerrar el corte" }),
    );

    expect(await screen.findByText(/Hay cuentas sin cobrar/)).not.toBeNull();
    expect(screen.queryByText("¿Cerrar el corte de caja?")).not.toBeNull();
  });
});
