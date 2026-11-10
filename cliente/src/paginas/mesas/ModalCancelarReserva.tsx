/*
  ModalCancelarReserva.tsx — cancelar una reserva sin perder el rastro.
  -------------------------------------------------------------------

  La base exige un motivo para una reserva cancelada. No se borra nada: la
  reserva queda en la agenda con su estado y su motivo, para que el negocio
  pueda revisar después qué pasó.
*/

import { Ban } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type { Reserva } from "../../api/mesas";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { formatearFecha } from "../../utilidades/fecha";

export interface ModalCancelarReservaProps {
  reserva: Reserva;
  alCerrar: () => void;
  alCancelar: (motivo: string) => Promise<void>;
}

export function ModalCancelarReserva({
  reserva,
  alCerrar,
  alCancelar,
}: ModalCancelarReservaProps) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): string | null {
    const limpio = motivo.trim();

    if (limpio === "") {
      setError("Escribe el motivo de la cancelación.");
      return null;
    }

    if (limpio.length > 160) {
      setError("El motivo no puede pasar de 160 caracteres.");
      return null;
    }

    setError(null);
    return limpio;
  }

  async function cancelar(): Promise<void> {
    const limpio = validar();
    if (limpio === null) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      await alCancelar(limpio);
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void cancelar();
  }

  return (
    <Modal
      titulo={`Cancelar la reserva de ${reserva.nombre_cliente}`}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        <div className="rounded-xl bg-crema px-3 py-2 text-sm text-madera">
          <p>
            Mesa {reserva.mesa_numero} · {reserva.zona} · {reserva.personas}{" "}
            {reserva.personas === 1 ? "persona" : "personas"}
          </p>
          <p className="mt-1">
            {formatearFecha(reserva.fecha)} a las {reserva.hora}
          </p>
        </div>

        <p className="text-sm text-carbon">
          La reserva quedará cancelada y seguirá en la agenda con su motivo. No
          se borra.
        </p>

        {errorDelServidor !== null && (
          <Alerta tipo="error">{errorDelServidor}</Alerta>
        )}

        <Campo
          etiqueta="Motivo de la cancelación"
          value={motivo}
          maxLength={160}
          onChange={(evento) => setMotivo(evento.target.value)}
          error={error}
          ayuda="Por ejemplo: el cliente avisó que no puede llegar."
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            Volver
          </Boton>

          <Boton
            tipo="submit"
            variante="peligro"
            cargando={enviando}
            textoDeCarga="Cancelando…"
            icono={<Ban size={16} aria-hidden="true" />}
          >
            Cancelar reserva
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
