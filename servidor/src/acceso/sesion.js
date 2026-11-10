/*
  sesion.js — el token de la sesión.
  ---------------------------------

  Cómo funciona, y por qué así:

  El token es un texto con dos partes separadas por un punto:

      <datos>.<firma>

  "datos" es el identificador del usuario y la hora en que expira, en JSON y
  codificado en base64url. "firma" es un HMAC-SHA256 de esos datos con la clave
  secreta del servidor (CLAVE_SESION). Cualquiera puede leer el contenido, pero
  nadie puede cambiarlo sin la clave: si se cambia un solo carácter, la firma deja
  de cuadrar.

  El token NO dice quién es el usuario ni qué rol tiene en cada petición. Solo
  lleva el identificador. Los datos (rol, permisos, si sigue activo) se leen de la
  base en cada petición. Eso es a propósito y cumple dos reglas:

    · RN-23 (dar de baja es inmediato): si al empleado lo dan de baja, la
      siguiente petición que haga ya no lo encuentra activo y se le corta.
    · Cambiar un rol o quitarle un permiso a alguien surte efecto de inmediato, sin
      esperar a que venza el token.

  Nota sobre "cerrar sesión": como el token es válido por sí mismo, el servidor no
  guarda una lista de sesiones y no puede "romper" un token antes de que venza. Al
  cerrar sesión el cliente lo tira y no lo vuelve a usar. Si algún día se necesita
  invalidarlo de verdad (por ejemplo si se pierde un equipo), hay que agregar una
  tabla de sesiones o un contador por usuario; queda anotado como decisión
  pendiente en docs/reglas-de-negocio.md.
*/

import crypto from "node:crypto";

const HORAS_POR_DEFECTO = 12;
const LARGO_MINIMO_CLAVE = 32;

/** La clave con la que se firma. Se lee al usarla, no al cargar el archivo. */
function claveSecreta() {
  const clave = process.env.CLAVE_SESION;

  if (!clave || clave.length < LARGO_MINIMO_CLAVE) {
    throw new Error(
      "Falta CLAVE_SESION en servidor/.env (o es demasiado corta). " +
        "Genera una con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  return clave;
}

/** Cuántas horas dura una sesión. Se puede cambiar en el .env (SESION_HORAS). */
export function horasDeSesion() {
  const horas = Number(process.env.SESION_HORAS);

  return Number.isFinite(horas) && horas > 0 ? horas : HORAS_POR_DEFECTO;
}

function ahoraEnSegundos() {
  return Math.floor(Date.now() / 1000);
}

function firmaDe(cuerpo) {
  return crypto.createHmac("sha256", claveSecreta()).update(cuerpo).digest();
}

/**
 * Crea un token para un usuario.
 *
 * @param {object} opciones
 * @param {number} opciones.idUsuario
 * @param {number} [opciones.segundos]  Duración. Si no se dice, la del .env.
 * @returns {string} el token
 */
export function firmarToken({ idUsuario, segundos }) {
  if (!Number.isInteger(idUsuario)) {
    throw new Error("Se necesita el identificador del usuario para firmar la sesión.");
  }

  const duracion = Number.isFinite(segundos) && segundos > 0 ? segundos : horasDeSesion() * 3600;
  const expiraEn = ahoraEnSegundos() + Math.floor(duracion);

  const cuerpo = Buffer.from(JSON.stringify({ u: idUsuario, x: expiraEn }), "utf8").toString(
    "base64url",
  );

  return `${cuerpo}.${firmaDe(cuerpo).toString("base64url")}`;
}

/**
 * Comprueba un token. Devuelve sus datos, o null si no sirve
 * (mal formado, firma que no cuadra, o vencido).
 */
export function revisarToken(token) {
  if (typeof token !== "string") return null;

  const partes = token.split(".");
  if (partes.length !== 2) return null;

  const [cuerpo, firmaRecibida] = partes;
  if (!cuerpo || !firmaRecibida) return null;

  const esperada = firmaDe(cuerpo);
  const recibida = Buffer.from(firmaRecibida, "base64url");

  // Sin esto, timingSafeEqual revienta si los largos no coinciden.
  if (recibida.length !== esperada.length) return null;
  // Comparación en tiempo constante: no se puede adivinar la firma midiendo
  // cuánto tarda en fallar.
  if (!crypto.timingSafeEqual(recibida, esperada)) return null;

  let datos;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!datos || !Number.isInteger(datos.u) || !Number.isInteger(datos.x)) return null;
  if (datos.x <= ahoraEnSegundos()) return null; // vencido

  return { idUsuario: datos.u, expiraEn: new Date(datos.x * 1000) };
}
