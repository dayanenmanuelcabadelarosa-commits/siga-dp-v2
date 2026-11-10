/*
  Selector.tsx — una etiqueta, su lista de opciones y su error, siempre juntos.
  ---------------------------------------------------------------------------

  Es el hermano de `Campo` para los desplegables. La etiqueta está atada con
  `htmlFor`/`id`, el error se enlaza con `aria-describedby` y la casilla se marca
  con `aria-invalid`, igual que en los campos de texto.

  La primera opción vacía ("Elige un rol…") es a propósito: obliga a escoger y
  evita que un formulario cree a alguien con un rol que nadie eligió.
*/

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

export interface OpcionDeSelector {
  valor: string | number;
  texto: string;
}

export interface SelectorProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "id" | "aria-invalid" | "children"
  > {
  etiqueta: string;
  /** Si no se da, se genera uno estable con `useId`. */
  id?: string;
  /** Texto de ayuda, debajo de la casilla. Se oculta si hay error. */
  ayuda?: string;
  /** El mensaje de error. `null` o vacío = no hay error. */
  error?: string | null;
  opciones: readonly OpcionDeSelector[];
  /** La opción vacía del principio. Si no se da, no se dibuja. */
  marcador?: string;
}

export function Selector({
  etiqueta,
  id,
  ayuda,
  error,
  opciones,
  marcador,
  className,
  ...resto
}: SelectorProps) {
  const generado = useId();
  const idCampo = id ?? `selector-${generado.replaceAll(":", "")}`;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;

  const hayError = typeof error === "string" && error !== "";
  const descrito = hayError ? idError : ayuda !== undefined ? idAyuda : undefined;

  return (
    <div>
      <label
        htmlFor={idCampo}
        className="mb-1.5 block text-sm font-medium text-carbon"
      >
        {etiqueta}
      </label>

      <select
        id={idCampo}
        className={[
          "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-carbon pointer-coarse:min-h-12 pointer-coarse:text-base",
          "outline-none transition",
          "focus:border-brasa focus:ring-2 focus:ring-brasa/20",
          "disabled:cursor-not-allowed disabled:bg-crema",
          hayError ? "border-ladrillo" : "border-madera/20",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={hayError || undefined}
        aria-describedby={descrito}
        {...resto}
      >
        {marcador !== undefined && <option value="">{marcador}</option>}

        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>

      {ayuda !== undefined && !hayError && (
        <p id={idAyuda} className="mt-1 text-xs text-madera/70">
          {ayuda}
        </p>
      )}

      {hayError && (
        <p id={idError} role="alert" className="mt-1 text-xs text-ladrillo">
          {error}
        </p>
      )}
    </div>
  );
}
