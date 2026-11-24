/*
  BotonExportarExcel.tsx — botón "Descargar Excel" de cualquier reporte.
  ----------------------------------------------------------------------
*/

import { FileSpreadsheet } from "lucide-react";

import { Boton } from "./Boton";
import type { ColumnaPdf } from "../pdf/exportarPdf";
import { exportarExcel } from "../pdf/exportarExcel";

interface BotonExportarExcelProps {
  titulo: string;
  columnas: readonly ColumnaPdf[];
  filas: readonly (string | number | null)[][];
  nombreArchivo: string;
}

export function BotonExportarExcel({ titulo, columnas, filas, nombreArchivo }: BotonExportarExcelProps) {
  return (
    <Boton
      variante="secundario"
      icono={<FileSpreadsheet size={16} aria-hidden="true" />}
      onClick={() => {
        exportarExcel({
          titulo,
          columnas: columnas.map((c) => c.encabezado),
          filas,
          nombreArchivo,
        });
      }}
    >
      Excel
    </Boton>
  );
}
