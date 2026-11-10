/*
  ofertas.ts — las llamadas del módulo Descuentos y ofertas (Fase 8).
  -----------------------------------------------------------------------
*/

import { pedir } from "./cliente-http";

export type TipoDeOferta = "Porcentaje" | "Monto";

export interface Oferta {
  id: number;
  nombre: string;
  descripcion: string;
  tipoValor: TipoDeOferta | null;
  valor: number | null;
  activo: boolean;
  /** Fechas de vigencia, en formato AAAA-MM-DD. */
  fechaInicio: string | null;
  fechaFin: string | null;
}

export interface DatosParaOferta {
  nombre: string;
  descripcion?: string;
  tipoValor: TipoDeOferta;
  valor: number;
  fechaInicio: string;
  fechaFin: string;
}

export function listarOfertas(): Promise<Oferta[]> {
  return pedir<Oferta[]>("/api/ofertas");
}

/** Las ofertas activas: las que el cajero puede aplicar al cobrar. */
export function listarOfertasActivas(): Promise<Oferta[]> {
  return pedir<Oferta[]>("/api/ofertas/activas");
}

export function crearOferta(datos: DatosParaOferta): Promise<Oferta> {
  return pedir<Oferta>("/api/ofertas", { metodo: "POST", cuerpo: datos });
}

export function editarOferta(
  id: number,
  cambios: Partial<DatosParaOferta>,
): Promise<Oferta> {
  return pedir<Oferta>(`/api/ofertas/${id}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function activarOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`/api/ofertas/${id}/activar`, { metodo: "POST" });
}

export function desactivarOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`/api/ofertas/${id}/desactivar`, { metodo: "POST" });
}
