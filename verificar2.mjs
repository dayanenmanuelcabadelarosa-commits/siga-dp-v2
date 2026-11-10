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
async function main() {
  try {
    const mig = await pool.query("SELECT * FROM migracion ORDER BY nombre;");
    console.log("Filas en migracion:", mig.rows.length);
    mig.rows.forEach(r=>console.log(r.nombre, r.suma_sha256));
    // Ver columnas de usuario
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='usuario' ORDER BY ordinal_position;");
    console.log("\nusuario cols:", cols.rows.map(c=>c.column_name).join(", "));
  } catch (e) { console.error("Error:", e.message); }
  finally { await pool.end(); }
}
main();