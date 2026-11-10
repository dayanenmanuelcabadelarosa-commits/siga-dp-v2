/*
  comun.js — lo que comparten las herramientas de la base de datos.
  -----------------------------------------------------------------

  Aquí viven las rutas de las carpetas, los datos de conexión y dos ayudas
  pequeñas. Las herramientas son las únicas que hablan con PostgreSQL sin pasar
  por la aplicación: crear la base, aplicar migraciones y cargar la semilla.

  Se cargan el .env del servidor por ruta explícita, para que todo funcione igual
  si el comando se lanza desde la raíz del proyecto o desde servidor/.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));

export const raizServidor = path.resolve(aqui, "..");
export const raizProyecto = path.resolve(raizServidor, "..");
export const carpetaMigraciones = path.join(raizProyecto, "base-de-datos", "migraciones");
export const carpetaSemillas = path.join(raizProyecto, "base-de-datos", "seeds");

dotenv.config({ path: path.join(raizServidor, ".env"), quiet: true });

/** El nombre de la base de trabajo, tal como está en el .env. */
export function nombreBase() {
  return process.env.BD_NOMBRE || "siga_dp_v2";
}

/** La base que usan las pruebas automáticas: la de trabajo con el sufijo _pruebas. */
export function nombreBaseDePrueba() {
  const base = nombreBase();

  /*
    Si ya viene con el sufijo, se devuelve tal cual. No es un adorno: las pruebas
    le dicen a la aplicación que use la base de pruebas poniendo BD_NOMBRE en el
    entorno, y si ese valor llegara también al proceso que prepara la base, sin
    esta salvaguarda se buscaría "siga_dp_v2_pruebas_pruebas".
  */
  return base.endsWith("_pruebas") ? base : `${base}_pruebas`;
}

/**
 * Los datos de conexión. `base` permite apuntar a otra base de datos
 * (por ejemplo a "postgres", que siempre existe, para poder crear las demás).
 */
export function datosConexion(base) {
  const host = process.env.BD_HOST || "localhost";
  const esRender = typeof host === "string" && host.endsWith(".render.com");
  const datos = {
    host,
    user: process.env.BD_USUARIO || "postgres",
    password: process.env.BD_CLAVE || "",
    database: base,
    ...(esRender ? { ssl: { rejectUnauthorized: false } } : {}),
  };
  if (!host.startsWith("/")) {
    datos.port = Number(process.env.BD_PUERTO || 5432);
  }
  return datos;
}

/**
 * Los archivos .sql de una carpeta, en orden.
 * Como los nombres van numerados con ceros a la izquierda, ordenar por nombre
 * es ordenar por número.
 */
export function archivosSql(carpeta) {
  return fs
    .readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith(".sql"))
    .sort();
}

/** La huella (SHA-256) de un archivo, para detectar si lo editaron después de aplicarlo. */
export function sumaDeArchivo(ruta) {
  return crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

/**
 * Comprueba que un nombre de base de datos sea un identificador simple antes de
 * meterlo entre comillas en un CREATE DATABASE. Un nombre con comillas o punto y
 * coma vendría del .env, y no queremos que se pueda inyectar SQL por ahí.
 */
export function revisarNombreDeBase(nombre) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) {
    throw new Error(
      `El nombre de base de datos "${nombre}" no es válido. ` +
        "Solo se permiten letras, números y guion bajo, empezando por letra o guion bajo.",
    );
  }
  return nombre;
}

/** ¿A este archivo lo llamaron directamente desde la línea de comandos? */
export function esEjecutableDirecto(metaUrl) {
  const entrada = process.argv[1];
  if (!entrada) return false;
  return pathToFileURL(path.resolve(entrada)).href === metaUrl;
}
