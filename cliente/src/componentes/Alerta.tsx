/*
  Alerta.tsx — un mensaje que la persona no puede dejar de ver.
  ------------------------------------------------------------

  Se usa para las tres cosas que el plan pide: error, éxito y aviso.

  El tipo decide cómo lo anuncia el lector de pantalla:

    · `error`  → `role="alert"`, se interrumpe lo que se estaba leyendo. Un
                 error no puede pasar desapercibido.
    · el resto → `role="status"`, se lee cuando el lector termina la frase en
                 curso. Un "guardado" no tiene por qué interrumpir.

  Y el color nunca va solo: cada tipo lleva su icono y su texto. Quien no
  distingue colores tiene que poder enterarse igual.
*/

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type TipoDeAlerta = "error" | "exito" | "aviso" | "info";

export interface AlertaProps {
  tipo?: TipoDeAlerta;
  /** Un título corto, opcional, encima del mensaje. */
  titulo?: string;
  children: ReactNode;
}

const ESTILOS: Record<
  TipoDeAlerta,
  { caja: string; icono: typeof Info }
> = {
  error: {
    caja: "border-ladrillo/30 bg-ladrillo/10 text-ladrillo",
    icono: XCircle,
  },
  exito: {
    caja: "border-hoja/30 bg-hoja/10 text-hoja",
    icono: CheckCircle2,
  },
  aviso: {
    caja: "border-miel/40 bg-miel/15 text-madera",
    icono: AlertTriangle,
  },
  info: {
    caja: "border-pizarra/30 bg-pizarra/10 text-pizarra",
    icono: Info,
  },
};

export function Alerta({ tipo = "info", titulo, children }: AlertaProps) {
  const estilo = ESTILOS[tipo];
  const Icono = estilo.icono;

  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      aria-live={tipo === "error" ? "assertive" : "polite"}
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${estilo.caja}`}
    >
      <Icono size={20} className="mt-0.5 shrink-0" aria-hidden="true" />

      <div className="min-w-0">
        {titulo !== undefined && <p className="font-semibold">{titulo}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
