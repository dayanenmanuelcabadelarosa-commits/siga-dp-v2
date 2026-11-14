/*
  cuentas.js (validaciones) — lo que se revisa antes de aplicar un descuento, una
  cortesía, cobrar, emitir un comprobante, asignar una línea o cerrar el corte.
  --------------------------------------------------------------------------

  El monto viaja como texto, igual que en el resto del sistema. El tope del
  descuento (10 % del total de la cuenta) se comprueba en la ruta, porque
  necesita el total que calcula PostgreSQL. Aquí solo se asegura la forma.
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
  .string({ error: "Escribe el monto." })
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "El monto debe ser un número mayor que cero, con hasta dos decimales.",
  )
  .refine((texto) => Number(texto) > 0, "El monto debe ser mayor que cero.");

const montoNoNegativo = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "El monto debe tener hasta dos decimales.")
  .refine((texto) => Number(texto) >= 0, "El monto no puede ser negativo.");

const concepto = z
  .string({ error: "Escribe el concepto." })
  .trim()
  .min(1, "El concepto no puede quedar vacío.")
  .max(120, "El concepto no puede pasar de 120 caracteres.");

const tipoComprobante = z.enum(["B01", "B02"], {
  error: "El tipo de comprobante debe ser B01 o B02.",
});

/** Lo que llega al aplicar un descuento. */
export const esquemaAplicarDescuento = z.object({
  concepto,
  monto,
});

/** Lo que llega al aplicar una cortesía. */
export const esquemaAplicarCortesia = z.object({
  concepto,
  monto,
});

/**
 * Lo que llega al cobrar una cuenta.
 *
 * `recibido` solo se usa con efectivo: es cuánto dinero dio el cliente. Con
 * tarjeta, PayPal o crédito lo que se cobra es el total de la cuenta más la
 * propina, así que no hace falta mandarlo.
 */
export const esquemaCobrarCuenta = z
  .object({
    forma: z.enum(["Efectivo", "Tarjeta", "PayPal", "Crédito"], {
      error: "Elige la forma de pago.",
    }),
    recibido: montoNoNegativo.optional(),
    propina: montoNoNegativo.optional(),
    referencia: z.string().trim().max(120).optional(),
    comensal: enteroPositivo.optional(),
  })
  .superRefine((datos, contexto) => {
    if (
      (datos.forma === "Tarjeta" || datos.forma === "PayPal") &&
      (datos.referencia === undefined || datos.referencia === "")
    ) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referencia"],
        message: "La referencia es obligatoria con tarjeta o PayPal.",
      });
    }
    if (datos.comensal !== undefined && datos.forma === "PayPal") {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forma"],
        message: "PayPal no permite todavía cobrar una parte de una cuenta dividida.",
      });
    }
  });

/** Lo que llega al emitir un comprobante fiscal. */
export const esquemaEmitirComprobante = z
  .object({
    tipo: tipoComprobante,
    cliente: z
      .string({ error: "Escribe el nombre del cliente." })
      .trim()
      .min(1, "El cliente no puede quedar vacío.")
      .max(120, "El cliente no puede pasar de 120 caracteres."),
    rncCliente: z.string().trim().max(20).regex(/^[\d\s.-]*$/, "El RNC solo puede contener dígitos.").optional(),
    forma: z
      .enum(["Efectivo", "Tarjeta", "PayPal", "Crédito"], {
        error: "Elige la forma de pago.",
      })
      .optional(),
    referencia: z.string().trim().max(120).optional(),
    pagoId: enteroPositivo.optional(),
  })
  .superRefine((datos, contexto) => {
    if (
      (datos.forma === "Tarjeta" || datos.forma === "PayPal") &&
      (datos.referencia === undefined || datos.referencia === "")
    ) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referencia"],
        message: "La referencia es obligatoria con tarjeta o PayPal.",
      });
    }
  });

/** Lo que llega al asignar una línea a un comensal. */
export const esquemaAsignarLinea = z.object({
  idLineaCuenta: enteroPositivo,
  comensal: enteroPositivo,
  cantidad: enteroPositivo.optional(),
});

/** Lo que llega al cerrar el corte de caja. */
export const esquemaCerrarCorte = z.object({
  efectivoDeclarado: montoNoNegativo,
});
