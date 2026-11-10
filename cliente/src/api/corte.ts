/*
  corte.ts — las llamadas del módulo Corte de caja (Fase 6, módulo 6).
  --------------------------------------------------------------------
*/

import { pedir } from "./cliente-http";

export interface ResumenDeCorte {
  fecha: string;
  estado: "Abierto" | "Cerrado";
  cerradoEn: string | null;
  cerradoPor: string | null;
  porForma: {
    Efectivo: number;
    Tarjeta: number;
    PayPal: number;
    Crédito: number;
  };
  totalVentas: number;
  totalDescuentos: number;
  comprobantes: number;
  efectivoSistema: number;
  efectivoDeclarado: number | null;
  diferencia: number | null;
}

export function obtenerCorte(): Promise<ResumenDeCorte> {
  return pedir<ResumenDeCorte>("/api/corte");
}

export function cerrarCorte(efectivoDeclarado: string): Promise<{
  id: number;
  resumen: ResumenDeCorte;
  mensaje: string;
}> {
  return pedir<{ id: number; resumen: ResumenDeCorte; mensaje: string }>(
    "/api/corte/cerrar",
    { metodo: "POST", cuerpo: { efectivoDeclarado } },
  );
}
