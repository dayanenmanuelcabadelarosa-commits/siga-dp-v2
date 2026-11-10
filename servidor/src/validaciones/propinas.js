/*
  propinas.js (validaciones) — lo que se revisa antes de tocar una propina.
  ------------------------------------------------------------------------

  El monto viaja como texto ("150.00"), igual que el precio del catálogo: así no
  pasa por los redondeos de JavaScript. La base lo guarda en el dominio `dinero`
  (NUMERIC(12,2)) y lo devuelve como número.

  Reglas que se comprueban aquí:
    · La mesa se elige explícitamente. No hay valor por defecto.
    · El monto es mayor que cero y tiene hasta dos decimales.
    · La propina se registra en efectivo o con tarjeta. PayPal y crédito no se
      ofrecen en esta fase: la decisión 9 de docs/reglas-de-negocio.md sigue
      pendiente, así que no se inventó una regla para ellos.
    · Con tarjeta, la referencia es obligatoria (RN-28).

  Que la mesa sea de quien registra, que no haya una propina repetida y que el
  cierre no se repita se comprueba contra PostgreSQL, que es la fuente de verdad.
*/

import { z } from "zod";

const enteroPositivo = z
  .union([
    z.number(),
    z.string().regex(/^\d+$/, "Debe ser un entero mayor que cero."),
  ])
  .transform((valor) => Number(valor))
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Debe ser un entero mayor que cero.",
  );

const monto = z
  .string({ error: "Escribe el monto de la propina." })
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "El monto debe ser un número mayor que cero, con hasta dos decimales.",
  )
  .refine(
    (texto) => Number(texto) > 0,
    "El monto debe ser mayor que cero.",
  );

const contado = z
  .string({ error: "Escribe el monto contado." })
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "El monto contado debe ser un número con hasta dos decimales.",
  );

/** Lo que llega al registrar una propina. */
export const esquemaRegistrarPropina = z
  .object({
    mesa: enteroPositivo,
    monto,
    forma: z.enum(["Efectivo", "Tarjeta"], {
      error: "Elige la forma de pago: efectivo o tarjeta.",
    }),
    referencia: z
      .string()
      .trim()
      .max(40, "La referencia no puede pasar de 40 caracteres.")
      .optional(),
  })
  .superRefine((datos, contexto) => {
    if (
      datos.forma === "Tarjeta" &&
      (datos.referencia === undefined || datos.referencia === "")
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["referencia"],
        message: "Escribe la referencia de la tarjeta.",
      });
    }
  });

/** Lo que llega al cerrar las propinas de un empleado. */
export const esquemaCerrarPropinas = z.object({
  idEmpleado: enteroPositivo,
  contado,
});
