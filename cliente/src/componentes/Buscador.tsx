/*
  Buscador.tsx — el campo de búsqueda de las listas.
  -------------------------------------------------
  La lupa es un adorno; la etiqueta para el lector de pantalla está oculta a la
  vista pero presente. Así el campo se anuncia como "Buscar producto" y no como
  un cuadro sin nombre.
*/

import { Search } from "lucide-react";
import { useId } from "react";

export interface BuscadorProps {
  valor: string;
  alCambiar: (texto: string) => void;
  /** Lo que anuncia el lector de pantalla. */
  etiqueta: string;
  marcador?: string;
}

export function Buscador({
  valor,
  alCambiar,
  etiqueta,
  marcador = "Buscar…",
}: BuscadorProps) {
  const generado = useId();
  const id = `buscador-${generado.replaceAll(":", "")}`;

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>

      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-madera/50"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          placeholder={marcador}
          className="w-full rounded-xl border border-madera/20 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brasa focus:ring-2 focus:ring-brasa/20"
        />
      </div>
    </div>
  );
}
