/*
  productos.js (validaciones) — lo que se revisa antes de tocar el catálogo.
  -------------------------------------------------------------------------

  El catálogo tiene tres piezas: productos, categorías y estaciones. Aquí se
  revisa lo que no depende de la base (nombre, precio, identificadores). Que la
  categoría exista o esté activa, que el nombre no se repita y que el producto
  exista lo comprueba la ruta contra PostgreSQL, que es la única fuente de verdad.

  El precio se recibe como texto a propósito: "350.50" no pasa por los redondeos
  de JavaScript. La base lo guarda en `dinero` (NUMERIC(12,2)) y lo devuelve como
  número. El formulario usa el mismo texto que se valida aquí.
*/

import { z } from "zod";

const nombreDeProducto = z
  .string({ error: "Escribe el nombre del producto." })
  .trim()
  .min(1, "Escribe el nombre del producto.")
  .max(80, "El nombre del producto no puede pasar de 80 caracteres.");

const nombreDeCategoria = z
  .string({ error: "Escribe el nombre de la categoría." })
  .trim()
  .min(1, "Escribe el nombre de la categoría.")
  .max(50, "El nombre de la categoría no puede pasar de 50 caracteres.");

const nombreDeEstacion = z
  .string({ error: "Escribe el nombre de la estación." })
  .trim()
  .min(1, "Escribe el nombre de la estación.")
  .max(30, "El nombre de la estación no puede pasar de 30 caracteres.");

/**
 * Un precio con hasta dos decimales y positivo. El máximo coincide con el
 * dominio `dinero` de la base: NUMERIC(12,2), es decir, diez dígitos enteros.
 */
const precio = z
  .string({ error: "Escribe el precio." })
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "El precio debe ser un número mayor que cero, con hasta dos decimales.",
  )
  .refine(
    (texto) => Number(texto) > 0,
    "El precio debe ser mayor que cero.",
  );

const idDeCategoria = z
  .number({ error: "Elige una categoría." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige una categoría de la lista.",
  );

const idDeEstacion = z
  .number({ error: "Elige una estación." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige una estación de la lista.",
  );

/**
 * Los minutos que se toma el plato. Es opcional: si no se dice nada, el
 * producto queda "sin estimar" y el asistente lo dice así, en vez de inventar
 * un tiempo.
 */
const tiempoEstimado = z
  .number({ error: "Escribe los minutos estimados." })
  .int("Los minutos estimados deben ser un número entero.")
  .positive("Los minutos estimados deben ser mayores que cero.")
  .nullable();

/** Lo que llega al crear un producto. */
export const esquemaCrearProducto = z.object({
  nombre: nombreDeProducto,
  precio,
  id_categoria: idDeCategoria,
  id_estacion: idDeEstacion,
  tiempo_estimado_minutos: tiempoEstimado.optional(),
});

/** Lo que llega al editar. Todo es opcional, pero algo tiene que venir. */
export const esquemaEditarProducto = esquemaCrearProducto
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** El interruptor de disponibilidad del día. */
export const esquemaCambiarDisponibilidad = z.object({
  disponible: z.boolean({ error: "Indica si el producto está disponible." }),
});

/** Lo que llega al crear una categoría. */
export const esquemaCrearCategoria = z.object({
  nombre: nombreDeCategoria,
});

/** Lo que llega al editar una categoría: nombre, estado o ambos. */
export const esquemaEditarCategoria = z
  .object({
    nombre: nombreDeCategoria,
    activo: z.boolean({ error: "Indica si la categoría está activa." }),
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Lo que llega al crear una estación. */
export const esquemaCrearEstacion = z.object({
  nombre: nombreDeEstacion,
});

/** Lo que llega al renombrar una estación. */
export const esquemaEditarEstacion = z
  .object({
    nombre: nombreDeEstacion,
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );
