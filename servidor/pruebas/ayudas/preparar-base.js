/*
  preparar-base.js — deja la base de pruebas lista antes de correr las pruebas.
  ----------------------------------------------------------------------------

  Vitest lo llama una sola vez, antes de todas las pruebas (globalSetup). Aquí se
  crea la base de pruebas si no existe, se le aplican las migraciones y se carga
  la semilla de desarrollo.

  Por qué la semilla también va a la base de pruebas: las pruebas necesitan los
  roles, los parámetros fiscales y la secuencia de comprobantes para poder
  funcionar. Los datos que crea cada prueba viven dentro de una transacción que
  se deshace al terminar, así que la semilla nunca se ensucia.
*/

import pg from "pg";

import { datosConexion, nombreBaseDePrueba } from "../../herramientas/comun.js";
import { prepararBase } from "../../herramientas/crear-base.js";

const base = nombreBaseDePrueba();

export default async function preparar() {
  const revision = new pg.Client(datosConexion("postgres"));

  try {
    await revision.connect();
  } catch (error) {
    await revision.end().catch(() => {});
    throw new Error(
      "No se pudo conectar con PostgreSQL para preparar la base de pruebas.\n" +
        `  Servidor: ${datosConexion("postgres").host}:${datosConexion("postgres").port}\n` +
        `  Detalle: ${error.message}\n` +
        "  Revisa que el servicio de PostgreSQL esté corriendo y que servidor/.env tenga los datos correctos.",
      { cause: error },
    );
  }
  await revision.end();

  await prepararBase(base, {
    recrear: false,
    semilla: true,
    avisar: () => {},
  });
}
