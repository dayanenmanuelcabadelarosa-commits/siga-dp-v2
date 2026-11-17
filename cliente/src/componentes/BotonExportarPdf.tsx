/*
  BotonExportarPdf.tsx — botón "Exportar PDF" de cualquier reporte.
  ---------------------------------------------------------------------

  Lo único que cambia entre reportes es el título, las columnas y las filas.
*/

import { FileDown } from "lucide-react";

import { Boton } from "./Boton";
import type { ColumnaPdf, FilaPdf } from "../pdf/exportarPdf";
import { exportarPdf } from "../pdf/exportarPdf";

interface BotonExportarPdfProps {
  /** Título grande del reporte en la cabecera del PDF. */
  titulo: string;
  /** Línea debajo del título (fechas, criterio, etc.). */
  subtitulo?: string;
  columnas: readonly ColumnaPdf[];
  filas: readonly FilaPdf[];
  /** Nombre del archivo, sin extensión. */
  nombreArchivo: string;
}

export function BotonExportarPdf({
  titulo,
  subtitulo,
  columnas,
  filas,
  nombreArchivo,
}: BotonExportarPdfProps) {
  return (
    <Boton
      variante="secundario"
      icono={<FileDown size={16} aria-hidden="true" />}
      onClick={() => {
        exportarPdf({ titulo, subtitulo, columnas, filas, nombreArchivo });
      }}
    >
      Exportar PDF
    </Boton>
  );
}
