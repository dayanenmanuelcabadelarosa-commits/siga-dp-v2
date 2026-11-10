/*
  Modal.test.tsx — el diálogo, el foco y las salidas.
  --------------------------------------------------

  Lo que se comprueba:
    · Tiene rol de diálogo y un título enlazado.
    · Al abrir, el foco entra; al cerrar, vuelve a donde estaba.
    · Escape cierra y el botón de cerrar también.
    · Tab y Shift+Tab no dejan que el foco se escape al fondo.
    · Si hay algo guardándose (`cerrable={false}`), no se cierra.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "../../src/componentes/Modal";

function Ejemplo() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>

      {abierto && (
        <Modal titulo="Editar a Luis" alCerrar={() => setAbierto(false)}>
          <button type="button">Primero</button>
          <button type="button">Último</button>
        </Modal>
      )}
    </div>
  );
}

describe("Modal", () => {
  it("se anuncia como diálogo y enlaza su título", () => {
    render(
      <Modal titulo="Nuevo empleado" alCerrar={vi.fn()}>
        <p>Contenido</p>
      </Modal>,
    );

    const dialogo = screen.getByRole("dialog", { name: "Nuevo empleado" });

    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("al abrir el foco entra y al cerrar vuelve al botón que lo abrió", () => {
    render(<Ejemplo />);

    const abrir = screen.getByRole("button", { name: "Abrir" });
    abrir.focus();
    fireEvent.click(abrir);

    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveFocus();

    fireEvent.keyDown(cerrar, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it("el botón de cerrar también cierra", () => {
    const alCerrar = vi.fn();

    render(
      <Modal titulo="Prueba" alCerrar={alCerrar}>
        <p>Contenido</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("Tab da la vuelta dentro del diálogo y no se escapa", () => {
    render(
      <Modal titulo="Prueba" alCerrar={vi.fn()}>
        <button type="button">Primero</button>
        <button type="button">Último</button>
      </Modal>,
    );

    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    const primero = screen.getByRole("button", { name: "Primero" });
    const ultimo = screen.getByRole("button", { name: "Último" });

    ultimo.focus();
    fireEvent.keyDown(ultimo, { key: "Tab" });
    expect(cerrar).toHaveFocus();

    cerrar.focus();
    fireEvent.keyDown(cerrar, { key: "Tab", shiftKey: true });
    expect(ultimo).toHaveFocus();

    // El foco también puede estar en el contenido sin que nada lo secuestre.
    primero.focus();
    expect(primero).toHaveFocus();
  });

  it("mientras se guarda no se cierra con Escape ni se ofrece la X", () => {
    const alCerrar = vi.fn();

    render(
      <Modal titulo="Guardando" alCerrar={alCerrar} cerrable={false}>
        <p>Espera…</p>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(alCerrar).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Cerrar" }),
    ).not.toBeInTheDocument();
  });
});
