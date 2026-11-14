/*
  migrar.js — aplica las migraciones pendientes.
  ----------------------------------------------

  Uso:
    node herramientas/migrar.js [--base nombre] [--estado]

  Cómo funciona
    · Lleva una tabla "migracion" con el nombre y la huella de cada archivo ya
      aplicado.
    · Aplica solo las que faltan, en orden, cada una dentro de su propia
      transacción: si una falla, no queda a medias.
    · Si un archivo ya aplicado cambió de contenido, se detiene y avisa. Una
      migración aplicada no se edita: se agrega una nueva.
*/

import fs from "node:fs";
import path from "node:path";

import pg from "pg";

import {
  archivosSql,
  carpetaMigraciones,
  datosConexion,
  esEjecutableDirecto,
  nombreBase,
  revisarNombreDeBase,
  sumaDeArchivo,
} from "./comun.js";

/*
  Una llave fija para pg_advisory_lock. Cualquier número sirve mientras sea el
  mismo en todas las instancias. Con esto, si Cloud Run arranca dos contenedores
  a la vez, las migraciones se aplican de una en una y la segunda espera; sin el
  candado, las dos podrían intentar crear la misma tabla y una fallaría.
*/
const LLAVE_DE_MIGRACION = 728341905;

const TABLA = `
  CREATE TABLE IF NOT EXISTS migracion (
    nombre      TEXT        PRIMARY KEY,
    suma_sha256 CHAR(64)    NOT NULL,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const COMMENT_TABLA = `
  COMMENT ON TABLE migracion IS
    'Qué migraciones se aplicaron y con qué contenido. Si una cambia después de aplicarse, el migrador se detiene.'
`;

/** Aplica las migraciones pendientes. Devuelve cuántas aplicó. */
export async function migrarBase({ base = nombreBase(), avisar = console.log } = {}) {
  revisarNombreDeBase(base);

  const cliente = new pg.Client(datosConexion(base));
  await cliente.connect();

  try {
    // Se toma el candado antes de leer o crear la tabla de migraciones.
    await cliente.query("SELECT pg_advisory_lock($1)", [LLAVE_DE_MIGRACION]);

    await cliente.query(TABLA);
    await cliente.query(COMMENT_TABLA);

    const { rows } = await cliente.query("SELECT nombre, suma_sha256 FROM migracion");
    const aplicadas = new Map(rows.map((fila) => [fila.nombre, fila.suma_sha256]));

    const archivos = archivosSql(carpetaMigraciones);
    let cuantas = 0;

    for (const archivo of archivos) {
      const ruta = path.join(carpetaMigraciones, archivo);
      const suma = sumaDeArchivo(ruta);
      const antes = aplicadas.get(archivo);

      if (antes === suma) {
        avisar(`  ya estaba   ${archivo}`);
        continue;
      }

      if (antes !== undefined && antes !== suma) {
        throw new Error(
          `La migración ${archivo} cambió después de haberse aplicado.\n` +
            "  Una migración aplicada no se edita: agrega una nueva con el número siguiente.",
        );
      }

      const sql = fs.readFileSync(ruta, "utf8");

      await cliente.query("BEGIN");
      try {
        await cliente.query(sql);
        await cliente.query(
          "INSERT INTO migracion (nombre, suma_sha256) VALUES ($1, $2)",
          [archivo, suma],
        );
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw new Error(`Falló la migración ${archivo}: ${error.message}`, { cause: error });
      }

      avisar(`  aplicada    ${archivo}`);
      cuantas += 1;
    }

    return cuantas;
  } finally {
    // Se suelta el candado antes de cerrar. Si la conexión ya se cayó, el
    // servidor lo libera solo; el catch evita que el error de cierre tape el
    // error original de la migración.
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [LLAVE_DE_MIGRACION])
      .catch(() => {});
    await cliente.end();
  }
}

/** Muestra qué migraciones están aplicadas y cuáles faltan. */
export async function estadoDeMigraciones({ base = nombreBase(), avisar = console.log } = {}) {
  revisarNombreDeBase(base);

  const cliente = new pg.Client(datosConexion(base));
  await cliente.connect();

  try {
    await cliente.query(TABLA);
    const { rows } = await cliente.query("SELECT nombre, aplicada_en FROM migracion");
    const aplicadas = new Map(rows.map((fila) => [fila.nombre, fila.aplicada_en]));

    for (const archivo of archivosSql(carpetaMigraciones)) {
      const cuando = aplicadas.get(archivo);
      avisar(cuando ? `  aplicada  ${archivo}   (${cuando.toISOString()})` : `  FALTA     ${archivo}`);
    }
  } finally {
    await cliente.end();
  }
}

if (esEjecutableDirecto(import.meta.url)) {
  const argumentos = process.argv.slice(2);
  const posicion = argumentos.indexOf("--base");
  const base = posicion === -1 ? nombreBase() : argumentos[posicion + 1];

  const tarea = argumentos.includes("--estado")
    ? estadoDeMigraciones({ base })
    : migrarBase({ base });

  tarea
    .then((resultado) => {
      if (typeof resultado === "number") {
        console.log(`\n  Migraciones aplicadas: ${resultado}`);
      }
    })
    .catch((error) => {
      console.error(`\n  ${error.message}`);
      process.exitCode = 1;
    });
}
