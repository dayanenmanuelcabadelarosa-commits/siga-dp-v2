/*
  useSesion.ts — la puerta por la que las pantallas leen la sesión.
  ----------------------------------------------------------------

  Se lanza un error claro si alguien lo usa fuera del proveedor, en vez de
  devolver un valor vacío que haría que la pantalla se comporte como si nadie
  tuviera permisos. Un fallo de montaje tiene que verse, no esconderse.
*/

import { useContext } from "react";

import { ContextoSesion } from "./contexto";
import type { SesionContexto } from "./contexto";

export function useSesion(): SesionContexto {
  const sesion = useContext(ContextoSesion);

  if (sesion === null) {
    throw new Error(
      "useSesion() se usó fuera de <ProveedorSesion>. Envuelve la aplicación con el proveedor en main.tsx.",
    );
  }

  return sesion;
}
