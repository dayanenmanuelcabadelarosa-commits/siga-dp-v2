/*
  Pestanas.tsx — la fila de filtros tipo píldora.
  ----------------------------------------------
  No es una pestaña de verdad (no cambia de panel): es un filtro. Por eso usa
  `aria-pressed` y no el papel de "tab", que prometería algo que no hace.
*/

export interface OpcionDePestana {
  valor: string;
  texto: string;
}

export interface PestanasProps {
  opciones: readonly OpcionDePestana[];
  activa: string;
  alCambiar: (valor: string) => void;
  /** Lo que anuncia el lector de pantalla para el grupo de filtros. */
  etiqueta: string;
}

export function Pestanas({
  opciones,
  activa,
  alCambiar,
  etiqueta,
}: PestanasProps) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {opciones.map((opcion) => {
        const estaActiva = opcion.valor === activa;
        const estilo = estaActiva
          ? "bg-carbon text-white"
          : "border border-madera/15 bg-white text-madera hover:border-brasa/40 hover:text-brasa";

        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={estaActiva}
            onClick={() => alCambiar(opcion.valor)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa ${estilo}`}
          >
            {opcion.texto}
          </button>
        );
      })}
    </div>
  );
}
