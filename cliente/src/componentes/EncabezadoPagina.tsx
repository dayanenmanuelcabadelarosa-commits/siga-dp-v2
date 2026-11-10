/*
  EncabezadoPagina.tsx — el título de cada pantalla, siempre igual.
  ---------------------------------------------------------------

  Un rótulo pequeño arriba (la sección), el título grande y una línea que
  explica qué se hace ahí. A la derecha, si hace falta, las acciones.
*/

import type { ReactNode } from "react";

export interface EncabezadoPaginaProps {
  titulo: string;
  subtitulo?: string;
  /** Rótulo pequeño encima del título. */
  codigo?: string;
  acciones?: ReactNode;
}

export function EncabezadoPagina({
  titulo,
  subtitulo,
  codigo,
  acciones,
}: EncabezadoPaginaProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {codigo !== undefined && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brasa">
            {codigo}
          </p>
        )}
        <h1 className="text-2xl font-semibold sm:text-3xl">{titulo}</h1>
        {subtitulo !== undefined && (
          <p className="mt-1 text-sm text-madera">{subtitulo}</p>
        )}
      </div>

      {acciones !== undefined && (
        <div className="flex flex-wrap gap-2">{acciones}</div>
      )}
    </div>
  );
}
