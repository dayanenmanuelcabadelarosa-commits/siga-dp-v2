/*
  Selector.test.tsx — la etiqueta, las opciones y el error del desplegable.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Selector } from "../../src/componentes/Selector";

const OPCIONES = [
  { valor: 2, texto: "Gerente" },
  { valor: 4, texto: "Mesero" },
];

describe("Selector", () => {
  it("la etiqueta está atada y dibuja el marcador y las opciones", () => {
    render(
      <Selector
        etiqueta="Rol"
        opciones={OPCIONES}
        marcador="Elige un rol…"
      />,
    );

    const selector = screen.getByLabelText("Rol");

    expect(selector).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "Elige un rol…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gerente" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mesero" })).toBeInTheDocument();
  });

  it("muestra la ayuda cuando no hay error", () => {
    render(
      <Selector
        etiqueta="Rol"
        opciones={OPCIONES}
        ayuda="El rol decide qué puede hacer."
      />,
    );

    expect(
      screen.getByText("El rol decide qué puede hacer."),
    ).toBeInTheDocument();
  });

  it("con error: marca la casilla, muestra el mensaje y lo enlaza", () => {
    render(
      <Selector
        etiqueta="Rol"
        opciones={OPCIONES}
        ayuda="El rol decide qué puede hacer."
        error="Elige un rol."
      />,
    );

    const selector = screen.getByLabelText("Rol");
    const mensaje = screen.getByRole("alert");

    expect(selector).toHaveAttribute("aria-invalid", "true");
    expect(selector).toHaveAttribute("aria-describedby", mensaje.id);
    expect(mensaje).toHaveTextContent("Elige un rol.");
    expect(
      screen.queryByText("El rol decide qué puede hacer."),
    ).not.toBeInTheDocument();
  });

  it("se puede deshabilitar", () => {
    render(<Selector etiqueta="Rol" opciones={OPCIONES} disabled />);

    expect(screen.getByLabelText("Rol")).toBeDisabled();
  });
});
