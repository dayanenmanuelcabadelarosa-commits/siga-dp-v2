/*
  chat.ts — las preguntas para Doña Pula (Fase 8).
  ----------------------------------------------------
*/

import { pedir } from "./cliente-http";

export interface RespuestaDelChat {
  /** Lo que respondió Doña Pula. */
  respuesta: string;
  /**
   * "groq": lo redactó Groq. "base": el asistente no estaba disponible
   * y la respuesta se armó con los datos de PostgreSQL.
   */
  origen: "groq" | "base";
  /** Si quien pregunta puede ver las ventas. */
  puedeVerVentas: boolean;
}

export function preguntarAAnaPula(pregunta: string): Promise<RespuestaDelChat> {
  return pedir<RespuestaDelChat>("/api/asistente/chat", {
    metodo: "POST",
    cuerpo: { pregunta },
    // La IA puede tardar: se le da más margen que a las demás peticiones.
    timeoutMs: 90_000,
  });
}
