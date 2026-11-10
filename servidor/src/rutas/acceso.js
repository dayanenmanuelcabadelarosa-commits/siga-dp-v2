/*
  acceso.js (rutas) — entrar, salir y saber quién soy.
  ---------------------------------------------------

    POST /api/acceso/entrar   usuario y clave → token
    POST /api/acceso/salir    cierra la sesión
    GET  /api/acceso/yo       quién soy, con qué rol y qué permisos tengo

  El token se devuelve UNA sola vez, aquí, y viaja en el cuerpo de la respuesta
  (no en una cookie, no en la dirección). A partir de ahí el cliente lo manda en
  el encabezado Authorization de cada petición.
*/

import express from "express";

import { entrar, permisosDe } from "../acceso/autenticacion.js";
import { requiereSesion } from "../acceso/middleware.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import { esquemaEntrar } from "../validaciones/acceso.js";
import { validar } from "../validaciones/validar.js";

/*
  El motivo del rechazo se convierte en un mensaje para la persona.
  Los tres mensajes son claros a propósito: regla de oro 7, el usuario tiene que
  entender qué pasó y qué hacer.
*/
function rechazoDelIngreso(motivo, intentos) {
  if (motivo === "BLOQUEADA") {
    return new ErrorDeApi(
      401,
      "CUENTA_BLOQUEADA",
      "La cuenta está bloqueada por intentos fallidos. Un administrador tiene que habilitarla.",
    );
  }

  if (motivo === "INACTIVA") {
    return new ErrorDeApi(
      401,
      "CUENTA_INACTIVA",
      "Esa cuenta está dada de baja. Habla con el administrador.",
    );
  }

  // Se dice cuántos intentos quedan: es más útil y más honesto que un "error".
  const quedan = Math.max(0, 3 - (intentos ?? 0));
  const aviso =
    quedan === 1
      ? " Te queda 1 intento antes de que la cuenta se bloquee."
      : quedan === 0
        ? ""
        : ` Te quedan ${quedan} intentos antes de que la cuenta se bloquee.`;

  return new ErrorDeApi(401, "CREDENCIALES_INVALIDAS", `Usuario o clave incorrectos.${aviso}`);
}

/**
 * @param {object} opciones
 * @param {import("express").RequestHandler} opciones.limiteIngresos  Freno del login.
 */
export function rutasDeAcceso({ limiteIngresos }) {
  const rutas = express.Router();

  rutas.post(
    "/entrar",
    limiteIngresos,
    validar(esquemaEntrar),
    asyncHandler(async (req, res) => {
      const { usuario, clave } = req.datos;
      const resultado = await entrar(usuario, clave);

      if (!resultado.ok) {
        throw rechazoDelIngreso(resultado.motivo, resultado.intentos);
      }

      /*
        Nota sobre "salir": el token se puede comprobar solo, así que el servidor
        no guarda una lista de sesiones. Cerrar sesión es que el cliente tire su
        token. Si algún día hace falta invalidarlo de verdad, hay que agregar una
        tabla de sesiones (ver la decisión pendiente en docs/reglas-de-negocio.md).
      */
      exito(res, {
        token: resultado.token,
        expira_en: resultado.expiraEn.toISOString(),
        usuario: resultado.usuario,
      });
    }),
  );

  rutas.post(
    "/salir",
    requiereSesion,
    asyncHandler(async (req, res) => {
      exito(res, { mensaje: `Hasta luego, ${req.sesion.nombre}.` });
    }),
  );

  rutas.get(
    "/yo",
    requiereSesion,
    asyncHandler(async (req, res) => {
      const permisos = await permisosDe(req.sesion.idUsuario);

      exito(res, {
        usuario: {
          id_usuario: req.sesion.idUsuario,
          usuario: req.sesion.usuario,
          nombre: req.sesion.nombre,
          id_empleado: req.sesion.idEmpleado,
          rol: req.sesion.rol,
          rol_nombre: req.sesion.rolNombre,
          nivel: req.sesion.nivel,
        },
        permisos,
        expira_en: req.sesion.expiraEn.toISOString(),
      });
    }),
  );

  return rutas;
}
