/*
  integraciones.ts — el diagnóstico de las APIs externas (Fase 8).
  ---------------------------------------------------------------

  Dice qué está listo y qué falta en cada integración, sin cobrar nada ni
  gastar tokens.
*/

import { pedir } from "./cliente-http";

export interface EstadoDeIntegracion {
  nombre: string;
  listo: boolean;
  url: string;
  mensaje: string;
}

export function obtenerEstadoDeIntegraciones(): Promise<EstadoDeIntegracion[]> {
  return pedir<EstadoDeIntegracion[]>("/api/integraciones/estado");
}
