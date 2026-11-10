/*
  personal.ts — las llamadas del módulo de Personal y usuarios.
  ------------------------------------------------------------

  Igual que `acceso.ts`, son funciones finas: solo dicen a qué ruta se llama,
  con qué método y con qué cuerpo. El token, el tiempo máximo y los errores los
  pone `cliente-http.ts` en un solo lugar.

  Los tipos son el contrato con el servidor. Si el servidor cambia un nombre,
  TypeScript avisa aquí antes de que la pantalla se rompa en silencio.
*/

import { pedir } from "./cliente-http";

/** Los tres estados que puede tener una cuenta (tabla `empleado`/`usuario`). */
export type EstadoDeEmpleado = "Activo" | "Inactivo" | "Bloqueado";

/**
 * Una fila de la lista. `estado` es el estado efectivo: para entrar hacen falta
 * el empleado y la cuenta activos, así que si cualquiera de los dos está
 * Inactivo, la fila se ve Inactiva.
 */
export interface EmpleadoDePersonal {
  id_empleado: number;
  cedula: string;
  nombre: string;
  telefono: string | null;
  /** Fecha en formato `AAAA-MM-DD`, tal como la devuelve PostgreSQL. */
  fecha_ingreso: string;
  id_rol: number;
  /** Código estable del rol: `gerente`, `mesero`... */
  rol: string;
  /** Nombre para mostrar: `Gerente`, `Mesero`... */
  rol_nombre: string;
  /** Nivel del rol (1 a 5). El servidor lo usa para impedir abusos. */
  nivel: number;
  id_usuario: number | null;
  usuario: string | null;
  estado: EstadoDeEmpleado;
  estado_empleado: EstadoDeEmpleado;
  estado_usuario: EstadoDeEmpleado | null;
  intentos_fallidos: number | null;
  ultimo_acceso: string | null;
}

/** Un rol que la persona que está mirando la pantalla puede asignar. */
export interface RolAsignable {
  id_rol: number;
  codigo: string;
  nombre: string;
  nivel: number;
  descripcion: string | null;
}

export interface DatosDePersonal {
  empleados: EmpleadoDePersonal[];
  roles: RolAsignable[];
}

export interface DatosParaCrearEmpleado {
  cedula: string;
  nombre: string;
  telefono: string;
  id_rol: number;
  usuario: string;
  clave: string;
}

export interface DatosParaEditarEmpleado {
  nombre: string;
  telefono: string;
  id_rol: number;
}

/** La lista completa, con los roles que este usuario puede asignar. */
export function listarPersonal(): Promise<DatosDePersonal> {
  return pedir<DatosDePersonal>("/api/personal");
}

/** Crea el empleado y su cuenta en una sola operación del servidor. */
export function crearEmpleado(
  datos: DatosParaCrearEmpleado,
): Promise<EmpleadoDePersonal> {
  return pedir<EmpleadoDePersonal>("/api/personal", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarEmpleado(
  idEmpleado: number,
  datos: DatosParaEditarEmpleado,
): Promise<EmpleadoDePersonal> {
  return pedir<EmpleadoDePersonal>(`/api/personal/${idEmpleado}`, {
    metodo: "PATCH",
    cuerpo: datos,
  });
}

export function darDeBajaEmpleado(
  idEmpleado: number,
): Promise<EmpleadoDePersonal> {
  return pedir<EmpleadoDePersonal>(`/api/personal/${idEmpleado}/baja`, {
    metodo: "POST",
  });
}

export function reactivarEmpleado(
  idEmpleado: number,
): Promise<EmpleadoDePersonal> {
  return pedir<EmpleadoDePersonal>(`/api/personal/${idEmpleado}/reactivar`, {
    metodo: "POST",
  });
}

export function desbloquearEmpleado(
  idEmpleado: number,
): Promise<EmpleadoDePersonal> {
  return pedir<EmpleadoDePersonal>(`/api/personal/${idEmpleado}/desbloquear`, {
    metodo: "POST",
  });
}

/** Devuelve el mensaje de confirmación que escribió el servidor. */
export function cambiarClaveDeEmpleado(
  idEmpleado: number,
  clave: string,
): Promise<{ mensaje: string }> {
  return pedir<{ mensaje: string }>(`/api/personal/${idEmpleado}/clave`, {
    metodo: "POST",
    cuerpo: { clave },
  });
}
