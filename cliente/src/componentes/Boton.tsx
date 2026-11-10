/*
  Boton.tsx — el botón del sistema.
  --------------------------------

  Dos cosas que no son adorno:

    · Mientras algo se está guardando, el botón se deshabilita y lo dice. Eso es
      lo que evita que alguien pulse dos veces y se registre la venta dos veces
      (está en la definición de "terminado" del plan).
    · El texto de "guardando" se anuncia a los lectores de pantalla con
      `aria-busy`, no solo con el dibujo del círculo girando.
*/

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteDeBoton = "primario" | "secundario" | "peligro" | "texto";

export interface BotonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** `button` por defecto: un botón dentro de un formulario no debe enviarlo sin querer. */
  tipo?: "button" | "submit" | "reset";
  variante?: VarianteDeBoton;
  /** Mientras es `true`: se deshabilita, gira el círculo y cambia el texto. */
  cargando?: boolean;
  /** Lo que dice mientras carga. Si no se da, se usa el texto normal. */
  textoDeCarga?: string;
  anchoCompleto?: boolean;
  /** Un icono a la izquierda (por ejemplo, de `lucide-react`). */
  icono?: ReactNode;
  children: ReactNode;
}

const CLASES_POR_VARIANTE: Record<VarianteDeBoton, string> = {
  primario: "bg-brasa text-white shadow-sm hover:bg-ladrillo",
  secundario:
    "border border-madera/25 bg-white text-carbon shadow-sm hover:bg-crema",
  peligro: "bg-ladrillo text-white shadow-sm hover:bg-red-900",
  texto: "bg-transparent text-madera hover:bg-madera/10",
};

export function Boton({
  tipo = "button",
  variante = "primario",
  cargando = false,
  textoDeCarga,
  anchoCompleto = false,
  icono,
  disabled,
  className,
  children,
  ...resto
}: BotonProps) {
  const clases = [
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium pointer-coarse:min-h-12 pointer-coarse:text-base",
    "transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    CLASES_POR_VARIANTE[variante],
    anchoCompleto ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={tipo}
      className={clases}
      disabled={disabled === true || cargando}
      aria-busy={cargando}
      {...resto}
    >
      {cargando ? (
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      ) : (
        icono
      )}
      <span className="whitespace-nowrap">
        {cargando ? (textoDeCarga ?? children) : children}
      </span>
    </button>
  );
}
