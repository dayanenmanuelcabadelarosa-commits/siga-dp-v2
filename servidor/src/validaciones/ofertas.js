/*
  ofertas.js (validaciones) — lo que se revisa antes de tocar una oferta.
  ---------------------------------------------------------------------------

  Una oferta es un descuento que la gerencia define y que después se puede
  aplicar a una cuenta al cobrar. Hay dos clases:

    · "Porcentaje": un porcentaje del total de la cuenta (por ejemplo, 10 %).
    · "Monto": una cantidad fija (por ejemplo, RD$ 100).
*/

import { z } from "zod";

const nombre = z
  .string({ error: "Escribe el nombre de la oferta." })
  .trim()
  .min(1, "El nombre de la oferta no puede quedar vacío.")
  .max(80, "El nombre no puede pasar de 80 caracteres.");

const descripcion = z
  .string()
  .trim()
  .max(160, "La descripción no puede pasar de 160 caracteres.")
  .optional();

const valor = z
  .number({ error: "Escribe el valor de la oferta." })
  .positive("El valor tiene que ser mayor que cero.");

const fecha = z
  .string({ error: "Escribe la fecha." })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.");

export const esquemaCrearOferta = z
  .object({
    nombre,
    descripcion,
    tipoValor: z.enum(["Porcentaje", "Monto"], {
      error: "Elige si la oferta es un porcentaje o un monto fijo.",
    }),
    valor,
    fechaInicio: fecha,
    fechaFin: fecha,
  })
  .refine((datos) => datos.fechaFin >= datos.fechaInicio, {
    message: "La fecha de fin no puede ser anterior a la de inicio.",
    path: ["fechaFin"],
  })
  .refine(
    (datos) => datos.tipoValor !== "Porcentaje" || datos.valor <= 100,
    {
      message: "Un porcentaje no puede pasar de 100.",
      path: ["valor"],
    },
  );

export const esquemaEditarOferta = z
  .object({
    nombre,
    descripcion,
    tipoValor: z.enum(["Porcentaje", "Monto"]).optional(),
    valor: z.number().positive().optional(),
    fechaInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fechaFin: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, "No hay nada que cambiar.");

export const esquemaAplicarOferta = z.object({
  idOferta: z
    .number({ error: "Elige una oferta." })
    .int("La oferta no es válida.")
    .positive("La oferta no es válida."),
});
