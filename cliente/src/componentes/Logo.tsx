/*
  Logo.tsx — el logo del Asadero Doña Pula.
  ----------------------------------------

  Usa la imagen real del negocio. Si el archivo no estuviera, cae en un círculo
  con las iniciales "DP": así una imagen que falta no deja un hueco roto en la
  pantalla, y se nota que es el logo y no un error de carga.
*/

import { useState } from "react";

export interface LogoProps {
  /** Ancho y alto, en píxeles. */
  tamano?: number;
}

export function Logo({ tamano = 48 }: LogoProps) {
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <span
        aria-hidden="true"
        style={{ width: tamano, height: tamano }}
        className="flex shrink-0 items-center justify-center rounded-full bg-brasa text-sm font-bold text-white"
      >
        DP
      </span>
    );
  }

  return (
    <img
      src="/imagenes/logo-dona-pula.png"
      alt="Logo del Asadero Doña Pula"
      width={tamano}
      height={tamano}
      className="shrink-0 rounded-full bg-white object-contain"
      onError={() => {
        setFallo(true);
      }}
    />
  );
}
