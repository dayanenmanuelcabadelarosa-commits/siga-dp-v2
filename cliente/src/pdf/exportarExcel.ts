/*
  exportarExcel.ts — descarga de las filas de cualquier reporte como Excel.
  ------------------------------------------------------------------------

  Utiliza el formato de tabla de HTML interpretado por Excel (compatibilidad
  nativa): un bloque HTML con <table>, <thead> y <tbody> de un archivo .xlsx.
  Los valores están ya formateados como texto por el catálogo, así que en la
  hoja aparecen exactamente iguales a los de la pantalla.
*/

export interface ParametrosExcel {
  titulo: string;
  columnas: readonly string[];
  filas: readonly (string | number | null)[][];
  nombreArchivo: string;
}

function escaparCsv(texto: string): string {
  if (/["\n\r,;]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function generarTablaHtml(titulo: string, columnas: readonly string[], filas: readonly (string | number | null)[][]) {
  const celda = (valor: string | number | null) =>
    `<td style="border:1px solid #ccc;padding:2px 6px;">${String(valor ?? "")}</td>`;

  const encabezado = columnas.map((c) => `<th style="border:1px solid #ccc;padding:2px 6px;text-align:left;">${escaparCsv(c)}</th>`).join("");
  const cuerpo = filas
    .map((fila) => `<tr>${fila.map((v) => celda(v)).join("")}</tr>`)
    .join("");

  return `<html><head><meta charset="UTF-8"><title>${escaparCsv(titulo)}</title></head><body><table>${encabezado}${cuerpo}</table></body></html>`;
}

export function exportarExcel(parametros: ParametrosExcel): void {
  const html = generarTablaHtml(parametros.titulo, parametros.columnas, parametros.filas);
  const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel;charset=UTF-8" }));

  const link = document.createElement("a");
  link.href = url;
  link.download = `${parametros.nombreArchivo || "reporte"}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
