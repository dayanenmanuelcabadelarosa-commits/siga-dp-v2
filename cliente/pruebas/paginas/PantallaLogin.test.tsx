/*
  PantallaLogin.test.tsx — el formulario de entrada.
  -------------------------------------------------

  Se prueba con una sesión de mentira: lo que interesa aquí es lo que hace el
  formulario (validar, mostrar el error del servidor, no mandar dos veces, el
  ojito de la clave). El recorrido contra la API real está en App.test.tsx y, de
  verdad, en la comprobación manual con el servidor levantado.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ErrorDeApi } from "../../src/api/errores";
import { PantallaLogin } from "../../src/paginas/PantallaLogin";
import { ContextoSesion } from "../../src/sesion/contexto";
import type { SesionContexto } from "../../src/sesion/contexto";
import { montarConSesion, sesionFalsa } from "../ayudas/sesion-de-prueba";

function enviarFormulario(): void {
  const boton = screen.getByRole("button", { name: /iniciar sesión/i });
  const formulario = boton.closest("form");

  if (formulario === null) {
    throw new Error("El botón de entrar no está dentro de un formulario.");
  }

  fireEvent.submit(formulario);
}

function escribir(etiqueta: string, valor: string): void {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

describe("PantallaLogin", () => {
  it("sin usuario ni clave, avisa y no llama a la API", async () => {
    const entrar = vi.fn(() => Promise.resolve());

    montarConSesion(<PantallaLogin />, { sesion: sesionFalsa({ estado: "anonimo", usuario: null, entrar }) });

    enviarFormulario();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escribe tu usuario y tu clave.",
    );
    expect(entrar).not.toHaveBeenCalled();
  });

  it("muestra el mensaje del servidor tal cual, con los intentos que quedan", async () => {
    const entrar = vi.fn(() =>
      Promise.reject(
        new ErrorDeApi(
          "Usuario o clave incorrectos. Te quedan 2 intentos antes de que la cuenta se bloquee.",
          "CREDENCIALES_INVALIDAS",
          401,
        ),
      ),
    );

    montarConSesion(<PantallaLogin />, { sesion: sesionFalsa({ estado: "anonimo", usuario: null, entrar }) });

    escribir("Usuario", "ana");
    escribir("Clave", "mala");
    enviarFormulario();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Te quedan 2 intentos");
    expect(entrar).toHaveBeenCalledWith("ana", "mala");
  });

  it("recorta los espacios del usuario antes de mandarlo", () => {
    const entrar = vi.fn(() => Promise.resolve());

    montarConSesion(<PantallaLogin />, { sesion: sesionFalsa({ estado: "anonimo", usuario: null, entrar }) });

    escribir("Usuario", "   ana   ");
    escribir("Clave", "clave-buena");
    enviarFormulario();

    expect(entrar).toHaveBeenCalledWith("ana", "clave-buena");
  });

  it("durante el envío, deshabilita el botón y dice que está entrando", async () => {
    let resolver: () => void = () => undefined;
    const entrar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );

    montarConSesion(<PantallaLogin />, { sesion: sesionFalsa({ estado: "anonimo", usuario: null, entrar }) });

    escribir("Usuario", "ana");
    escribir("Clave", "clave-buena");
    enviarFormulario();

    const boton = await screen.findByRole("button", { name: "Entrando…" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");

    resolver();
  });

  it("anuncia que la sesión anterior venció", () => {
    montarConSesion(<PantallaLogin />, {
      sesion: sesionFalsa({
        estado: "anonimo",
        usuario: null,
        aviso: "Tu sesión venció. Vuelve a entrar para seguir trabajando.",
      }),
    });

    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión venció");
  });

  it("el ojito alterna entre ver y ocultar la clave", () => {
    montarConSesion(<PantallaLogin />, {
      sesion: sesionFalsa({ estado: "anonimo", usuario: null }),
    });

    const clave = screen.getByLabelText("Clave");
    expect(clave).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar la clave" }));

    expect(clave).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar la clave" })).toBeInTheDocument();
  });

  it("si ya hay sesión, no enseña el formulario: se va al inicio", () => {
    const sesion: SesionContexto = sesionFalsa();

    render(
      <MemoryRouter initialEntries={["/entrar"]}>
        <ContextoSesion.Provider value={sesion}>
          <Routes>
            <Route path="/entrar" element={<PantallaLogin />} />
            <Route path="/" element={<p>Pantalla de inicio</p>} />
          </Routes>
        </ContextoSesion.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Pantalla de inicio")).toBeInTheDocument();
    expect(screen.queryByLabelText("Usuario")).not.toBeInTheDocument();
  });
});
