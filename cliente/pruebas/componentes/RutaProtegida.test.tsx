/*
  RutaProtegida.test.tsx — las tres decisiones de la guarda.
*/

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RutaProtegida } from "../../src/componentes/RutaProtegida";
import { ContextoSesion } from "../../src/sesion/contexto";
import type { SesionContexto } from "../../src/sesion/contexto";
import { sesionFalsa } from "../ayudas/sesion-de-prueba";

function montar(sesion: SesionContexto) {
  return render(
    <MemoryRouter initialEntries={["/privada"]}>
      <ContextoSesion.Provider value={sesion}>
        <Routes>
          <Route path="/entrar" element={<p>Pantalla de entrar</p>} />
          <Route path="/sin-permiso" element={<p>Acceso denegado</p>} />

          <Route element={<RutaProtegida permiso="ADMINISTRAR_PERSONAL" />}>
            <Route path="/privada" element={<p>Contenido privado</p>} />
          </Route>
        </Routes>
      </ContextoSesion.Provider>
    </MemoryRouter>,
  );
}

describe("RutaProtegida", () => {
  it("mientras comprueba la sesión, no enseña ni la pantalla ni el login", () => {
    montar(sesionFalsa({ estado: "cargando", usuario: null, permisos: [] }));

    expect(screen.getByRole("status")).toHaveTextContent("Comprobando tu sesión");
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
    expect(screen.queryByText("Pantalla de entrar")).not.toBeInTheDocument();
  });

  it("sin sesión, manda a la pantalla de entrar", () => {
    montar(sesionFalsa({ estado: "anonimo", usuario: null, permisos: [] }));

    expect(screen.getByText("Pantalla de entrar")).toBeInTheDocument();
  });

  it("con sesión y con el permiso, deja pasar", () => {
    montar(sesionFalsa({ permisos: ["ADMINISTRAR_PERSONAL"] }));

    expect(screen.getByText("Contenido privado")).toBeInTheDocument();
  });

  it("con sesión pero sin el permiso, manda a acceso denegado", () => {
    montar(sesionFalsa({ permisos: ["CAPTURAR_PEDIDO"] }));

    expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });
});
