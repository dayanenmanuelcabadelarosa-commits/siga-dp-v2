/*
  mesas.js (validaciones) — lo que se revisa antes de tocar el salón.
  ------------------------------------------------------------------

  El salón tiene tres piezas: zonas, mesas y reservas. Aquí se revisa lo que no
  depende de la base (nombres, números, fechas y horas). Que la zona o la mesa
  existan, que la mesa tenga capacidad, que la reserva no choque con otra y que
  la mesa no esté ocupada lo comprueba la ruta contra PostgreSQL, que es la única
  fuente de verdad.

  Las fechas y las horas viajan como texto (`YYYY-MM-DD` y `HH:MM`) porque son
  datos de calendario, no instantes. Así no se cruza la zona horaria del
  navegador con la de la base.
*/

import { z } from "zod";

const nombreDeZona = z
  .string({ error: "Escribe el nombre de la zona." })
  .trim()
  .min(1, "Escribe el nombre de la zona.")
  .max(60, "El nombre de la zona no puede pasar de 60 caracteres.");

const tipoDeAmbiente = z
  .string({ error: "Escribe el tipo de ambiente." })
  .trim()
  .min(1, "Escribe el tipo de ambiente.")
  .max(30, "El tipo de ambiente no puede pasar de 30 caracteres.");

const numeroDeMesa = z
  .number({ error: "Escribe el número de mesa." })
  .int("El número de mesa debe ser un entero.")
  .min(1, "El número de mesa debe ser mayor que cero.")
  .max(32767, "El número de mesa es demasiado grande.");

const capacidad = z
  .number({ error: "Escribe la capacidad de la mesa." })
  .int("La capacidad debe ser un número entero.")
  .min(1, "La capacidad debe ser mayor que cero.")
  .max(32767, "La capacidad es demasiado grande.");

const idDeZona = z
  .number({ error: "Elige una zona." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige una zona de la lista.",
  );

const idDeMesa = z
  .number({ error: "Elige una mesa." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige una mesa de la lista.",
  );

const personas = z
  .number({ error: "Escribe cuántas personas llegan." })
  .int("La cantidad de personas debe ser un número entero.")
  .min(1, "Debe llegar al menos una persona.")
  .max(32767, "La cantidad de personas es demasiado grande.");

/** Una fecha real del calendario, no solo un texto con la forma correcta. */
function esFechaReal(texto) {
  const partes = texto.split("-").map(Number);
  if (partes.length !== 3) return false;

  const [anio, mes, dia] = partes;
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return false;
  }

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

const fecha = z
  .string({ error: "Elige una fecha." })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener la forma AAAA-MM-DD.")
  .refine(esFechaReal, "Esa fecha no existe en el calendario.");

const hora = z
  .string({ error: "Elige una hora." })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora debe tener la forma HH:MM.");

const nombreCliente = z
  .string({ error: "Escribe el nombre del cliente." })
  .trim()
  .min(1, "Escribe el nombre del cliente.")
  .max(80, "El nombre del cliente no puede pasar de 80 caracteres.");

const telefono = z
  .string({ error: "Escribe el teléfono." })
  .trim()
  .min(1, "Escribe el teléfono.")
  .max(20, "El teléfono no puede pasar de 20 caracteres.")
  .regex(
    /^[0-9+()\-\s]{7,20}$/,
    "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).",
  );

const motivoCancelacion = z
  .string({ error: "Escribe el motivo de la cancelación." })
  .trim()
  .min(1, "Escribe el motivo de la cancelación.")
  .max(160, "El motivo no puede pasar de 160 caracteres.");

/** Lo que llega al crear una zona. */
export const esquemaCrearZona = z.object({
  nombre: nombreDeZona,
  tipo_ambiente: tipoDeAmbiente,
});

/** Lo que llega al editar una zona. Todo es opcional, pero algo tiene que venir. */
export const esquemaEditarZona = z
  .object({
    nombre: nombreDeZona,
    tipo_ambiente: tipoDeAmbiente,
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Lo que llega al crear una mesa. */
export const esquemaCrearMesa = z.object({
  numero: numeroDeMesa,
  id_zona: idDeZona,
  capacidad,
});

/** Lo que llega al editar una mesa. */
export const esquemaEditarMesa = z
  .object({
    numero: numeroDeMesa,
    id_zona: idDeZona,
    capacidad,
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** El estado que el anfitrión puede marcar a mano. */
export const esquemaEstadoMesa = z.discriminatedUnion("estado", [
  z.object({
    estado: z.literal("ocupada"),
    personas,
  }),
  z.object({
    estado: z.literal("limpieza"),
  }),
  z.object({
    estado: z.literal("libre"),
  }),
]);

/** Lo que llega al crear una reserva. */
export const esquemaCrearReserva = z.object({
  fecha,
  hora,
  nombre_cliente: nombreCliente,
  telefono,
  personas,
  id_mesa: idDeMesa,
});

/** Lo que llega al editar una reserva. */
export const esquemaEditarReserva = esquemaCrearReserva
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Lo que llega al cancelar una reserva. */
export const esquemaCancelarReserva = z.object({
  motivo_cancelacion: motivoCancelacion,
});

/** La fecha que se pide en la agenda. */
export const esquemaFechaDeReservas = z.object({
  fecha,
});
