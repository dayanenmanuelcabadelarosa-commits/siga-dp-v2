/*
  validar.js — revisar lo que llega antes de usarlo.
  ------------------------------------------------

  El plan pide validación con Zod desde el inicio. La idea es sencilla: lo que
  entra por la puerta se revisa ANTES de llegar a la ruta. Si no pasa, se responde
  400 con un mensaje que se entiende y la ruta nunca se ejecuta.

  Los datos ya revisados quedan en `req.datos`. Se usan esos y no `req.body`: así
  se ve a simple vista, al leer una ruta, que está usando datos que ya pasaron por
  el colador.
*/

import { ErrorDeApi } from "../errores.js";

/**
 * Construye un middleware que valida `req.body` contra un esquema de Zod.
 *
 * @param {import("zod").ZodType} esquema
 * @param {string} [donde]  "cuerpo" (por defecto), "consulta" o "parametros".
 */
export function validar(esquema, donde = "cuerpo") {
  const fuentes = {
    cuerpo: (req) => req.body,
    consulta: (req) => req.query,
    parametros: (req) => req.params,
  };

  const leer = fuentes[donde];
  if (!leer) throw new Error(`No sé validar "${donde}".`);

  return function revisarDatos(req, _res, next) {
    const resultado = esquema.safeParse(leer(req));

    if (!resultado.success) {
      // Se arma un mensaje en español con lo que falló y dónde. Zod ya trae los
      // mensajes en español porque los esquemas los escriben así.
      const detalles = resultado.error.issues
        .map((problema) => {
          const campo = problema.path.join(".");
          return campo ? `${campo}: ${problema.message}` : problema.message;
        })
        .join(" · ");

      throw new ErrorDeApi(400, "DATOS_INVALIDOS", detalles || "Los datos enviados no son válidos.");
    }

    if (donde === "cuerpo") {
      req.datos = resultado.data;
    } else {
      req.datos = { ...(req.datos ?? {}), ...resultado.data };
    }

    next();
  };
}
