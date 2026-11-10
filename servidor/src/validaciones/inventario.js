/*
  inventario.js (validaciones) — lo que se revisa antes de tocar el almacén.
  -------------------------------------------------------------------------

  Tres piezas: insumos, proveedores y movimientos.

  Las cantidades viajan como texto ("5", "2.50"), igual que el precio del
  catálogo: así no pasan por los redondeos de JavaScript. La base las guarda en
  el dominio `cantidad` (NUMERIC(12,2)) y las devuelve como número.

  Un movimiento no manda la cantidad con signo desde la pantalla:
    · Entrada de compra → cantidad positiva.
    · Salida por consumo → cantidad positiva; el servidor la guarda negativa.
    · Ajuste por conteo → el conteo físico; el servidor calcula la diferencia.

  Que el insumo exista y esté activo, que el proveedor esté activo y que la
  existencia alcance se comprueba en la ruta contra PostgreSQL, que es la única
  fuente de verdad.
*/

import { z } from "zod";

const nombreDeInsumo = z
  .string({ error: "Escribe el nombre del insumo." })
  .trim()
  .min(1, "Escribe el nombre del insumo.")
  .max(80, "El nombre del insumo no puede pasar de 80 caracteres.");

const nombreDeProveedor = z
  .string({ error: "Escribe el nombre del proveedor." })
  .trim()
  .min(1, "Escribe el nombre del proveedor.")
  .max(80, "El nombre del proveedor no puede pasar de 80 caracteres.");

const telefono = z
  .string({ error: "Escribe el teléfono del proveedor." })
  .trim()
  .min(1, "Escribe el teléfono del proveedor.")
  .max(20, "El teléfono no puede pasar de 20 caracteres.")
  .regex(
    /^[0-9+()\-\s]{7,20}$/,
    "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).",
  );

/**
 * Una cantidad con hasta dos decimales. El máximo coincide con el dominio
 * `cantidad` de la base: NUMERIC(12,2), es decir, diez dígitos enteros.
 */
const cantidad = z
  .string({ error: "Escribe la cantidad." })
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "La cantidad debe ser un número con hasta dos decimales.",
  );

const cantidadPositiva = cantidad.refine(
  (texto) => Number(texto) > 0,
  "La cantidad debe ser mayor que cero.",
);

/** El mínimo puede ser cero: significa que no se avisa por ese insumo. */
const minimo = cantidad.refine(
  (texto) => Number(texto) >= 0,
  "El mínimo no puede ser negativo.",
);

/** El conteo físico puede ser cero (se acabó el insumo). */
const conteoFisico = cantidad.refine(
  (texto) => Number(texto) >= 0,
  "El conteo físico no puede ser negativo.",
);

const detalle = z
  .string({ error: "Escribe el detalle del movimiento." })
  .trim()
  .min(1, "Escribe el detalle del movimiento.")
  .max(160, "El detalle no puede pasar de 160 caracteres.");

const idDeUnidad = z
  .number({ error: "Elige una unidad de medida." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige una unidad de medida de la lista.",
  );

const idDeInsumo = z
  .number({ error: "Elige un insumo." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige un insumo de la lista.",
  );

const idDePunto = z
  .number({ error: "Elige un punto de acceso." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige un punto de acceso de la lista.",
  );

const idDeProveedor = z
  .number({ error: "Elige un proveedor." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige un proveedor de la lista.",
  );

const estadoDeProveedor = z.enum(["Activo", "Inactivo"], {
  error: "Elige el estado del proveedor.",
});

/** Lo que llega al crear un insumo. */
export const esquemaCrearInsumo = z.object({
  nombre: nombreDeInsumo,
  id_unidad: idDeUnidad,
  minimo,
});

/** Lo que llega al editar. Todo es opcional, pero algo tiene que venir. */
export const esquemaEditarInsumo = z
  .object({
    nombre: nombreDeInsumo,
    id_unidad: idDeUnidad,
    minimo,
    activo: z.boolean({ error: "Indica si el insumo está activo." }),
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Lo que llega al crear un proveedor. */
export const esquemaCrearProveedor = z.object({
  nombre: nombreDeProveedor,
  telefono,
});

/** Lo que llega al editar un proveedor. */
export const esquemaEditarProveedor = z
  .object({
    nombre: nombreDeProveedor,
    telefono,
    estado: estadoDeProveedor,
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Los tres movimientos posibles, cada uno con sus datos propios. */
export const esquemaMovimiento = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("Entrada de compra"),
    id_insumo: idDeInsumo,
    id_punto: idDePunto,
    cantidad: cantidadPositiva,
    detalle,
    id_proveedor: idDeProveedor,
  }),
  z.object({
    tipo: z.literal("Salida por consumo"),
    id_insumo: idDeInsumo,
    id_punto: idDePunto,
    cantidad: cantidadPositiva,
    detalle,
  }),
  z.object({
    tipo: z.literal("Ajuste por conteo"),
    id_insumo: idDeInsumo,
    id_punto: idDePunto,
    conteo_fisico: conteoFisico,
  }),
]);

/** El filtro de la lista de movimientos. */
export const esquemaConsultaMovimientos = z.object({
  id_insumo: z
    .union([
      z.number(),
      z.string().regex(/^\d+$/, "El insumo del filtro no es válido."),
    ])
    .transform((v) => Number(v))
    .pipe(z.number().int().positive())
    .optional(),
  limite: z
    .union([
      z.number(),
      z.string().regex(/^\d+$/, "El límite no es válido."),
    ])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(500))
    .default(200),
});
