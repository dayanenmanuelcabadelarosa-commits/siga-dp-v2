/*
  Tabla.test.tsx — encabezados, filas, vacío y cargando.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabla } from "../../src/componentes/Tabla";
import type { Columna } from "../../src/componentes/Tabla";

interface Fila {
  id: number;
  nombre: string;
  fase: number;
}

const COLUMNAS: readonly Columna<Fila>[] = [
  { clave: "nombre", encabezado: "Pantalla", render: (fila) => fila.nombre },
  {
    clave: "fase",
    encabezado: "Llega en",
    alinear: "derecha",
    render: (fila) => `Fase ${fila.fase}`,
  },
];

const FILAS: Fila[] = [
  { id: 1, nombre: "Pedidos", fase: 5 },
  { id: 2, nombre: "Cocina", fase: 6 },
];

describe("Tabla", () => {
  it("tiene nombre accesible y muestra los encabezados", () => {
    render(
      <Tabla
        titulo="Pantallas del rol"
        columnas={COLUMNAS}
        filas={FILAS}
        claveDeFila={(fila) => fila.id}
      />,
    );

    const tabla = screen.getByRole("table", { name: "Pantallas del rol" });

    expect(tabla).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pantalla" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Llega en" })).toBeInTheDocument();
  });

  it("muestra una fila por cada elemento, con su contenido", () => {
    render(
      <Tabla
        titulo="Pantallas del rol"
        columnas={COLUMNAS}
        filas={FILAS}
        claveDeFila={(fila) => fila.id}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(3); // encabezado + 2 filas
    expect(screen.getByRole("cell", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Fase 5" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Fase 6" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Cocina" })).toBeInTheDocument();
  });

  it("si no hay filas, lo dice en vez de quedar vacía", () => {
    render(
      <Tabla
        titulo="Pantallas del rol"
        columnas={COLUMNAS}
        filas={[]}
        claveDeFila={(fila) => fila.id}
        vacio="Tu rol no tiene pantallas."
      />,
    );

    expect(screen.getByText("Tu rol no tiene pantallas.")).toBeInTheDocument();
  });

  it("mientras carga, lo anuncia", () => {
    render(
      <Tabla
        titulo="Pantallas del rol"
        columnas={COLUMNAS}
        filas={[]}
        claveDeFila={(fila) => fila.id}
        cargando
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });
});
