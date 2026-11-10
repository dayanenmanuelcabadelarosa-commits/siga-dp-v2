import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  host: "dpg-dbpjqdei0phs73ad5lo0-a.oregon-postgres.render.com",
  port: 5432,
  user: "siga_dp_db_user",
  password: "lYV8oQjfAL5dwYwF34kjK48S2mPv593w",
  database: "siga_dp_db",
  ssl: { rejectUnauthorized: false },
});

const LARGO_SAL = 16;
const LARGO_HASH = 64;
const COSTO = { N: 16384, r: 8, p: 1 };
function cifrar(c) {
  const sal = crypto.randomBytes(LARGO_SAL).toString("hex");
  const hash = crypto.scryptSync(c, sal, LARGO_HASH, COSTO).toString("hex");
  return `${sal}$${hash}`;
}

async function main() {
  try {
    const nueva = cifrar("gerente");
    const r = await pool.query("UPDATE usuario SET clave_hash=$1, intentos_fallidos=0, estado='Activo' WHERE usuario='gerente' RETURNING usuario, estado;", [nueva]);
    console.log("Resultado:", r.rows[0]);
  } catch (e) { console.error("Error:", e.message); }
  finally { await pool.end(); }
}
main();