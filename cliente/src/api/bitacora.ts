/*
  bitacora.ts — las llamadas del módulo Bitácora (Fase 7).
  -----------------------------------------------------------
*/

import { pedir } from "./cliente-http";

export interface RegistroDeBitacora {
  id: number;
  ocurridoEn: string;
  cuando: string;
  usuario: string | null;
  accion: string;
  detalle: string;
  tabla: string | null;
  registro: string | null;
}

export interface FiltrosDeBitacora {
  desde?: string;
  hasta?: string;
  accion?: string;
  tabla?: string;
  limite?: number;
}

export function listarBitacora(
  filtros: FiltrosDeBitacora = {},
): Promise<RegistroDeBitacora[]> {
  const params = new URLSearchParams();

  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.accion) params.set("accion", filtros.accion);
  if (filtros.tabla) params.set("tabla", filtros.tabla);
  if (filtros.limite) params.set("limite", String(filtros.limite));

  const consulta = params.toString();

  return pedir<RegistroDeBitacora[]>(
    `/api/bitacora${consulta ? `?${consulta}` : ""}`,
  );
}
