/*
  bitacora.js (validaciones) — filtros de la consulta de auditoría.
*/

import { z } from "zod";

export const esquemaConsultaBitacora = z.object({
  desde: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accion: z.string().trim().optional(),
  tabla: z.string().trim().optional(),
  limite: z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform((valor) => Number(valor))
    .refine((valor) => Number.isInteger(valor) && valor > 0, "Límite inválido.")
    .optional(),
});
