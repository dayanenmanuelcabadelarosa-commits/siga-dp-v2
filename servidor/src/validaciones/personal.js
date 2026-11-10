/*
  personal.js (validaciones) — lo que se revisa antes de tocar empleados y usuarios.
  ---------------------------------------------------------------------------------

  Los mensajes están escritos para la persona que llena el formulario, no para un
  programador. La ruta no ve `req.body`: ve `req.datos`, que ya pasó por aquí.

  Reglas que se comprueban aquí (las que no dependen de la base):
    · La cédula y el nombre no pueden quedar vacíos.
    · El teléfono es opcional, pero si se escribe tiene un formato razonable.
    · El usuario tiene entre 3 y 30 caracteres y solo letras, números, punto,
      guion y guion bajo. Se guarda en minúsculas para que "Gerente" y "gerente"
      no sean dos cuentas distintas.
    · La clave nueva tiene al menos 8 caracteres (decisión del dueño, Fase 4).

  Lo que NO se comprueba aquí, porque la base es la única que puede saberlo:
  que el rol exista, que la cédula y el usuario no estén repetidos, y que quien
  administra no esté creando a alguien de un nivel superior.
*/

import { z } from "zod";

/** Cuántos caracteres pide como mínimo una clave nueva. */
export const LARGO_MINIMO_DE_CLAVE = 8;

const cedula = z
  .string({ error: "Escribe la cédula." })
  .trim()
  .min(1, "Escribe la cédula.")
  .max(20, "La cédula no puede pasar de 20 caracteres.")
  .regex(/^[\d\s-]+$/, "La cédula solo puede contener dígitos.");

const nombre = z
  .string({ error: "Escribe el nombre completo." })
  .trim()
  .min(1, "Escribe el nombre completo.")
  .max(80, "El nombre no puede pasar de 80 caracteres.");

/*
  El teléfono es opcional. Una cadena vacía se guarda como NULL, no como "".
  Se aceptan números, espacios, +, guiones y paréntesis porque el local trabaja
  con teléfonos de distintas formas (809-555-0101, +1 809 555 0101...).
*/
const telefono = z
  .string({ error: "El teléfono no es válido." })
  .trim()
  .max(20, "El teléfono no puede pasar de 20 caracteres.")
  .refine(
    (valor) => valor === "" || /^[0-9+()\-\s]{7,20}$/.test(valor),
    "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).",
  )
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? null : valor));

const idRol = z
  .number({ error: "Elige un rol." })
  .refine(
    (valor) => Number.isInteger(valor) && valor > 0,
    "Elige un rol de la lista.",
  );

const usuario = z
  .string({ error: "Escribe el nombre de usuario." })
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .max(30, "El usuario no puede pasar de 30 caracteres.")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "El usuario solo puede tener letras, números, punto, guion y guion bajo.",
  )
  .transform((valor) => valor.toLowerCase());

const clave = z
  .string({ error: "Escribe la clave." })
  .min(
    LARGO_MINIMO_DE_CLAVE,
    `La clave debe tener al menos ${LARGO_MINIMO_DE_CLAVE} caracteres.`,
  )
  .max(200, "La clave no puede pasar de 200 caracteres.");

/** Lo que llega al crear un empleado con su cuenta de acceso. */
export const esquemaCrearEmpleado = z.object({
  cedula,
  nombre,
  telefono,
  id_rol: idRol,
  usuario,
  clave,
});

/** Lo que llega al editar. Los tres campos son opcionales, pero algo tiene que venir. */
export const esquemaEditarEmpleado = z
  .object({
    nombre,
    telefono,
    id_rol: idRol,
  })
  .partial()
  .refine(
    (datos) => Object.keys(datos).length > 0,
    "No hay nada que cambiar.",
  );

/** Lo que llega al restablecer una clave. */
export const esquemaCambiarClave = z.object({ clave });
