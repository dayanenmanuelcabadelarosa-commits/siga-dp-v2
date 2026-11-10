/*
  autenticacion.js — entrar al sistema.
  ------------------------------------

  Aquí vive la regla RN-24: tres intentos fallidos bloquean la cuenta, y solo un
  administrador la vuelve a habilitar.

  Dos cuidados que no se ven a simple vista:

  1. Cuando el usuario no existe, igual se calcula un hash antes de responder. Si
     se contestara de inmediato, el tiempo de respuesta delataría qué usuarios
     existen y cuáles no.

  2. El mismo mensaje para "el usuario no existe" y para "la clave está mal". Si
     dijera "ese usuario no existe", cualquiera podría ir descubriendo los nombres
     de los usuarios probando.

  El contador de intentos se guarda dentro de la transacción y se confirma aunque
  la clave esté mal. Por eso esta función no lanza el error: devuelve el motivo y
  la ruta decide con qué código HTTP responder. Si lanzara el error aquí, la
  transacción se desharía y el intento fallido no quedaría contado.
*/

import { conTransaccion } from "../db/conexion.js";
import { verificarClave } from "./claves.js";
import { firmarToken, horasDeSesion } from "./sesion.js";

/** Los intentos fallidos que aguanta una cuenta antes de bloquearse (RN-24). */
export const INTENTOS_MAXIMOS = 3;

/*
  Un hash de mentira, pero con el formato real (sal$hash), para gastar el mismo
  tiempo cuando el usuario no existe. No pertenece a ninguna contraseña.
*/
const HASH_FALSO = `${"0".repeat(32)}$${"0".repeat(128)}`;

/**
 * Intenta entrar al sistema.
 *
 * @returns {Promise<
 *   | { ok: true, usuario: object, token: string, expiraEn: Date }
 *   | { ok: false, motivo: "CREDENCIALES" | "BLOQUEADA" | "INACTIVA", intentos: number }
 * >}
 */
export async function entrar(nombreUsuario, clave) {
  return conTransaccion(async ({ consultarUno, consultar }) => {
    /*
      FOR UPDATE deja la fila tomada hasta que la transacción termine. Sin eso,
      dos intentos fallidos a la vez podrían leer "lleva 2" los dos y ninguno
      llegaría a bloquear la cuenta.
    */
    const cuenta = await consultarUno(
      `SELECT u.id_usuario, u.usuario, u.clave_hash, u.estado, u.intentos_fallidos,
              u.id_empleado, e.nombre, e.estado AS estado_empleado,
              r.codigo AS rol, r.nombre AS rol_nombre, r.nivel
         FROM usuario u
         JOIN empleado e ON e.id_empleado = u.id_empleado
         JOIN rol      r ON r.id_rol      = e.id_rol
        WHERE u.usuario = $1
          FOR UPDATE OF u`,
      [nombreUsuario],
    );

    if (!cuenta) {
      /*
        Se gasta el mismo trabajo que si existiera (ver nota 1 arriba).

        Y se devuelve `intentos: 1` aunque no se haya contado nada: así el mensaje
        ("te quedan 2 intentos") es byte por byte el mismo que recibe quien falla la
        clave de una cuenta que sí existe. Si aquí se devolviera 0, la respuesta
        diría "te quedan 3 intentos" y con eso cualquiera podría averiguar qué
        usuarios existen sin más que mirar el mensaje.
      */
      verificarClave(clave, HASH_FALSO);
      return { ok: false, motivo: "CREDENCIALES", intentos: 1 };
    }

    // Una cuenta bloqueada no se desbloquea con la clave correcta (RN-24).
    if (cuenta.estado === "Bloqueado" || cuenta.estado_empleado === "Bloqueado") {
      return { ok: false, motivo: "BLOQUEADA", intentos: cuenta.intentos_fallidos };
    }

    if (cuenta.estado === "Inactivo" || cuenta.estado_empleado === "Inactivo") {
      return { ok: false, motivo: "INACTIVA", intentos: cuenta.intentos_fallidos };
    }

    if (!verificarClave(clave, cuenta.clave_hash)) {
      const intentos = cuenta.intentos_fallidos + 1;
      const bloquear = intentos >= INTENTOS_MAXIMOS;

      await consultar(
        `UPDATE usuario
            SET intentos_fallidos = $2,
                estado = CASE WHEN $3 THEN 'Bloqueado'::estado_empleado ELSE estado END
          WHERE id_usuario = $1`,
        [cuenta.id_usuario, intentos, bloquear],
      );

      return {
        ok: false,
        motivo: bloquear ? "BLOQUEADA" : "CREDENCIALES",
        intentos,
      };
    }

    // Entró: se limpia el contador y se deja la fecha del último acceso.
    await consultar(
      "UPDATE usuario SET intentos_fallidos = 0, ultimo_acceso = now() WHERE id_usuario = $1",
      [cuenta.id_usuario],
    );

    const token = firmarToken({ idUsuario: cuenta.id_usuario });
    const expiraEn = new Date(Date.now() + horasDeSesion() * 3600 * 1000);

    return {
      ok: true,
      token,
      expiraEn,
      usuario: {
        id_usuario: cuenta.id_usuario,
        usuario: cuenta.usuario,
        nombre: cuenta.nombre,
        id_empleado: cuenta.id_empleado,
        rol: cuenta.rol,
        rol_nombre: cuenta.rol_nombre,
        nivel: cuenta.nivel,
      },
    };
  });
}

