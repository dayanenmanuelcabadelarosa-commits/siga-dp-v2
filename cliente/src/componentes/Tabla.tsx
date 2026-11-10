/*
  Tabla.tsx — la tabla del sistema.
  --------------------------------

  Una sola tabla para todas las pantallas, para que todas se lean igual y para
  no repetir el mismo HTML en cada módulo.

  Detalles que importan:

    · Lleva `<caption>` (oculto a la vista, pero presente): quien usa un lector
      de pantalla oye de qué es la tabla antes de las celdas.
    · Los encabezados son `<th scope="col">`, y cada fila se identifica con su
      clave, no con el índice.
    · Tiene estados de "cargando" y "no hay nada". Una tabla vacía sin
      explicación parece un error.
*/

import type { ReactNode } from "react";

import { Cargando } from "./Cargando";

export interface Columna<T> {
  /** Identificador de la columna. No se muestra. */
  clave: string;
  /** El texto del encabezado. */
  encabezado: string;
  /** Cómo se dibuja el valor de esta columna para una fila. */
  render: (fila: T) => ReactNode;
  alinear?: "izquierda" | "derecha";
}

export interface TablaProps<T> {
  /** Para el `<caption>` y para los lectores de pantalla. */
  titulo: string;
  columnas: readonly Columna<T>[];
  filas: readonly T[];
  /** Algo estable por fila (un id). No se usa el índice. */
  claveDeFila: (fila: T) => string | number;
  /** Qué decir cuando no hay filas. */
  vacio?: string;
  cargando?: boolean;
}

export function Tabla<T>({
  titulo,
  columnas,
  filas,
  claveDeFila,
  vacio = "No hay nada que mostrar todavía.",
  cargando = false,
}: TablaProps<T>) {
  const alineacion = (columna: Columna<T>) =>
    columna.alinear === "derecha" ? "text-right" : "text-left";

  return (
    <div className="overflow-x-auto rounded-2xl border border-madera/10 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-madera/10 text-sm">
        <caption className="sr-only">{titulo}</caption>

        <thead className="bg-crema/60">
          <tr>
            {columnas.map((columna) => (
              <th
                key={columna.clave}
                scope="col"
                className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-madera ${alineacion(columna)}`}
              >
                {columna.encabezado}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-madera/5">
          {cargando ? (
            <tr>
              <td colSpan={columnas.length}>
                <Cargando texto="Cargando los datos…" />
              </td>
            </tr>
          ) : filas.length === 0 ? (
            <tr>
              <td
                colSpan={columnas.length}
                className="px-4 py-8 text-center text-sm text-madera"
              >
                {vacio}
              </td>
            </tr>
          ) : (
            filas.map((fila) => (
              <tr key={claveDeFila(fila)} className="hover:bg-crema/50">
                {columnas.map((columna) => (
                  <td
                    key={columna.clave}
                    className={`px-4 py-3 text-carbon ${alineacion(columna)}`}
                  >
                    {columna.render(fila)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
