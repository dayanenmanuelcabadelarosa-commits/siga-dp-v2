/*
  Campo.tsx — una etiqueta, su casilla y su error, siempre juntos.
  ---------------------------------------------------------------

  La etiqueta está atada a la casilla con `htmlFor`/`id`, así que se puede pulsar
  la etiqueta para escribir y el lector de pantalla anuncia qué campo es.

  Cuando hay un error, la casilla queda marcada con `aria-invalid` y el mensaje
  se enlaza con `aria-describedby`: quien no ve la pantalla también se entera de
  qué pasó (regla de oro 7).
*/

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface CampoProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-invalid"> {
  etiqueta: string;
  /** Si no se da, se genera uno estable con `useId`. */
  id?: string;
  /** Texto de ayuda, debajo de la casilla. Se oculta si hay error. */
  ayuda?: string;
  /** El mensaje de error. `null` o vacío = no hay error. */
  error?: string | null;
  /** Algo a la derecha dentro de la casilla (por ejemplo, el ojo de la clave). */
  adorno?: ReactNode;
}

export function Campo({
  etiqueta,
  id,
  ayuda,
  error,
  adorno,
  className,
  ...resto
}: CampoProps) {
  const generado = useId();
  const idCampo = id ?? `campo-${generado.replaceAll(":", "")}`;
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

      <div className="relative">
        <input
          id={idCampo}
          className={[
            "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-carbon pointer-coarse:min-h-12 pointer-coarse:text-base",
            "outline-none transition placeholder:text-madera/40",
            "focus:border-brasa focus:ring-2 focus:ring-brasa/20",
            "disabled:cursor-not-allowed disabled:bg-crema",
            hayError ? "border-ladrillo" : "border-madera/20",
            adorno !== undefined ? "pr-10" : "",
            className ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={hayError || undefined}
          aria-describedby={descrito}
          {...resto}
        />

        {adorno !== undefined && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {adorno}
          </div>
        )}
      </div>

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