/**
 * Los datos de la persona que está detrás de un token, leídos de la base.
 * Devuelve null si el usuario ya no existe o no está activo.
 *
 * Se llama en CADA petición, a propósito: así la baja o el cambio de rol surten
 * efecto en el acto (RN-23) y no hay que esperar a que venza el token.
 */
export async function sesionDe(idUsuario) {
  return conTransaccion(({ consultarUno }) =>
    consultarUno(
      `SELECT u.id_usuario, u.usuario, u.estado AS estado_usuario, u.ultimo_acceso,
              u.id_empleado, e.nombre, e.estado AS estado_empleado,
              r.codigo AS rol, r.nombre AS rol_nombre, r.nivel
         FROM usuario u
         JOIN empleado e ON e.id_empleado = u.id_empleado
         JOIN rol      r ON r.id_rol      = e.id_rol
        WHERE u.id_usuario = $1`,
      [idUsuario],
    ),
  );
}

/**
 * ¿Este usuario puede hacer esta operación?
 *
 * Se pregunta a la tabla `rol_permiso`, que es la matriz que llena el dueño. Si la
 * matriz está vacía, la respuesta es NO: se niega por defecto. Es a propósito
 * (regla de oro 6: la seguridad desde el primer endpoint).
 *
 * No hay ningún rol con permiso automático, ni siquiera el dueño: lo que puede
 * hacer cada uno tiene que estar escrito en la matriz.
 */
export async function puede(idUsuario, codigoPermiso) {
  const fila = await conTransaccion(({ consultarUno }) =>
    consultarUno(
      `SELECT 1 AS puede
         FROM usuario u
         JOIN empleado    e  ON e.id_empleado  = u.id_empleado
         JOIN rol_permiso rp ON rp.id_rol      = e.id_rol
         JOIN permiso     p  ON p.id_permiso   = rp.id_permiso
        WHERE u.id_usuario = $1
          AND p.codigo     = $2
          AND rp.permitido = TRUE
          AND u.estado = 'Activo'
          AND e.estado = 'Activo'
        LIMIT 1`,
      [idUsuario, codigoPermiso],
    ),
  );

  return fila !== null;
}

/** Todos los permisos que tiene un usuario. Lo usa la pantalla para saber qué mostrar. */
export async function permisosDe(idUsuario) {
  const filas = await conTransaccion(({ consultar }) =>
    consultar(
      `SELECT p.codigo
         FROM usuario u
         JOIN empleado    e  ON e.id_empleado = u.id_empleado
         JOIN rol_permiso rp ON rp.id_rol     = e.id_rol
         JOIN permiso     p  ON p.id_permiso  = rp.id_permiso
        WHERE u.id_usuario = $1
          AND rp.permitido = TRUE
        ORDER BY p.codigo`,
      [idUsuario],
    ),
  );

  return filas.map((fila) => fila.codigo);
}
