/*
  reportes.ts — el catálogo de reportes del sistema (Fase 7 ampliada).
  --------------------------------------------------------------------

  El cliente pide el catálogo y, cuando elige un reporte, pide sus filas y las
  muestra. El servidor se encarga de formatear cada celda como texto listo
  para pintar y para el PDF.
*/

import { pedir } from "./cliente-http";

export interface ReporteDelCatalogo {
  codigo: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  /** true = el reporte usa desde/hasta. */
  necesitaRango: boolean;
}

export interface ColumnaDelReporte {
  /** Encabezado de la columna; el resto de la estructura viene del servidor. */
  encabezado: string;
  alinear: "izquierda" | "derecha";
}

export interface ReporteEjecutado {
  titulo: string;
  /** Línea debajo del título (fechas o criterio del reporte). */
  subtitulo?: string;
  columnas: readonly ColumnaDelReporte[];
  /** Celdas ya formateadas como texto. */
  filas: readonly (string | number | null)[][];
  generadoEn: string;
  nombreArchivo: string;
}

export function listarReportes(): Promise<ReporteDelCatalogo[]> {
  return pedir<ReporteDelCatalogo[]>("/api/reportes");
}

export function ejecutarReporte(
  codigo: string,
  desde?: string,
  hasta?: string,
): Promise<ReporteEjecutado> {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const consulta = params.toString();
  return pedir<ReporteEjecutado>(`/api/reportes/${codigo}${consulta ? `?${consulta}` : ""}`);
}
