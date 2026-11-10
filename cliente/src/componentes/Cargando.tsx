/*
  Cargando.tsx — "espérate, esto todavía no llegó".
  ------------------------------------------------

  Se anuncia como `role="status"`, para que quien usa un lector de pantalla sepa
  que el sistema está trabajando y no se quedó congelado.

  Nunca se pone un "cargando" que dure para siempre: si la petición falla, la
  pantalla muestra el error. Un cargando eterno es peor que un error, porque no
  dice qué hacer.
*/

import { Loader2 } from "lucide-react";

export interface CargandoProps {
  texto?: string;
  /** Centrado en toda la pantalla. Para el arranque de la aplicación. */
  pantallaCompleta?: boolean;
}

export function Cargando({
  texto = "Cargando…",
  pantallaCompleta = false,
}: CargandoProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        pantallaCompleta
          ? "flex min-h-screen items-center justify-center gap-2 bg-crema p-6 text-madera"
          : "flex items-center justify-center gap-2 p-6 text-sm text-madera"
      }
    >
      <Loader2 size={18} className="animate-spin text-brasa" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
