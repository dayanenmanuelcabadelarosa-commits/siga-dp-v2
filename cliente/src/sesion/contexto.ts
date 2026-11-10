/*
  contexto.ts — el molde del contexto de sesión.
  ---------------------------------------------

  Se separa del proveedor (`ContextoSesion.tsx`) por dos motivos:

    · El tipo y el `createContext` no son componentes, así que no hay que
      mezclarlos con JSX.
    · Las pruebas pueden envolver un componente con el contexto directamente,
      sin tener que simular la red. Es la forma de probar las pantallas por
      separado de verdad.
*/

import { createContext } from "react";

import type { UsuarioDeSesion } from "../api/tipos";

/** Los tres momentos posibles de la sesión. */
export type EstadoDeSesion =
  /** Todavía se está averiguando si hay alguien dentro (al recargar la página). */
  | "cargando"
  /** No hay nadie: hay que entrar. */
  | "anonimo"
  /** Hay alguien dentro, con su rol y sus permisos leídos de la base. */
  | "autenticado";

export interface SesionContexto {
  estado: EstadoDeSesion;

  /** Los datos de la persona, tal como los devolvió la API. `null` si no hay nadie. */
  usuario: UsuarioDeSesion | null;

  /** Los códigos de las operaciones permitidas. `[]` si no hay nadie. */
  permisos: string[];

  /** Cuándo vence la sesión, en ISO 8601. `null` si no hay nadie. */
  expiraEn: string | null;

  /**
   * Un aviso para la pantalla de entrar (por ejemplo, "tu sesión venció").
   * Es distinto de un error de la API: no lo provocó lo que escribió la persona.
   */
  aviso: string | null;

  /** Entra al sistema. Lanza `ErrorDeApi` si no se pudo. */
  entrar: (usuario: string, clave: string) => Promise<void>;

  /** Cierra la sesión. Nunca lanza: aunque el servidor no conteste, aquí se cierra. */
  salir: () => Promise<void>;

  /** ¿El rol de esta persona tiene esta operación? */
  puede: (codigoPermiso: string) => boolean;

  /** Quita el aviso (cuando la persona ya lo leyó o volvió a intentar entrar). */
  descartarAviso: () => void;
}

export const ContextoSesion = createContext<SesionContexto | null>(null);
