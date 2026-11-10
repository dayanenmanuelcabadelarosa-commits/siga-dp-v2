/*
  Modal.tsx — la ventana que se abre encima de la pantalla.
  -------------------------------------------------------

  Detalles que no son adorno:

    · Tiene `role="dialog"` y `aria-modal`, y el título está enlazado con
      `aria-labelledby`, para que un lector de pantalla anuncie qué se abrió.
    · Al abrir, el foco entra en la ventana; al cerrar, vuelve al botón que la
      abrió. Así no se pierde el sitio con el teclado.
    · Tab y Shift+Tab dan vueltas dentro de la ventana: el foco no se escapa al
      fondo mientras hay un formulario abierto.
    · Escape cierra, salvo cuando hay algo guardándose (`cerrable={false}`).
    · Mientras está abierta, el fondo no hace scroll.
*/

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { X } from "lucide-react";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  /** `normal` para formularios cortos; `ancho` para tablas o contenido largo. */
  ancho?: "normal" | "ancho";
  /** Mientras se guarda, la ventana no se puede cerrar ni con Escape. */
  cerrable?: boolean;
}

export function Modal({
  titulo,
  alCerrar,
  children,
  ancho = "normal",
  cerrable = true,
}: ModalProps) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const campos = caja.current?.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );

    const primero =
      campos !== undefined && campos.length > 0
        ? campos[0]
        : caja.current?.querySelector<HTMLElement>("button:not([disabled])");

    (primero ?? caja.current)?.focus();

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowAnterior;
      focoAnterior.current?.focus();
    };
  }, []);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === "Escape") {
      if (!cerrable) return;

      evento.stopPropagation();
      alCerrar();
      return;
    }

    if (evento.key !== "Tab") return;

    const enfocables = Array.from(
      caja.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [],
    );

    if (enfocables.length === 0) return;

    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo?.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/60 p-3 sm:items-center sm:p-6"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && cerrable) alCerrar();
      }}
    >
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={alTeclear}
        className={`max-h-[92vh] w-full ${
          ancho === "ancho" ? "max-w-2xl" : "max-w-lg"
        } overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-madera/10 px-5 py-4">
          <h2 id={idTitulo} className="text-lg font-semibold text-carbon">
            {titulo}
          </h2>

          {cerrable && (
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-madera transition hover:bg-crema hover:text-carbon focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
