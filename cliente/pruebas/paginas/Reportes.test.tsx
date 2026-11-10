/*
  Reportes.test.tsx — el filtro de fechas de ventas y propinas.
  --------------------------------------------------------------

  Se prueba que las fechas elegidas llegan a la API, que un rango al revés no
  se manda, y que "Quitar fechas" vuelve a pedir todo sin filtro.
*/

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Reportes } from "../../src/paginas/Reportes";

const api = vi.hoisted(() => ({
  reporteVentas: vi.fn(),
  reportePropinas: vi.fn(),
  reporteInventario: vi.fn(),
  reporteAgotados: vi.fn(),
}));

vi.mock("../../src/api/reportes", () => api);

describe("Reportes — fechas", () => {
  beforeEach(() => {
    for (const funcion of Object.values(api)) {
      funcion.mockReset();
      funcion.mockResolvedValue([]);
    }
  });

  it("pide los reportes de hoy al abrir, sin fechas", async () => {
    render(<Reportes />);

    await screen.findByRole("heading", { name: "Reportes" });

    expect(api.reporteVentas).toHaveBeenCalledWith();
  });

  it("manda las fechas elegidas a ventas y propinas", async () => {
    render(<Reportes />);

    fireEvent.change(await screen.findByLabelText("Desde"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => {
      expect(api.reporteVentas).toHaveBeenLastCalledWith(
        "2026-10-01",
        "2026-10-15",
      );
    });
    expect(api.reportePropinas).toHaveBeenLastCalledWith(
      "2026-10-01",
      "2026-10-15",
    );
  });

  it("no manda un rango al revés", async () => {
    render(<Reportes />);

    fireEvent.change(await screen.findByLabelText("Desde"), {
      target: { value: "2026-10-20" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-10-01" },
    });
    const llamadasAntes = api.reporteVentas.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByText(/no puede ser anterior/)).not.toBeNull();
    expect(api.reporteVentas.mock.calls.length).toBe(llamadasAntes);
  });

  it("'Quitar fechas' vuelve a pedir todo sin filtro", async () => {
    render(<Reportes />);

    fireEvent.change(await screen.findByLabelText("Desde"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar fechas" }));

    await waitFor(() => {
      expect(api.reporteVentas).toHaveBeenLastCalledWith(undefined, undefined);
    });
    expect(screen.getByLabelText<HTMLInputElement>("Desde").value).toBe("");
  });
});
