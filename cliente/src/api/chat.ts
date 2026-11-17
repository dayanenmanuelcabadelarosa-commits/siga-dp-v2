/*
  chat.ts — las preguntas para Doña Pula (Fase 8).
  ----------------------------------------------------
*/

import { pedir } from "./cliente-http";

export interface ReporteGeneradoPorIa {
  /** Título grande del reporte. */
  titulo: string;
  /** Línea debajo del título (período, criterio…). */
  subtitulo?: string;
  columnas: ReadonlyArray<{ encabezado: string; alinear?: "izquierda" | "derecha" }>;
  /** Celdas del reporte, en el mismo orden que las columnas (texto ya formateado). */
  filas: ReadonlyArray<ReadonlyArray<string | number | null>>;
  /** ISO-8601, para "Generado el…" dentro del PDF. */
  generadoEn?: string;
  /** Nombre sugerido para el archivo PDF. */
  nombreArchivo: string;
}

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
  /** El reporte que la IA generó (o `null`). */
  reporte?: ReporteGeneradoPorIa | null;
}

export function preguntarAAnaPula(pregunta: string): Promise<RespuestaDelChat> {
  return pedir<RespuestaDelChat>("/api/asistente/chat", {
    metodo: "POST",
    cuerpo: { pregunta },
    // La IA puede tardar: se le da más margen que a las demás peticiones.
    timeoutMs: 120_000,
  });
}
