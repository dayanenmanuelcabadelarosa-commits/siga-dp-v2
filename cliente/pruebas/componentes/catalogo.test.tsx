/*
  catalogo.test.tsx — las piezas pequeñas del catálogo.
  ----------------------------------------------------
  Se prueban solas porque las usan varias pantallas (y las usará el menú del
  mesero): el buscador, los filtros de píldora y el formato de dinero.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Buscador } from "../../src/componentes/Buscador";
import { Pestanas } from "../../src/componentes/Pestanas";
import { formatearDinero } from "../../src/utilidades/formato";

describe("formatearDinero", () => {
  it("escribe pesos dominicanos con dos decimales", () => {
    expect(formatearDinero(350)).toBe("RD$ 350.00");
    expect(formatearDinero(1234.5)).toBe("RD$ 1,234.50");
  });

  it("no deja un hueco si el número no sirve", () => {
    expect(formatearDinero(Number.NaN)).toBe("RD$ 0.00");
  });
});

describe("Buscador", () => {
  it("tiene nombre accesible y avisa cada cambio", () => {
    const alCambiar = vi.fn();

    render(
      <Buscador
        valor="pollo"
        alCambiar={alCambiar}
        etiqueta="Buscar producto"
        marcador="Buscar por nombre…"
      />,
    );

    const campo = screen.getByRole("searchbox", { name: "Buscar producto" });

    expect(campo).toHaveValue("pollo");

    fireEvent.change(campo, { target: { value: "chuleta" } });

    expect(alCambiar).toHaveBeenCalledWith("chuleta");
  });
});

describe("Pestanas", () => {
  it("marca el filtro activo y avisa el que se elige", () => {
    const alCambiar = vi.fn();

    render(
      <Pestanas
        opciones={[
          { valor: "todos", texto: "Todos" },
          { valor: "agotados", texto: "Agotados" },
        ]}
        activa="todos"
        alCambiar={alCambiar}
        etiqueta="Filtrar productos"
      />,
    );

    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Agotados" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Agotados" }));

    expect(alCambiar).toHaveBeenCalledWith("agotados");
  });
});
