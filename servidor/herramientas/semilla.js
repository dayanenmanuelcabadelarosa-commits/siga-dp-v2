/*
  semilla.js — carga los datos de desarrollo.
  -------------------------------------------

  Uso:
    node herramientas/semilla.js [--base nombre] [--clave texto]

  Qué hace
    Aplica los archivos de base-de-datos/seeds/ en orden, cada uno dentro de su
    propia transacción.

  Sobre la clave del gerente
    El archivo de semilla trae el texto "{{CLAVE_HASH}}". Esta herramienta lo
    reemplaza por un hash de scrypt calculado aquí. Así nunca hay una contraseña
    en texto plano en la base de datos ni un hash inventado a mano.
*/

import fs from "node:fs";
import path from "node:path";

import pg from "pg";

import { cifrarClave } from "../src/acceso/claves.js";
import {
  archivosSql,
  carpetaSemillas,
  datosConexion,
  esEjecutableDirecto,
  nombreBase,
  revisarNombreDeBase,
} from "./comun.js";

/** La contraseña del gerente de desarrollo, si no se dice otra cosa. */
export const CLAVE_DE_DESARROLLO = "gerente";

const MARCA = "{{CLAVE_HASH}}";

/** Aplica las semillas. Devuelve cuántos archivos cargó. */
export async function sembrarBase({
  base = nombreBase(),
  clave = CLAVE_DE_DESARROLLO,
  avisar = console.log,
} = {}) {
  revisarNombreDeBase(base);

  const cliente = new pg.Client(datosConexion(base));
  await cliente.connect();

  try {
    // El hash se calcula una vez y se usa en todos los archivos.
    const hash = cifrarClave(clave);
    let cuantos = 0;

    for (const archivo of archivosSql(carpetaSemillas)) {
      const ruta = path.join(carpetaSemillas, archivo);
      const original = fs.readFileSync(ruta, "utf8");

      if (!original.includes(MARCA)) {
        throw new Error(
          `La semilla ${archivo} no tiene la marca ${MARCA}, así que la contraseña ` +
            "del gerente no se cifraría. Revisa el archivo antes de cargarlo.",
        );
      }

      // Se reemplaza con una función para que ningún "$" del hash se interprete
      // como un patrón de reemplazo.
      const sql = original.replaceAll(MARCA, () => hash);

      await cliente.query("BEGIN");
      try {
        await cliente.query(sql);
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw new Error(`Falló la semilla ${archivo}: ${error.message}`, { cause: error });
      }

      avisar(`  cargada     ${archivo}`);
      cuantos += 1;
    }

    return cuantos;
  } finally {
    await cliente.end();
  }
}

if (esEjecutableDirecto(import.meta.url)) {
  const argumentos = process.argv.slice(2);
  const posicionBase = argumentos.indexOf("--base");
  const posicionClave = argumentos.indexOf("--clave");

  const base = posicionBase === -1 ? nombreBase() : argumentos[posicionBase + 1];
  const clave = posicionClave === -1 ? CLAVE_DE_DESARROLLO : argumentos[posicionClave + 1];

  sembrarBase({ base, clave })
    .then((cuantos) => {
      console.log(`\n  Semillas cargadas: ${cuantos}`);
      console.log(`  Usuario: gerente    Clave: ${clave === CLAVE_DE_DESARROLLO ? "gerente" : "(la que indicaste)"}`);
    })
    .catch((error) => {
      console.error(`\n  ${error.message}`);
      process.exitCode = 1;
    });
}
