/*
  Campo.test.tsx — la etiqueta, el error y el lector de pantalla.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Campo } from "../../src/componentes/Campo";

describe("Campo", () => {
  it("la etiqueta está atada a la casilla", () => {
    render(<Campo etiqueta="Usuario" defaultValue="ana" />);

    expect(screen.getByLabelText("Usuario")).toHaveValue("ana");
  });

  it("muestra la ayuda cuando no hay error", () => {
    render(<Campo etiqueta="Clave" ayuda="Al menos 8 caracteres." />);

    expect(screen.getByText("Al menos 8 caracteres.")).toBeInTheDocument();
  });

  it("con error: marca la casilla, muestra el mensaje y lo enlaza", () => {
    render(<Campo etiqueta="Clave" error="La clave no puede ir vacía." />);

    const casilla = screen.getByLabelText("Clave");
    const mensaje = screen.getByRole("alert");

    expect(casilla).toHaveAttribute("aria-invalid", "true");
    expect(mensaje).toHaveTextContent("La clave no puede ir vacía.");
    expect(casilla).toHaveAttribute("aria-describedby", mensaje.id);
  });

  it("el error reemplaza a la ayuda (no se amontonan)", () => {
    render(
      <Campo
        etiqueta="Clave"
        ayuda="Al menos 8 caracteres."
        error="La clave es obligatoria."
      />,
    );

    expect(screen.queryByText("Al menos 8 caracteres.")).not.toBeInTheDocument();
    expect(screen.getByText("La clave es obligatoria.")).toBeInTheDocument();
  });

  it("dibuja el adorno dentro de la casilla", () => {
    render(
      <Campo
        etiqueta="Clave"
        adorno={<button type="button">Ver</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
  });
});
