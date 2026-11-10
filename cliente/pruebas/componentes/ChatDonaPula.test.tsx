/*
  ChatDonaPula.test.tsx — el chat de Doña Pula, con la API sustituida.
  -------------------------------------------------------------------------------

  Se prueba lo que la pantalla hace con lo que responde el servidor:

    · El muñequito abre y cierra el chat.
    · La pregunta se manda y la respuesta se muestra.
    · Si el servidor responde con un error, el mensaje se queda visible.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatDonaPula } from "../../src/componentes/ChatDonaPula";
import { guardarSesion } from "../../src/sesion/almacen";
import { URL_DE_PRUEBA, respuestaDeError, simularFetch } from "../ayudas/api-falsa";

function montar(
  manejador: (url: string, inicio?: RequestInit) => Response,
) {
  simularFetch((url, inicio) => manejador(url, inicio));
  render(<ChatDonaPula />);
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", URL_DE_PRUEBA);
  guardarSesion({
    token: "token-de-prueba",
    expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("ChatDonaPula", () => {
  it("el muñequito abre el chat", () => {
    montar(() => respuestaDeError("NO_ENCONTRADO", "No aplica", 404));

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir el chat de Doña Pula" }),
    );

    expect(
      screen.getByLabelText("Chat de Doña Pula"),
    ).toBeTruthy();
  });

  it("manda la pregunta y muestra la respuesta", async () => {
    const peticiones: string[] = [];

    montar((url, inicio) => {
      peticiones.push(url);
      void inicio;

      return new Response(
        JSON.stringify({
          ok: true,
          datos: {
            respuesta: "El pollo a la brasa cuesta RD$ 350.00.",
            origen: "groq",
            puedeVerVentas: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir el chat de Doña Pula" }),
    );

    fireEvent.change(screen.getByLabelText("Pregunta para Doña Pula"), {
      target: { value: "¿Cuánto cuesta el pollo?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar la pregunta" }));

    expect(
      await screen.findByText("El pollo a la brasa cuesta RD$ 350.00."),
    ).toBeTruthy();
    expect(peticiones).toContain("http://api.de-prueba/api/asistente/chat");
  });

  it("si el servidor rechaza, el mensaje se queda visible", async () => {
    montar(() =>
      respuestaDeError(
        "INTEGRACION_NO_CONFIGURADA",
        "El chat de Doña Pula no está configurado.",
        503,
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir el chat de Doña Pula" }),
    );

    fireEvent.change(screen.getByLabelText("Pregunta para Doña Pula"), {
      target: { value: "¿Qué me recomiendas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar la pregunta" }));

    expect(
      await screen.findByText("El chat de Doña Pula no está configurado."),
    ).toBeTruthy();
  });
});
