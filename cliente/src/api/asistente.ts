/*
  asistente.ts — las llamadas del asistente de IA (Fase 8).
  -------------------------------------------------------

  El modelo solo elige qué platos y por qué. El precio y el tiempo de
  preparación los pone PostgreSQL, así que aquí llegan como números del
  catálogo, nunca como texto inventado.
*/

import { pedir } from "./cliente-http";

export interface SugerenciaDelAsistente {
  productoId: number;
  nombre: string;
  precio: number;
  /** Minutos estimados del catálogo. `null` = el plato no tiene tiempo estimado. */
  minutos: number | null;
  motivo: string;
}

export interface SugerenciasDelAsistente {
  mesa: number;
  sugerencias: SugerenciaDelAsistente[];
  /** "groq": las propuso Groq. "base": las armó el sistema con los datos del local. */
  origen: "groq" | "base";
  /** Por qué no vinieron del modelo, cuando no vinieron. */
  aviso: string | null;
}

export function obtenerSugerencias(mesa: number): Promise<SugerenciasDelAsistente> {
  return pedir<SugerenciasDelAsistente>(`/api/asistente/sugerencias/${mesa}`);
}
