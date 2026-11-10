import { defineConfig } from "vitest/config";

import { nombreBaseDePrueba } from "./herramientas/comun.js";

/*
  Pruebas del servidor.

  El plan (sección 4) pide pruebas contra una base de datos de prueba REAL, no
  dobles de prueba ("mocks") de la base. Eso es lo que hay aquí.

  Consecuencia que conviene tener clara: para correr `npm run test:api` hace falta
  que PostgreSQL esté encendido y que servidor/.env tenga los datos de conexión.
  El archivo pruebas/ayudas/preparar-base.js crea la base de pruebas `siga_dp_v2_pruebas`
  si no existe, le aplica las migraciones y le carga la semilla. Si PostgreSQL no
  responde, avisa con un mensaje claro en vez de fallar sin decir por qué.

  `ambiente: "node"` es lo correcto aquí: quien se prueba es la API, no el DOM.

  `env.BD_NOMBRE` es importante y no es un detalle: la aplicación (app.js) usa el
  mismo grupo de conexiones que el resto del servidor, que lee el nombre de la base
  del .env. Sin esta línea, las pruebas de la API escribirían en la base de
  trabajo, la de verdad. Aquí se apunta a la base de pruebas, que es la misma que
  prepara preparar-base.js y la que usa base-de-prueba.js.
*/

export default defineConfig({
  test: {
    environment: "node",
    include: ["pruebas/**/*.test.js"],
    globalSetup: ["pruebas/ayudas/preparar-base.js"],
    env: { BD_NOMBRE: nombreBaseDePrueba() },
    // La base de pruebas es una sola: mejor no correr archivos en paralelo
    // peleándose por las mismas secuencias y los mismos números de mesa.
    fileParallelism: false,
  },
});
