/*
  almacen.ts — dónde vive el token entre una petición y otra.
  ----------------------------------------------------------

  El servidor no usa cookies: el token viaja en el encabezado `Authorization`
  (así lo exige la auditoría, sección 7 del plan). Eso obliga al navegador a
  guardarlo en algún lado, y ese lado tiene que ser lo más discreto posible.

  Se usa `sessionStorage` y no `localStorage` a propósito:

    · Aguanta recargar la página (que es lo que hace falta en el servicio).
    · Muere al cerrar la pestaña o el navegador. En una tablet que se comparte
      en el salón, eso significa que nadie hereda la sesión del turno anterior.
    · No se comparte entre pestañas, así que una pestaña nueva pide entrar otra
      vez. Es una molestia menor a cambio de no dejar sesiones abiertas de más.

  Si el dueño algún día prefiere que la sesión se recuerde al cerrar el
  navegador, se cambia `sessionStorage` por `localStorage` solo en este archivo:
  el resto del cliente no sabe dónde se guarda.

  Lo guardado se vuelve a leer con desconfianza: `sessionStorage` es texto que
  cualquiera puede editar desde la consola del navegador. Si no tiene la forma
  esperada, se descarta y se pide entrar de nuevo.
*/

const CLAVE = "siga-dp.sesion";

export interface SesionGuardada {
  /** El token firmado por el servidor. */
  token: string;
  /** Cuándo vence, en ISO 8601. Lo dice el propio servidor. */
  expiraEn: string;
}

function almacen(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Navegadores con el almacenamiento desactivado. Se trabaja sin recordar la
    // sesión: se podrá usar el sistema mientras no se recargue la página.
    return null;
  }
}

/** ¿Es un objeto con la forma exacta de una sesión guardada? */
function tieneFormaDeSesion(valor: unknown): valor is SesionGuardada {
  if (typeof valor !== "object" || valor === null) return false;

  const posible = valor as Record<string, unknown>;

  return (
    typeof posible.token === "string" &&
    posible.token !== "" &&
    typeof posible.expiraEn === "string" &&
    Number.isFinite(Date.parse(posible.expiraEn))
  );
}

/**
 * Lee lo guardado tal cual, sin mirar si venció.
 *
 * Existe para poder distinguir dos casos que se parecen pero no son iguales:
 * "aquí no hay nada" y "aquí hay una sesión que ya venció". El primero es
 * normal; el segundo hay que avisarlo, porque significa que a la persona se le
 * acabó el tiempo mientras estaba dentro.
 */
export function leerSesionCruda(): SesionGuardada | null {
  const guardado = almacen()?.getItem(CLAVE);
  if (!guardado) return null;

  try {
    const valor: unknown = JSON.parse(guardado);
    return tieneFormaDeSesion(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Lee la sesión guardada. Devuelve `null` si no hay, si está rota o si venció.
 *
 * Que una sesión vencida se trate como "no hay sesión" evita mandar un token
 * que el servidor va a rechazar y, sobre todo, evita que la pantalla se quede
 * un rato creyendo que hay alguien dentro.
 */
export function leerSesion(): SesionGuardada | null {
  const guardada = leerSesionCruda();
  return guardada === null || sesionVencida(guardada) ? null : guardada;
}

/** Guarda la sesión. Si el almacenamiento no está disponible, no hace nada. */
export function guardarSesion(sesion: SesionGuardada): void {
  almacen()?.setItem(CLAVE, JSON.stringify(sesion));
}

/** Borra la sesión. Se llama al salir, al vencer y cuando el servidor dice 401. */
export function limpiarSesion(): void {
  almacen()?.removeItem(CLAVE);
}

/** ¿Ya pasó la hora de vencimiento? */
export function sesionVencida(sesion: SesionGuardada): boolean {
  const vence = Date.parse(sesion.expiraEn);
  return !Number.isFinite(vence) || vence <= Date.now();
}
