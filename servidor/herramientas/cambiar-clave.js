/*
  cambiar-clave.js - cambia la clave de un usuario de la base.
  -----------------------------------------------------------

  Uso:
    NUEVA_CLAVE="..." node servidor/herramientas/cambiar-clave.js --usuario gerente

  Por que existe
    Al copiar una base de desarrollo a produccion, el usuario "gerente" puede
    conservar la clave de desarrollo ("gerente"). Eso no puede quedar asi en un
    sistema publicado. Esta herramienta recalcula el hash con scrypt y reinicia
    el contador de intentos fallidos.

  Reglas
    - La clave se lee de NUEVA_CLAVE (o de --clave), nunca de un archivo.
    - No se imprime la clave ni el hash.
    - Si el usuario no existe, termina con error: no crea usuarios a escondidas.
*/

import pg from "pg";

import { cifrarClave } from "../src/acceso/claves.js";
import { datosConexion, esEjecutableDirecto, nombreBase } from "./comun.js";

const LARGO_MINIMO = 12;

export async function cambiarClave({ usuario, clave, base = nombreBase(), avisar = console.log } = {}) {
  if (typeof usuario !== "string" || usuario.trim() === "") {
    throw new Error("Falta el usuario. Usa --usuario NOMBRE.");
  }

  if (typeof clave !== "string" || clave.length < LARGO_MINIMO) {
    throw new Error(`La clave debe tener al menos ${LARGO_MINIMO} caracteres.`);
  }

  const cliente = new pg.Client(datosConexion(base));
  await cliente.connect();

  try {
    const resultado = await cliente.query(
      `UPDATE usuario
          SET clave_hash = $1,
              intentos_fallidos = 0
        WHERE usuario = $2
        RETURNING id_usuario`,
      [cifrarClave(clave), usuario.trim()],
    );

    if (resultado.rowCount !== 1) {
      throw new Error(`No existe el usuario "${usuario}". No se cambio nada.`);
    }

    avisar(`  clave actualizada para "${usuario}" (no se muestra el valor)`);
    return resultado.rows[0].id_usuario;
  } finally {
    await cliente.end();
  }
}

if (esEjecutableDirecto(import.meta.url)) {
  const argumentos = process.argv.slice(2);
  const posicionUsuario = argumentos.indexOf("--usuario");
  const posicionClave = argumentos.indexOf("--clave");
  const posicionBase = argumentos.indexOf("--base");

  const usuario = posicionUsuario === -1 ? "" : argumentos[posicionUsuario + 1];
  const clave = posicionClave === -1 ? process.env.NUEVA_CLAVE || "" : argumentos[posicionClave + 1];
  const base = posicionBase === -1 ? nombreBase() : argumentos[posicionBase + 1];

  cambiarClave({ usuario, clave, base })
    .then(() => {
      console.log("  listo");
    })
    .catch((error) => {
      console.error(`  ${error.message}`);
      process.exitCode = 1;
    });
}
