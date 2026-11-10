import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { ProveedorSesion } from "./sesion/ContextoSesion";
import "./estilos/index.css";

/*
  Punto de entrada del cliente.

  El orden importa:

    BrowserRouter   las direcciones de verdad del navegador
      ProveedorSesion   quién está dentro (una sola vez, arriba de todo)
        App             las pantallas

  La sesión va por dentro del router porque al entrar hay que volver a la
  pantalla que la persona quería abrir, y eso usa la dirección actual.
*/

const raiz = document.getElementById("root");

if (!raiz) {
  // Regla de oro 7: si algo falta, se dice con claridad en vez de fallar en
  // silencio con una pantalla en blanco.
  throw new Error("No se encontró el elemento #root en index.html.");
}

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
);
