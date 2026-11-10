/*
  tipos.ts — lo que la API devuelve, escrito una sola vez.
  ------------------------------------------------------

  El servidor responde siempre con la misma forma (docs/reglas-de-negocio.md,
  sección 4):

    Éxito → { ok: true,  datos: ... }
    Error → { ok: false, error: { codigo, mensaje } }

  Estos tipos son el contrato. Si el servidor cambia una respuesta, TypeScript
  avisa en el cliente en vez de que la pantalla se rompa en silencio.
*/

/** La persona que está detrás de un token, tal como la devuelve la API. */
export interface UsuarioDeSesion {
  id_usuario: number;
  usuario: string;
  nombre: string;
  id_empleado: number;
  /** Código del rol, estable y en minúsculas: `gerente`, `mesero`... */
  rol: string;
  /** Nombre del rol para mostrar: `Gerente`, `Mesero`... */
  rol_nombre: string;
  /** Nivel del rol (1 a 5). Sirve para mostrar, no para autorizar. */
  nivel: number;
}

/** Lo que devuelve `POST /api/acceso/entrar`. */
export interface DatosDeIngreso {
  token: string;
  /** Fecha y hora en que vence la sesión, en ISO 8601. */
  expira_en: string;
  usuario: UsuarioDeSesion;
}

/** Lo que devuelve `GET /api/acceso/yo`. */
export interface DatosDeMiSesion {
  usuario: UsuarioDeSesion;
  /** Los códigos de las operaciones que el rol tiene permitidas. */
  permisos: string[];
  expira_en: string;
}

/** El cuerpo de una respuesta correcta. */
export interface RespuestaCorrecta<T> {
  ok: true;
  datos: T;
}

/** El cuerpo de una respuesta con error. */
export interface RespuestaConError {
  ok: false;
  error: {
    /** Código estable para el programa (por ejemplo `SIN_SESION`). */
    codigo: string;
    /** Texto para la persona, ya escrito en español. */
    mensaje: string;
  };
}

/** Cualquiera de las dos. Es lo que llega por el cable. */
export type RespuestaApi<T> = RespuestaCorrecta<T> | RespuestaConError;
