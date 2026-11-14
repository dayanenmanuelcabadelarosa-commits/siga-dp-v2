/*
  configuracion.js �?" los datos de conexi��n a PostgreSQL.
  ------------------------------------------------------

  Este archivo es puro a prop��sito: no abre conexiones ni crea grupos. Lo usan
  tanto la aplicaci��n (conexion.js) como las herramientas de l��nea de comandos
  (migrar.js, semilla.js). As�� las dos partes interpretan igual el entorno y no
  hay dos versiones de la verdad.

  Reglas que se respetan aqu��:

    �� Si BD_HOST empieza por "/", es el socket Unix de Cloud SQL
      (/cloudsql/PROYECTO:REGION:INSTANCIA). En ese caso NO se pasa puerto:
      pg busca el socket en <BD_HOST>/.s.PGSQL.5432.
    �� Para PostgreSQL externo (Neon, Supabase, Render) se activa TLS. Por
      defecto se verifica el certificado; si un proveedor necesita desactivar
      la verificaci��n, se hace expl��cito con BD_SSL_VERIFICAR=false.
    �� Ning��n valor secreto se escribe en el c��digo: todo sale del entorno.
*/

import fs from "node:fs";

/** Hosts de proveedores que siempre hablan TLS. */
const HOSTS_CON_TLS = [
  /\.render\.com$/i,
  /\.neon\.tech$/i,
  /\.supabase\.co$/i,
  /\.supabase\.com$/i,
  /\.aivencloud\.com$/i,
];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function modoSsl() {
  return texto(process.env.BD_SSL).toLowerCase();
}

/**
 * Decide si hay que usar TLS y con qu�� verificaci��n.
 *
 * BD_SSL:
 *   "true" / "require"  �� fuerza TLS verificando el certificado.
 *   "false" / "disable" �� no usa TLS aunque el host sea de un proveedor.
 *   vac��o              �� TLS autom��tico para proveedores conocidos.
 *
 * BD_SSL_VERIFICAR=false desactiva la verificaci��n del certificado. Solo debe
 * usarse si el proveedor entrega un certificado que Node no reconoce.
 */
function sslDe(host) {
  const modo = modoSsl();

  if (["0", "false", "no", "disable", "disabled"].includes(modo)) return undefined;

  const forzado = ["1", "true", "yes", "si", "s��", "require", "required"].includes(modo);
  const esProveedor = HOSTS_CON_TLS.some((patron) => patron.test(host));

  if (!forzado && !esProveedor) return undefined;

  const verificar = texto(process.env.BD_SSL_VERIFICAR).toLowerCase() !== "false";
  const rutaCa = texto(process.env.BD_SSL_CA);

  if (rutaCa !== "") {
    return { ca: fs.readFileSync(rutaCa, "utf8"), rejectUnauthorized: true };
  }

  return { rejectUnauthorized: verificar };
}

/**
 * Devuelve la configuraci��n que entiende `pg`.
 *
 * @param {object} [extra]  Se mezcla al final; sirve para apuntar a otra base.
 */
export function configuracionBd(extra = {}) {
  const host = texto(process.env.BD_HOST) || "localhost";
  const esSocket = host.startsWith("/");

  const base = {
    host,
    user: texto(process.env.BD_USUARIO) || "postgres",
    password: process.env.BD_CLAVE || "",
    database: texto(process.env.BD_NOMBRE) || "siga_dp_v2",
    application_name: texto(process.env.BD_APP_NAME) || "siga-dp-v2",
  };

  if (!esSocket) {
    base.port = Number(process.env.BD_PUERTO || 5432);
  }

  const ssl = sslDe(host);
  if (ssl !== undefined) base.ssl = ssl;

  return { ...base, ...extra };
}

/** N��mero entero positivo del entorno, con un valor por defecto. */
export function numeroDelEntorno(nombre, porDefecto) {
  const n = Number(process.env[nombre]);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}
