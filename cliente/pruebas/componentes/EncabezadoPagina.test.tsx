/*
  EncabezadoPagina.test.tsx — el título de la pantalla y sus acciones.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EncabezadoPagina } from "../../src/componentes/EncabezadoPagina";

describe("EncabezadoPagina", () => {
  it("muestra el rótulo, el título y el subtítulo", () => {
    render(
      <EncabezadoPagina
        codigo="MENU-00"
        titulo="Buenas tardes, Ana"
        subtitulo="Elige un módulo para comenzar."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Buenas tardes, Ana" }),
    ).toBeInTheDocument();
    expect(screen.getByText("MENU-00")).toBeInTheDocument();
    expect(screen.getByText("Elige un módulo para comenzar.")).toBeInTheDocument();
  });

  it("dibuja las acciones a la derecha cuando se le dan", () => {
    render(
      <EncabezadoPagina
        titulo="Personal"
        acciones={<button type="button">Nuevo empleado</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Nuevo empleado" }),
    ).toBeInTheDocument();
  });
});
