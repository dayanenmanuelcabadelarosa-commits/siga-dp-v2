/*
  cocina.ts — las llamadas de la pantalla de Cocina (Fase 5, módulo 2).
  --------------------------------------------------------------------

  La cocina solo mueve comandas hacia adelante. No manda cantidades ni precios:
  el servidor ya sabe qué lleva cada comanda porque las líneas se copiaron del
  pedido cuando el mesero la envió.

  "Reportar agotado" no está aquí: la matriz de permisos no tiene esa operación
  todavía (es la operación 28 que falta). No se inventó.
*/

import { pedir } from "./cliente-http";

export type EstadoDeComanda =
  | "Pendiente"
  | "En preparación"
  | "Preparado"
  | "Cerrada";

export type EstadoDeLineaDeComanda =
  | "Pendiente"
  | "En preparación"
  | "Preparado"
  | "Servido"
  | "Anulada";

export interface LineaDeComanda {
  id: number;
  producto: string;
  cantidad: number;
  comensal: number;
  observacion: string;
  estado: EstadoDeLineaDeComanda;
  hora_inicio: string | null;
  hora_preparado: string | null;
}

export interface Comanda {
  id_comanda: number;
  numero: number;
  estado: EstadoDeComanda;
  enviada_en: string;
  iniciada_en: string | null;
  cerrada_en: string | null;
  estacion: string;
  mesa: number;
  mesero: string;
  lineas: LineaDeComanda[];
}

export interface EstacionConPendientes {
  id_estacion: number;
  nombre: string;
  /** Comandas en Pendiente o En preparación. */
  pendientes: number;
}

/** Un producto activo, con su disponibilidad del día. */
export interface ProductoDeCocina {
  id_producto: number;
  nombre: string;
  categoria: string;
  estacion: string;
  /** Número, no texto. */
  precio: number;
  /** `false` = agotado; sigue en la lista para poder reponerlo. */
  disponible: boolean;
}

/** Las comandas activas; si se indica una estación, solo las de esa estación. */
export function listarComandas(idEstacion?: number): Promise<Comanda[]> {
  const consulta = idEstacion === undefined ? "" : `?estacion=${idEstacion}`;
  return pedir<Comanda[]>(`/api/cocina/comandas${consulta}`);
}

export function listarEstacionesDeCocina(): Promise<EstacionConPendientes[]> {
  return pedir<EstacionConPendientes[]>("/api/cocina/estaciones");
}

export function iniciarComanda(
  idComanda: number,
): Promise<{ comanda: Comanda; mensaje: string }> {
  return pedir<{ comanda: Comanda; mensaje: string }>(
    `/api/cocina/comandas/${idComanda}/iniciar`,
    { metodo: "POST" },
  );
}

export function prepararComanda(
  idComanda: number,
): Promise<{ comanda: Comanda; mensaje: string }> {
  return pedir<{ comanda: Comanda; mensaje: string }>(
    `/api/cocina/comandas/${idComanda}/preparar`,
    { metodo: "POST" },
  );
}

/**
 * Los productos activos, disponibles y agotados.
 * Los agotados se devuelven a propósito: la cocina los necesita para reponerlos.
 */
export function listarProductosDeCocina(): Promise<ProductoDeCocina[]> {
  return pedir<ProductoDeCocina[]>("/api/cocina/productos");
}

/**
 * Marca un producto agotado (`false`) o lo repone (`true`).
 * Se manda el estado deseado, no un "cambiar": así dos pantallas no se pelean.
 */
export function cambiarDisponibilidadDeProducto(
  idProducto: number,
  disponible: boolean,
): Promise<{
  producto: { id_producto: number; nombre: string; disponible: boolean };
  mensaje: string;
}> {
  return pedir<{
    producto: { id_producto: number; nombre: string; disponible: boolean };
    mensaje: string;
  }>(`/api/cocina/productos/${idProducto}/disponibilidad`, {
    metodo: "PATCH",
    cuerpo: { disponible },
  });
}
