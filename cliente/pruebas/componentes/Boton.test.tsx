/*
  Boton.test.tsx — sobre todo, que mientras carga no se pueda pulsar dos veces.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Boton } from "../../src/componentes/Boton";

describe("Boton", () => {
  it("se dibuja como botón normal, no como envío de formulario", () => {
    render(<Boton>Guardar</Boton>);

    const boton = screen.getByRole("button", { name: "Guardar" });
    expect(boton).toHaveAttribute("type", "button");
    expect(boton).toBeEnabled();
  });

  it("mientras carga se deshabilita, lo anuncia y cambia el texto", () => {
    render(
      <Boton cargando textoDeCarga="Guardando…">
        Guardar
      </Boton>,
    );

    const boton = screen.getByRole("button", { name: "Guardando…" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
  });

  it("mientras carga queda deshabilitado, que es lo que frena el doble clic", () => {
    /*
      No se comprueba con un clic simulado: jsdom despacha el evento aunque el
      botón esté deshabilitado, así que un `fireEvent.click` aquí no demuestra
      nada. Lo que de verdad impide el doble clic es el atributo `disabled`, y
      eso es lo que se comprueba.
    */
    const accion = vi.fn();

    render(
      <Boton cargando onClick={accion}>
        Guardar
      </Boton>,
    );

    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("cuando no está cargando, sí llama a su acción", () => {
    const accion = vi.fn();

    render(<Boton onClick={accion}>Guardar</Boton>);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(accion).toHaveBeenCalledTimes(1);
  });

  it("puede ser de envío cuando se le pide", () => {
    render(<Boton tipo="submit">Entrar</Boton>);

    expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
