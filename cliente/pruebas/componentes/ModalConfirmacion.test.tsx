/*
  ModalConfirmacion.test.tsx — la pregunta antes de cambiar un acceso.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModalConfirmacion } from "../../src/componentes/ModalConfirmacion";

describe("ModalConfirmacion", () => {
  it("muestra el título, el mensaje y confirma", () => {
    const alConfirmar = vi.fn();

    render(
      <ModalConfirmacion
        titulo="Dar de baja a Luis"
        mensaje="Su cuenta dejará de funcionar de inmediato."
        textoConfirmar="Dar de baja"
        peligroso
        alConfirmar={alConfirmar}
        alCerrar={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Dar de baja a Luis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Su cuenta dejará de funcionar de inmediato."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));

    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("cancelar cierra sin confirmar", () => {
    const alConfirmar = vi.fn();
    const alCerrar = vi.fn();

    render(
      <ModalConfirmacion
        titulo="Reactivar a Luis"
        mensaje="Volverá a entrar."
        textoConfirmar="Reactivar"
        alConfirmar={alConfirmar}
        alCerrar={alCerrar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor dentro de la ventana", () => {
    render(
      <ModalConfirmacion
        titulo="Desbloquear"
        mensaje="Se pondrán los intentos en cero."
        textoConfirmar="Desbloquear"
        error="La cuenta no está bloqueada."
        alConfirmar={vi.fn()}
        alCerrar={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La cuenta no está bloqueada.",
    );
  });

  it("mientras procesa, deshabilita los botones y no se cierra", () => {
    const alCerrar = vi.fn();

    render(
      <ModalConfirmacion
        titulo="Reactivar"
        mensaje="Volverá a entrar."
        textoConfirmar="Reactivar"
        procesando
        alConfirmar={vi.fn()}
        alCerrar={alCerrar}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Procesando…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(alCerrar).not.toHaveBeenCalled();
  });
});
