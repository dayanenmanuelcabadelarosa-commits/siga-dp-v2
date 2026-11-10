/*
  mesas.ts — las llamadas del módulo Mesas y reservas.
  --------------------------------------------------

  El mapa y la agenda salen de la base; aquí no hay datos de ejemplo. Las fechas
  y las horas viajan como texto (`AAAA-MM-DD` y `HH:MM`) para no cruzar la zona
  horaria del navegador con la de PostgreSQL.

  Los permisos se comprueban otra vez en el servidor. Esta capa solo dice a qué
  ruta se llama y con qué cuerpo; `cliente-http.ts` pone el token y convierte
  cualquier error en un mensaje listo para mostrar.
*/

import { pedir } from "./cliente-http";

export type EstadoDeMesa = "libre" | "ocupada" | "limpieza" | "reservada";

export type EstadoDeReserva = "Pendiente" | "Abierta" | "Cancelada";

export interface Zona {
  id_zona: number;
  nombre: string;
  tipo_ambiente: string;
  activo: boolean;
}

export interface Mesa {
  id_mesa: number;
  numero: number;
  id_zona: number;
  zona: string;
  tipo_ambiente: string;
  zona_activa: boolean;
  capacidad: number;
  estado: EstadoDeMesa;
  personas: number | null;
  /** Fecha ISO que devuelve PostgreSQL. Null si la mesa no está ocupada. */
  hora_llegada: string | null;
  id_mesero_orden: number | null;
  mesero_orden: string | null;
  estado_pedido: string | null;
  creado_en: string;
  modificado_en: string;
}

/** Lo que devuelve `GET /api/mesas`: el salón completo. */
export interface DatosDeMesas {
  zonas: Zona[];
  mesas: Mesa[];
}

export interface Reserva {
  id_reserva: number;
  /** Fecha en formato `AAAA-MM-DD`, tal como la devuelve PostgreSQL. */
  fecha: string;
  /** Hora en formato `HH:MM`. */
  hora: string;
  nombre_cliente: string;
  telefono: string;
  personas: number;
  id_mesa: number;
  mesa_numero: number;
  zona: string;
  estado: EstadoDeReserva;
  motivo_cancelacion: string | null;
  id_mesero_asignado: number | null;
  creado_en: string;
}

export interface DatosDeReservas {
  fecha: string;
  reservas: Reserva[];
}

export interface DatosParaZona {
  nombre: string;
  tipo_ambiente: string;
}

export interface CambiosDeZona {
  nombre?: string;
  tipo_ambiente?: string;
}

export interface DatosParaMesa {
  numero: number;
  id_zona: number;
  capacidad: number;
}

export interface CambiosDeMesa {
  numero?: number;
  id_zona?: number;
  capacidad?: number;
}

export interface DatosParaReserva {
  fecha: string;
  hora: string;
  nombre_cliente: string;
  telefono: string;
  personas: number;
  id_mesa: number;
}

export type CambiosDeReserva = Partial<DatosParaReserva>;

/** Lo que se manda a `PATCH /api/mesas/:id/estado`. */
export type CambioDeEstadoDeMesa =
  | { estado: "ocupada"; personas: number }
  | { estado: "limpieza" }
  | { estado: "libre" };

export function listarMesas(): Promise<DatosDeMesas> {
  return pedir<DatosDeMesas>("/api/mesas");
}

export function listarReservas(fecha: string): Promise<DatosDeReservas> {
  return pedir<DatosDeReservas>(
    `/api/mesas/reservas?fecha=${encodeURIComponent(fecha)}`,
  );
}

export function crearZona(datos: DatosParaZona): Promise<Zona> {
  return pedir<Zona>("/api/mesas/zonas", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarZona(
  idZona: number,
  cambios: CambiosDeZona,
): Promise<Zona> {
  return pedir<Zona>(`/api/mesas/zonas/${idZona}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function eliminarZona(idZona: number): Promise<{ id_zona: number }> {
  return pedir<{ id_zona: number }>(`/api/mesas/zonas/${idZona}`, {
    metodo: "DELETE",
  });
}

export function crearMesa(datos: DatosParaMesa): Promise<Mesa> {
  return pedir<Mesa>("/api/mesas", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarMesa(
  idMesa: number,
  cambios: CambiosDeMesa,
): Promise<Mesa> {
  return pedir<Mesa>(`/api/mesas/${idMesa}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function eliminarMesa(idMesa: number): Promise<{ id_mesa: number }> {
  return pedir<{ id_mesa: number }>(`/api/mesas/${idMesa}`, {
    metodo: "DELETE",
  });
}

export function cambiarEstadoDeMesa(
  idMesa: number,
  cambio: CambioDeEstadoDeMesa,
): Promise<Mesa> {
  return pedir<Mesa>(`/api/mesas/${idMesa}/estado`, {
    metodo: "PATCH",
    cuerpo: cambio,
  });
}

export function crearReserva(datos: DatosParaReserva): Promise<Reserva> {
  return pedir<Reserva>("/api/mesas/reservas", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarReserva(
  idReserva: number,
  cambios: CambiosDeReserva,
): Promise<Reserva> {
  return pedir<Reserva>(`/api/mesas/reservas/${idReserva}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function cancelarReserva(
  idReserva: number,
  motivoCancelacion: string,
): Promise<Reserva> {
  return pedir<Reserva>(`/api/mesas/reservas/${idReserva}/cancelar`, {
    metodo: "POST",
    cuerpo: { motivo_cancelacion: motivoCancelacion },
  });
}

export interface ResultadoDeAbrirReserva {
  reserva: Reserva;
  mesa: Mesa;
}

export function abrirReserva(
  idReserva: number,
): Promise<ResultadoDeAbrirReserva> {
  return pedir<ResultadoDeAbrirReserva>(
    `/api/mesas/reservas/${idReserva}/abrir`,
    { metodo: "POST" },
  );
}
