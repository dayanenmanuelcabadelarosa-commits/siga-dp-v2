/*
  TarjetaModulo.test.tsx — la tarjeta del inicio lleva a la pantalla correcta.
*/

import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { TarjetaModulo } from "../../src/componentes/TarjetaModulo";
import type { Modulo } from "../../src/modulos";

const MODULO: Modulo = {
  ruta: "/personal",
  nombre: "Personal y usuarios",
  descripcion: "Altas, bajas y cambio de clave.",
  permiso: "ADMINISTRAR_PERSONAL",
  grupo: "Administración",
  fase: 4,
  disponible: false,
  icono: Users,
};

describe("TarjetaModulo", () => {
  it("toda la tarjeta es un enlace a su ruta", () => {
    render(
      <MemoryRouter>
        <TarjetaModulo modulo={MODULO} />
      </MemoryRouter>,
    );

    const enlace = screen.getByRole("link", { name: /Personal y usuarios/ });

    expect(enlace).toHaveAttribute("href", "/personal");
    expect(enlace).toHaveTextContent("Altas, bajas y cambio de clave.");
  });

  it("dice en qué fase llega", () => {
    render(
      <MemoryRouter>
        <TarjetaModulo modulo={MODULO} />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Fase 4")).not.toBeInTheDocument();
  });

  it("si la pantalla ya existe, no muestra fase ni disponible", () => {
    render(
      <MemoryRouter>
        <TarjetaModulo modulo={{ ...MODULO, disponible: true }} />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Disponible")).not.toBeInTheDocument();
    expect(screen.queryByText("Fase 4")).not.toBeInTheDocument();
  });
});
