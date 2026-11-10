process.env.BD_HOST = "dpg-dbpjqdei0phs73ad5lo0-a.oregon-postgres.render.com";
process.env.BD_PUERTO = "5432";
process.env.BD_USUARIO = "siga_dp_db_user";
process.env.BD_CLAVE = "lYV8oQjfAL5dwYwF34kjK48S2mPv593w";
process.env.BD_NOMBRE = "siga_dp_db";

import { migrarBase } from "./servidor/herramientas/migrar.js";
import { sembrarBase } from "./servidor/herramientas/semilla.js";

async function main() {
  try {
    console.log("Limpiando base de datos...");
    const { Pool } = await import("pg");
    const pool = new Pool({
      host: process.env.BD_HOST,
      port: Number(process.env.BD_PUERTO),
      user: process.env.BD_USUARIO,
      password: process.env.BD_CLAVE,
      database: process.env.BD_NOMBRE,
      ssl: { rejectUnauthorized: false },
    });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.end();
    console.log("  Limpiada.");

    console.log("Aplicando migraciones...");
    const resultado = await migrarBase();
    console.log(`  Migraciones aplicadas: ${resultado}`);

    console.log("Cargando semilla...");
    const cuantos = await sembrarBase();
    console.log(`  Semillas cargadas: ${cuantos}`);

    console.log("\nOK: todo listo.");
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
main();