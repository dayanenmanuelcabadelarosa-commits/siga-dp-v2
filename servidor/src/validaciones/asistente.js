/*
  asistente.js (validaciones) — lo que se revisa antes de preguntar al asistente.
*/

import { z } from "zod";

export const esquemaPregunta = z.object({
  pregunta: z
    .string({ error: "Escribe tu pregunta." })
    .trim()
    .min(1, "Escribe tu pregunta.")
    .max(500, "La pregunta es muy larga (máximo 500 caracteres)."),
});
