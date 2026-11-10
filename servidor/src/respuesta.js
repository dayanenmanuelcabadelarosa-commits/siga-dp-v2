/*
  respuesta.js — la única forma de responder de esta API.
  -------------------------------------------------------

  El plan (sección 7) exige "un formato de respuesta único para toda la API". El
  prototipo tenía dos formas distintas según la ruta; aquí hay una sola:

    Éxito → { "ok": true,  "datos": ... }
    Error → { "ok": false, "error": { "codigo": "...", "mensaje": "..." } }

  Los errores no se arman aquí: se lanzan como ErrorDeApi y los convierte el
  manejador global de app.js. Así no hay dos maneras de escribir un error.

  Está propuesto y confirmado en docs/reglas-de-negocio.md (sección 4).
*/

/**
 * Responde con el formato de éxito.
 *
 * @param {import("express").Response} res
 * @param {unknown} datos  Lo que se quiere devolver (objeto, lista, número...).
 * @param {number} [estado] 200 por defecto; 201 cuando se crea algo.
 */
export function exito(res, datos, estado = 200) {
  return res.status(estado).json({ ok: true, datos });
}
