/*
  exportarPdf.ts — la exportación a PDF de cualquier reporte del sistema.
  ----------------------------------------------------------------------

  Una sola función para todos los reportes: el encabezado, la tabla y el pie
  son los mismos en cada módulo de la app. Al reporte se le pasan las columnas
  y las filas ya formateadas; el módulo se encarga del resto.

  El PDF se genera en el navegador (jsPDF + autotable); no depende del
  servidor ni de servicios externos.
*/

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type AlineacionPdf = "izquierda" | "derecha";
export type FilaPdf = readonly (string | number | null)[];

export interface ColumnaPdf {
  /** Texto del encabezado de la columna. */
  encabezado: string;
  /** Alineación del contenido y del encabezado de la columna. */
  alinear?: AlineacionPdf;
}

export interface OpcionesPdf {
  /** Título del reporte (grande, debajo del logo del restaurante). */
  titulo: string;
  /** Línea debajo del título; típicamente las fechas o el criterio del reporte. */
  subtitulo?: string;
  /** Encabezados y alineación de columnas. */
  columnas: readonly ColumnaPdf[];
  /**
   * Filas del reporte, una por celda y en el mismo orden que las columnas.
   * Lo recomendado es pasar cadenas ya formateadas (por ejemplo con
   * formatearDinero); se aceptan números y `null`.
   */
  filas: readonly FilaPdf[];
  /** Nombre del archivo que baja (sin extensión). */
  nombreArchivo: string;
}

/* Paleta Doña Pula (mismos tonos que Tailwind y la marca). */
const CARBON: [number, number, number] = [27, 24, 24];
const BRASA: [number, number, number] = [196, 92, 39];
const MIEL: [number, number, number] = [217, 164, 65];
const CREMA: [number, number, number] = [251, 247, 239];
const MADERA: [number, number, number] = [107, 78, 52];

const MARGEN = 14;
const ANCHO_PAGINA = 210;
const ALTO_PAGINA = 297;

function textoLimpio(valor: string | number | null): string {
  if (valor === null) return "—";
  return String(valor);
}

function dibujarEncabezado(doc: jsPDF, titulo: string, subtitulo?: string): number {
  /* Franja de la marca. */
  doc.setFillColor(...CARBON);
  doc.rect(0, 0, ANCHO_PAGINA, 26, "F");
  doc.setTextColor(...MIEL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ASADERO DOÑA PULA", MARGEN, 9.5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("Sistema Integrado de Gestión y Atención al Cliente", MARGEN, 17.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...MIEL);
  doc.text("A PURA LEÑA · SANTIAGO, R.D.", MARGEN, 23.5);

  /* Título del reporte. */
  doc.setTextColor(...CARBON);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(titulo, MARGEN, 38);

  /* Cortina naranja bajo el título. */
  doc.setDrawColor(...BRASA);
  doc.setLineWidth(0.8);
  doc.line(MARGEN, 41.5, 70, 41.5);

  let cursor = 47;

  if (subtitulo !== undefined && subtitulo.trim() !== "") {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MADERA);
    doc.text(subtitulo, MARGEN, cursor);
    cursor += 5.5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MADERA);
  doc.text(
    `Generado el ${new Date().toLocaleString("es-DO", {
      dateStyle: "long",
      timeStyle: "short",
    })}`,
    MARGEN,
    cursor,
  );

  return cursor + 4;
}

function pieDePagina(doc: jsPDF): void {
  const total = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setFillColor(...CARBON);
    doc.rect(0, ALTO_PAGINA - 9, ANCHO_PAGINA, 9, "F");
    doc.setTextColor(...MIEL);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      "SIGA-DP · Asadero Doña Pula · documento generado por el sistema",
      MARGEN,
      ALTO_PAGINA - 3.5,
    );
    doc.text(`Página ${pagina} de ${total}`, ANCHO_PAGINA - MARGEN, ALTO_PAGINA - 3.5, {
      align: "right",
    });
  }
}

/**
 * Genera y descarga el PDF de un reporte.
 *
 * Las filas van como cadenas ya formateadas; las columnas se alinean a la
 * derecha cuando `alinear` es "derecha". El nombre del archivo se normaliza
 * para evitar caracteres raros en la descarga.
 */
export function exportarPdf({
  titulo,
  subtitulo,
  columnas,
  filas,
  nombreArchivo,
}: OpcionesPdf): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const anchoDisponible = ANCHO_PAGINA - MARGEN * 2;

  const encabezadoY = dibujarEncabezado(doc, titulo, subtitulo);

  const head = [columnas.map((columna) => columna.encabezado)];
  const body = filas.map((fila) => fila.map(textoLimpio));

  const columnasNumericas = columnas.map((columna, indice) => ({
    indice,
    alinear: columna.alinear ?? "izquierda",
  }));

  const columnStyles: Record<number, { cellWidth: "auto" | number; halign?: "left" | "right" | "center" }> = {};
  for (const { indice, alinear } of columnasNumericas) {
    columnStyles[indice] = {
      cellWidth: "auto",
      halign: alinear === "derecha" ? "right" : "left",
    };
  }

  autoTable(doc, {
    startY: encabezadoY,
    head,
    body,
    theme: "striped",
    margin: { left: MARGEN, right: MARGEN, top: 10, bottom: 14 },
    tableWidth: anchoDisponible,
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: 1.7,
      textColor: CARBON,
      lineColor: [226, 219, 206],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: CARBON,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    alternateRowStyles: { fillColor: CREMA },
    columnStyles,
  });

  if (filas.length === 0) {
    const despuesDeTabla = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? encabezadoY + 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...MADERA);
    doc.text("No hay datos para el rango seleccionado.", MARGEN, despuesDeTabla + 8);
  }

  pieDePagina(doc);

  const nombreLimpio = nombreArchivo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();

  doc.save(`${nombreLimpio || "reporte"}.pdf`);
}
