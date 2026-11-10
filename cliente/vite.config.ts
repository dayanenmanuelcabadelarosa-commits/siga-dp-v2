/*
  Configuración de Vite para el cliente.

  Aquí van dos cosas:
    · El servidor de desarrollo y los plugins de Vite.
    · La configuración de Vitest, que reutiliza este mismo archivo.

  Nota sobre `host: true`: sin esto, Vite se queda escuchando solo en IPv6 (::1)
  y el navegador, que busca "localhost" como 127.0.0.1, no logra conectarse y la
  pantalla sale en blanco. Con `host: true` escucha en IPv4 y IPv6.
*/

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./pruebas/configuracion.ts"],
    include: ["pruebas/**/*.test.{ts,tsx}"],
    /*
      Las pruebas de pantalla esperan a que React repinte, y eso se tarda mas
      cuando la maquina esta ocupada (o cuando corren muchos archivos a la
      vez). Con el tiempo de Vitest por defecto (5 s) una prueba correcta se
      caia sola. Este limite da margen; si una prueba se cuelga de verdad, se
      sigue viendo en el tiempo que tarda.
    */
    testTimeout: 20_000,
  },
});
