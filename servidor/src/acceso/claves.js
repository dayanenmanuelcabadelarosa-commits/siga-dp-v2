/*
  claves.js — cifrado de contraseñas.
  -----------------------------------

  La contraseña NUNCA se guarda en texto plano ni "cifrada" de forma reversible.
  Se guarda un hash con sal, y para comprobar una contraseña se vuelve a calcular
  el hash y se comparan.

  Se usa scrypt, que viene dentro de Node (no hay que instalar nada nativo) y es
  una función pensada para contraseñas: es lenta a propósito y pide memoria, que
  es justo lo que encarece un ataque por fuerza bruta.

  El formato guardado es:   sal$hash      (la sal y el hash en hexadecimal)

  Nota sobre las fases: el inicio de sesión es la Fase 2. Este archivo existe ya
  porque la semilla de desarrollo necesita guardar la contraseña del gerente
  cifrada de verdad, y no queríamos un hash falso ni una contraseña en texto
  plano en la base de datos.
*/

import crypto from "node:crypto";

const LARGO_SAL = 16; // bytes
const LARGO_HASH = 64; // bytes
const COSTO = { N: 16384, r: 8, p: 1 }; // parámetros de scrypt

/** Cifra una contraseña para guardarla. Devuelve "sal$hash". */
export function cifrarClave(contrasena) {
  if (typeof contrasena !== "string" || contrasena.length === 0) {
    throw new Error("La contraseña no puede estar vacía.");
  }

  const sal = crypto.randomBytes(LARGO_SAL).toString("hex");
  const hash = crypto.scryptSync(contrasena, sal, LARGO_HASH, COSTO).toString("hex");

  return `${sal}$${hash}`;
}

/** Comprueba una contraseña contra el valor guardado. Devuelve true o false. */
export function verificarClave(contrasena, guardado) {
  if (typeof contrasena !== "string" || typeof guardado !== "string") return false;

  const partes = guardado.split("$");
  if (partes.length !== 2) return false;

  const [sal, esperado] = partes;
  if (!sal || !esperado) return false;

  const calculado = crypto.scryptSync(contrasena, sal, LARGO_HASH, COSTO).toString("hex");
  const a = Buffer.from(calculado, "hex");
  const b = Buffer.from(esperado, "hex");

  // timingSafeEqual exige buffers del mismo largo; si no, ni se intenta.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
