/*
  paypal.js (validaciones) — lo que se revisa antes de tocar PayPal.
*/

import { z } from "zod";

export const esquemaPagoPaypal = z.object({
  mesa: z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform((valor) => Number(valor))
    .refine(
      (valor) => Number.isInteger(valor) && valor > 0,
      "El número de mesa debe ser un entero mayor que cero.",
    ),
});
