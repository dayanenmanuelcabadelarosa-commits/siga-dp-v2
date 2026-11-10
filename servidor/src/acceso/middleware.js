/*
  middleware.js — quién eres y qué puedes hacer.
  ---------------------------------------------

  Dos preguntas, dos middlewares:

    requiereSesion   ¿hay un token válido?            si no → 401 SIN_SESION
    requierePermiso  ¿este rol puede esta operación?  si no → 403 SIN_PERMISO

  El token se lee del encabezado `Authorization`, con la forma:

      Authorization: Bearer <token>

  Y de ningún otro lado. El prototipo aceptaba el token por la barra de
  direcciones (query string); eso la auditoría (sección 7) lo manda eliminar, y
  aquí no se lee nunca: una dirección queda en el historial del navegador, en los
  registros del servidor y en los enlaces que la gente se pasa por chat. Un token
  ahí es un token regalado.
*/

import { ErrorDeApi } from "../errores.js";
import { puede, sesionDe } from "./autenticacion.js";
import { revisarToken } from "./sesion.js";

/** Saca el token del encabezado Authorization. Null si no hay. */
function tokenDelEncabezado(req) {
  const encabezado = req.get("authorization");
  if (!encabezado) return null;

  const [tipo, valor] = encabezado.split(" ");
  if (!tipo || !valor) return null;
  if (tipo.toLowerCase() !== "bearer") return null;

  return valor.trim() || null;
}

/**
 * Deja pasar solo si hay una sesión válida.
 * Al pasar, deja la persona en `req.sesion`.
 */
export async function requiereSesion(req, _res, next) {
  const token = tokenDelEncabezado(req);

  if (!token) {
    throw new ErrorDeApi(401, "SIN_SESION", "Necesitas iniciar sesión para hacer esto.");
  }

  const datos = revisarToken(token);

  if (!datos) {
    throw new ErrorDeApi(401, "SIN_SESION", "Tu sesión venció o no es válida. Vuelve a entrar.");
  }

  // Se lee de la base en cada petición: así una baja o un cambio de rol surten
  // efecto de inmediato (RN-23) y no hay que esperar a que venza el token.
  const cuenta = await sesionDe(datos.idUsuario);

  if (!cuenta) {
    throw new ErrorDeApi(401, "SIN_SESION", "Tu cuenta ya no existe. Vuelve a entrar.");
  }

  if (cuenta.estado_usuario !== "Activo" || cuenta.estado_empleado !== "Activo") {
    throw new ErrorDeApi(
      401,
      "SIN_SESION",
      "Tu cuenta está dada de baja o bloqueada. Habla con el administrador.",
    );
  }

  req.sesion = {
    idUsuario: cuenta.id_usuario,
    usuario: cuenta.usuario,
    idEmpleado: cuenta.id_empleado,
    nombre: cuenta.nombre,
    rol: cuenta.rol,
    rolNombre: cuenta.rol_nombre,
    nivel: cuenta.nivel,
    expiraEn: datos.expiraEn,
  };

  next();
}

/**
 * Deja pasar solo si el rol de la persona tiene el permiso indicado.
 * Se usa SIEMPRE detrás de `requiereSesion`.
 *
 * @param {string} codigo  El código del permiso, tal como está en la tabla
 *                         `permiso` (por ejemplo "ADMINISTRAR_PERSONAL").
 */
export function requierePermiso(codigo) {
  return async function revisarPermiso(req, _res, next) {
    if (!req.sesion) {
      // Es un error de programación: este middleware va detrás de requiereSesion.
      throw new ErrorDeApi(401, "SIN_SESION", "Necesitas iniciar sesión para hacer esto.");
    }

    const permitido = await puede(req.sesion.idUsuario, codigo);

    if (!permitido) {
      throw new ErrorDeApi(
        403,
        "SIN_PERMISO",
        `Tu rol (${req.sesion.rolNombre}) no tiene permiso para esta operación.`,
      );
    }

    next();
  };
}
