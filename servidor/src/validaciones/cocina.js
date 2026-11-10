/*
  cocina.js (validaciones) — lo que llega a la pantalla de Cocina.
  ---------------------------------------------------------------

  La cocina no manda precios ni cantidades: solo elige una estación para filtrar
  y confirma el avance de una comanda. El identificador de la comanda se revisa
  en la ruta, porque viene en la dirección.
*/

import { z } from "zod";

/**
 * Filtro opcional por estación: `GET /api/cocina/comandas?estacion=2`.
 * Si no viene, se devuelven las comandas de todas las estaciones.
 */
export const esquemaListarComandas = z.object({
  estacion: z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform((valor) => Number(valor))
    .refine(
      (valor) => Number.isInteger(valor) && valor > 0,
      "La estación no es válida.",
    )
    .optional(),
});

/**
 * Marcar agotado o reponer: `PATCH /api/cocina/productos/:id/disponibilidad`.
 * Es un booleano explícito, no un "toogle": si dos pantallas mandan a la vez,
 * la última deja el estado que quiso, no el contrario del que leyó.
 */
export const esquemaDisponibilidad = z.object({
  disponible: z.boolean({
    message: "Hay que decir si el producto queda disponible o agotado.",
  }),
});
