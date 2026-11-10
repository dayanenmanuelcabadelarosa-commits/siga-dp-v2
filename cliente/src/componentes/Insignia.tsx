/*
  Insignia.tsx — una etiqueta corta para un estado.
  -------------------------------------------------

  Sirve para "Fase 4", "Activo", "Ocupada"… El color nunca es la única señal:
  el texto dice qué es.
*/

export type ColorDeInsignia =
  | "verde"
  | "brasa"
  | "miel"
  | "pizarra"
  | "rojo"
  | "gris";

export interface InsigniaProps {
  texto: string;
  color?: ColorDeInsignia;
}

const COLORES: Record<ColorDeInsignia, string> = {
  verde: "bg-hoja/15 text-hoja",
  brasa: "bg-brasa/15 text-brasa",
  miel: "bg-miel/20 text-madera",
  pizarra: "bg-pizarra/15 text-pizarra",
  rojo: "bg-ladrillo/15 text-ladrillo",
  gris: "bg-carbon/10 text-carbon/70",
};

export function Insignia({ texto, color = "gris" }: InsigniaProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORES[color]}`}
    >
      {texto}
    </span>
  );
}
