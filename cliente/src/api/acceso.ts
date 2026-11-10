/*
  acceso.ts — las tres llamadas del acceso al sistema.
  ---------------------------------------------------

  Son funciones finas a propósito: solo dicen a qué ruta se llama, con qué
  método y con qué cuerpo. Todo lo demás (token, errores, tiempo máximo) vive
  en `cliente-http.ts`, en un solo lugar.

  Nada de esto inventa datos: si el servidor no contesta, hay error y la
  pantalla lo muestra.
*/

import { pedir } from "./cliente-http";
import type { DatosDeIngreso, DatosDeMiSesion } from "./tipos";

/**
 * Entra al sistema. La ruta es pública, así que no manda token.
 *
 * Los errores llegan como `ErrorDeApi` con el mensaje que escribió el servidor
 * (por ejemplo, "Usuario o clave incorrectos. Te quedan 2 intentos…"), que es
 * justo el que hay que enseñarle a la persona.
 */
export function entrar(usuario: string, clave: string): Promise<DatosDeIngreso> {
  return pedir<DatosDeIngreso>("/api/acceso/entrar", {
    metodo: "POST",
    cuerpo: { usuario, clave },
    conToken: false,
  });
}

/**
 * Avisa al servidor de que la persona se va.
 *
 * Nota honesta: el servidor no guarda una lista de sesiones, así que esto no
 * invalida el token (decisión 19 de docs/reglas-de-negocio.md). Lo que cierra
 * la sesión de verdad es borrar el token del navegador, y eso lo hace el
 * proveedor de sesión aunque esta llamada falle.
 */
export function salir(): Promise<{ mensaje: string }> {
  return pedir<{ mensaje: string }>("/api/acceso/salir", { metodo: "POST" });
}

/** Quién soy, con qué rol y qué permisos tengo. Los permisos los lee el servidor de la base. */
export function yo(): Promise<DatosDeMiSesion> {
  return pedir<DatosDeMiSesion>("/api/acceso/yo");
}
