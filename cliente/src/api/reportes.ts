/*
  reportes.ts — las llamadas del módulo Reportes (Fase 7).
  ---------------------------------------------------------
*/

import { pedir } from "./cliente-http";

export interface VentaDelDia {
  fecha: string;
  efectivo: number;
  tarjeta: number;
  paypal: number;
  credito: number;
  total: number;
  descuentos: number;
  pagos: number;
}

export interface PropinaReporte {
  empleado: string;
  fecha: string;
  cantidad: number;
  total: number;
}

export interface InsumoBajoMinimo {
  nombre: string;
  minimo: number;
  existencia: number;
  punto: string;
  faltante: number;
}

export interface ProductoAgotado {
  idProducto: number;
  nombre: string;
  categoria: string;
  estacion: string;
  precio: number;
  horas: number | null;
}

export function reporteVentas(desde?: string, hasta?: string): Promise<VentaDelDia[]> {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const consulta = params.toString();
  return pedir<VentaDelDia[]>(`/api/reportes/ventas${consulta ? `?${consulta}` : ""}`);
}

export function reportePropinas(desde?: string, hasta?: string): Promise<PropinaReporte[]> {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const consulta = params.toString();
  return pedir<PropinaReporte[]>(`/api/reportes/propinas${consulta ? `?${consulta}` : ""}`);
}

export function reporteInventario(): Promise<InsumoBajoMinimo[]> {
  return pedir<InsumoBajoMinimo[]>("/api/reportes/inventario");
}

export function reporteAgotados(): Promise<ProductoAgotado[]> {
  return pedir<ProductoAgotado[]>("/api/reportes/agotados");
}
