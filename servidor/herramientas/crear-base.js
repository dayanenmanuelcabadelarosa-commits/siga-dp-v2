/*
  crear-base.js — la base de datos desde cero, con un solo comando.
  -----------------------------------------------------------------

  Uso:
    npm run base:crear                 crea lo que falte y deja todo al día
    npm run base:crear -- --recrear    borra y vuelve a crear desde cero
    npm run base:crear -- --solo-pruebas    solo la base de las pruebas

  Qué hace
    1. Crea la base de trabajo (BD_NOMBRE del .env) si no existe.
    2. Crea la base de las pruebas (BD_NOMBRE + "_pruebas") si no existe.
    3. Aplica las migraciones pendientes en las dos.
    4. Carga la semilla de desarrollo en las dos.

  La base de pruebas también lleva la semilla porque las pruebas necesitan los
  roles, los parámetros fiscales y la secuencia de comprobantes para poder
  trabajar. Los datos de cada prueba se crean dentro de una transacción que se
  deshace al terminar, así que la semilla queda intacta.

  Nota sobre la codificación: las bases se crean en UTF8 con colación "C", igual
  que el prototipo. UTF8 porque los textos llevan tildes y "ñ"; "C" para que el
  resultado no dependa del idioma configurado en la máquina de cada quien.
*/

import pg from "pg";

import {
  datosConexion,
  esEjecutableDirecto,
  nombreBase,
  nombreBaseDePrueba,
  revisarNombreDeBase,
} from "./comun.js";
import { migrarBase } from "./migrar.js";
import { sembrarBase } from "./semilla.js";

/** Crea una base de datos si no existe. Devuelve true si la creó. */
async function crearBaseSiNoExiste(nombre, { recrear, avisar }) {
  revisarNombreDeBase(nombre);

  // Se conecta a "postgres", que siempre existe, porque CREATE DATABASE no se
  // puede ejecutar desde la base que se está creando.
  const admin = new pg.Client(datosConexion("postgres"));
  await admin.connect();

  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
    const existe = rows.length > 0;

    if (existe && recrear) {
      avisar(`  borrando    ${nombre}`);
      // WITH (FORCE) cierra las conexiones abiertas antes de borrar.
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    } else if (existe) {
      avisar(`  ya existe   ${nombre}`);
      return false;
    }

    await admin.query(
      `CREATE DATABASE "${nombre}" ` +
        "ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
    );

    avisar(`  creada      ${nombre}`);
    return true;
  } finally {
    await admin.end();
  }
}

/** Crea una base desde cero: la crea si hace falta, migra y carga la semilla. */
export async function prepararBase(nombre, { recrear = false, semilla = true, avisar = console.log } = {}) {
  await crearBaseSiNoExiste(nombre, { recrear, avisar });

  avisar(`  migrando ${nombre}`);
  const migradas = await migrarBase({ base: nombre, avisar: (texto) => avisar(`    ${texto.trim()}`) });

  if (semilla) {
    avisar(`  sembrando ${nombre}`);
    await sembrarBase({ base: nombre, avisar: (texto) => avisar(`    ${texto.trim()}`) });
  }

  return { base: nombre, migradas };
}

async function principal() {
  const argumentos = process.argv.slice(2);
  const recrear = argumentos.includes("--recrear");
  const soloPruebas = argumentos.includes("--solo-pruebas");
  const sinSemilla = argumentos.includes("--sin-semilla");

  const bases = soloPruebas ? [nombreBaseDePrueba()] : [nombreBase(), nombreBaseDePrueba()];

  console.log("");
  console.log("  Base de datos de SIGA-DP v2");
  console.log("  ────────────────────────────");
  console.log(`  Servidor: ${datosConexion("postgres").host}:${datosConexion("postgres").port}`);
  console.log("");

  for (const base of bases) {
    await prepararBase(base, {
      recrear,
      semilla: !sinSemilla,
      avisar: (texto) => console.log(texto),
    });
    console.log("");
  }

  console.log("  Listo. Usuario de desarrollo: gerente   Clave: gerente");
  console.log("");
}

if (esEjecutableDirecto(import.meta.url)) {
  principal().catch((error) => {
    console.error(`\n  ${error.message}\n`);
    process.exitCode = 1;
  });
}
