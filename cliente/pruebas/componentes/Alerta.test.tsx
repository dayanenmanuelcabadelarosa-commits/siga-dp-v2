/*
  Alerta.test.tsx — que cada mensaje se anuncie como corresponde.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alerta } from "../../src/componentes/Alerta";

describe("Alerta", () => {
  it("un error se anuncia como alerta (interrumpe)", () => {
    render(<Alerta tipo="error">No se pudo guardar el pedido.</Alerta>);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo guardar el pedido.",
    );
  });

  it("un éxito se anuncia como estado (sin interrumpir)", () => {
    render(<Alerta tipo="exito">El pedido quedó guardado.</Alerta>);

    expect(screen.getByRole("status")).toHaveTextContent(
      "El pedido quedó guardado.",
    );
  });

  it("un aviso también se anuncia como estado", () => {
    render(<Alerta tipo="aviso">Tu sesión venció.</Alerta>);

    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión venció.");
  });

  it("muestra el título cuando se le da uno", () => {
    render(
      <Alerta tipo="info" titulo="Llega en la Fase 5">
        Todavía no está construida.
      </Alerta>,
    );

    const alerta = screen.getByRole("status");
    expect(alerta).toHaveTextContent("Llega en la Fase 5");
    expect(alerta).toHaveTextContent("Todavía no está construida.");
  });
});
