/*
  ModalConfirmacion.tsx — "¿seguro que quieres hacer esto?".
  ---------------------------------------------------------

  Se usa para las acciones que cambian el acceso de una persona (baja,
  reactivación, desbloqueo). El botón de confirmar se deshabilita y cambia su
  texto mientras el servidor responde, y el error del servidor se muestra dentro
  de la misma ventana, no en un rincón de la pantalla.
*/

import type { ReactNode } from "react";

import { Alerta } from "./Alerta";
import { Boton } from "./Boton";
import { Modal } from "./Modal";

export interface ModalConfirmacionProps {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  /** Pinta el botón de rojo para las acciones destructivas (dar de baja). */
  peligroso?: boolean;
  procesando?: boolean;
  error?: string | null;
  alConfirmar: () => void;
  alCerrar: () => void;
}

export function ModalConfirmacion({
  titulo,
  mensaje,
  textoConfirmar,
  peligroso = false,
  procesando = false,
  error = null,
  alConfirmar,
  alCerrar,
}: ModalConfirmacionProps) {
  return (
    <Modal titulo={titulo} alCerrar={alCerrar} cerrable={!procesando}>
      <div className="space-y-4">
        <div className="text-sm text-carbon">{mensaje}</div>

        {error !== null && <Alerta tipo="error">{error}</Alerta>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton
            variante="secundario"
            onClick={alCerrar}
            disabled={procesando}
          >
            Cancelar
          </Boton>

          <Boton
            variante={peligroso ? "peligro" : "primario"}
            onClick={alConfirmar}
            cargando={procesando}
            textoDeCarga="Procesando…"
          >
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
