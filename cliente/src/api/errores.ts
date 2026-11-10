/*
  errores.ts — el único tipo de error que sale de la capa de API.
  ---------------------------------------------------------------

  Cuando algo falla, la pantalla no tiene que adivinar si fue la red, el
  servidor o un dato mal escrito: siempre recibe un `ErrorDeApi` con un
  `codigo` estable y un `mensaje` ya escrito para la persona (regla de oro 7:
  todo error se le muestra al usuario, y con claridad).

  Los códigos propios del cliente (los que no vienen del servidor) son:

    SIN_CONEXION        no se pudo contactar al servidor
    TIEMPO_AGOTADO      el servidor tardó demasiado
    RESPUESTA_INVALIDA  el servidor respondió algo que no se entiende
    SESION_VENCIDA      el token guardado ya venció (se detecta sin preguntar)
    CONFIGURACION       falta la dirección de la API en el .env
*/

export class ErrorDeApi extends Error {
  /** Código estable. Por ejemplo: `CREDENCIALES_INVALIDAS`, `SIN_CONEXION`. */
  readonly codigo: string;

  /** Código HTTP, o `null` si el error ocurrió antes de llegar al servidor. */
  readonly estado: number | null;

  constructor(mensaje: string, codigo: string, estado: number | null = null) {
    super(mensaje);
    this.name = "ErrorDeApi";
    this.codigo = codigo;
    this.estado = estado;
  }
}

/**
 * Convierte cualquier cosa lanzada en un mensaje que se le pueda enseñar a una
 * persona. Nunca devuelve un texto vacío ni el "Failed to fetch" del navegador.
 */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Ocurrió un error inesperado. Inténtalo otra vez.";
}
