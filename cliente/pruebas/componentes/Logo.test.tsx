/*
  Logo.test.tsx — la imagen del negocio y su respaldo.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "../../src/componentes/Logo";

describe("Logo", () => {
  it("muestra el logo del asadero", () => {
    render(<Logo />);

    expect(
      screen.getByRole("img", { name: "Logo del Asadero Doña Pula" }),
    ).toHaveAttribute("src", "/imagenes/logo-dona-pula.png");
  });

  it("si la imagen no carga, cae en las iniciales y no deja un hueco roto", () => {
    render(<Logo />);

    fireEvent.error(
      screen.getByRole("img", { name: "Logo del Asadero Doña Pula" }),
    );

    expect(screen.getByText("DP")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
