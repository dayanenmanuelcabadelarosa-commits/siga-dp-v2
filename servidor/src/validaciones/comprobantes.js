import { z } from "zod";

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD.")
  .refine((valor) => {
    const fechaUtc = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(fechaUtc.valueOf()) && fechaUtc.toISOString().slice(0, 10) === valor;
  }, "La fecha no es válida.")
  .optional();

export const esquemaHistorialComprobantes = z.object({
  desde: fecha,
  hasta: fecha,
  estado: z.enum(["Emitido", "Anulado"]).optional(),
  busqueda: z.string().trim().max(80).optional(),
});
