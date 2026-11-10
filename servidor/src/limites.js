/*
  limites.js — el freno a las peticiones (rate limiting).
  -----------------------------------------------------

  Dos frenos distintos, porque protegen de cosas distintas:

    general   Todas las peticiones de /api. Evita que un programa automático
              (o una página que se quedó en un bucle) tumbe el servidor.
    ingresos  Solo POST /api/acceso/entrar. Es el que frena un ataque de fuerza
              bruta contra las claves. Es aparte del bloqueo de la cuenta a los
              3 intentos fallidos (RN-24): ese bloqueo es por cuenta, este es por
              dirección de origen, así que protege también a las cuentas que
              todavía no existen.

  Los números están en el .env (LIMITE_PETICIONES y LIMITE_INGRESOS) y quedaron
  acordados con el dueño: 300 y 10 cada 15 minutos.
*/

import rateLimit from "express-rate-limit";

const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const PETICIONES_POR_DEFECTO = 300;
const INGRESOS_POR_DEFECTO = 10;

function numero(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

function respuestaAgotada(mensaje) {
  return function responder(req, res) {
    res.status(429).json({ ok: false, error: { codigo: "DEMASIADAS_PETICIONES", mensaje } });
  };
}

/**
 * Crea los dos frenos.
 *
 * @param {object} [opciones]
 * @param {number} [opciones.peticiones]  Peticiones generales por ventana.
 * @param {number} [opciones.ingresos]    Intentos de ingreso por ventana.
 */
export function crearLimites({ peticiones, ingresos } = {}) {
  const general = numero(peticiones ?? process.env.LIMITE_PETICIONES, PETICIONES_POR_DEFECTO);
  const deIngreso = numero(ingresos ?? process.env.LIMITE_INGRESOS, INGRESOS_POR_DEFECTO);

  return {
    general: rateLimit({
      windowMs: VENTANA_MS,
      limit: general,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: respuestaAgotada(
        "Demasiadas peticiones seguidas. Espera unos minutos y vuelve a intentarlo.",
      ),
    }),

    ingresos: rateLimit({
      windowMs: VENTANA_MS,
      limit: deIngreso,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      // De los intentos fallidos no se cuenta nada más: los aciertos también
      // gastan cupo, para que no sirva de nada probar claves a toda velocidad.
      skipSuccessfulRequests: false,
      handler: respuestaAgotada(
        "Demasiados intentos de ingreso. Espera unos minutos antes de volver a probar.",
      ),
    }),
  };
}
