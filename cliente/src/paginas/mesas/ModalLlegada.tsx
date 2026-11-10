/*
  ModalLlegada.tsx — registrar que un grupo llegó a su mesa.
  --------------------------------------------------------

  El anfitrión elige cuántas personas llegaron. La mesa pasa a ocupada y la base
  guarda la hora de llegada; de ahí sale el reloj que verá el mesero. La
  validación de este lado evita un viaje inútil, pero la de verdad es la del
  servidor (capacidad y estado de la mesa).
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type { Mesa } from "../../api/mesas";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";

export interface ModalLlegadaProps {
  mesa: Mesa;
  alCerrar: () => void;
  /** La página hace la llamada y refresca el mapa. */
  alOcupar: (personas: number) => Promise<void>;
}

export function ModalLlegada({ mesa, alCerrar, alOcupar }: ModalLlegadaProps) {
  const [personas, setPersonas] = useState(String(mesa.personas ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): number | null {
    const cantidad = Number(personas);

    if (personas.trim() === "") {
      setError("Escribe cuántas personas llegaron.");
      return null;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError("La cantidad de personas debe ser un número entero mayor que cero.");
      return null;
    }

    if (cantidad > mesa.capacidad) {
      setError(
        `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas.`,
      );
      return null;
    }

    setError(null);
    return cantidad;
  }

  async function guardar(): Promise<void> {
    const cantidad = validar();
    if (cantidad === null) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      await alOcupar(cantidad);
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void guardar();
  }

  return (
    <Modal
      titulo={`Llegada a la mesa ${mesa.numero}`}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        <p className="text-sm text-madera">
          {mesa.zona} · capacidad para {mesa.capacidad}{" "}
          {mesa.capacidad === 1 ? "persona" : "personas"}
        </p>

        {errorDelServidor !== null && (
          <Alerta tipo="error">{errorDelServidor}</Alerta>
        )}

        <Campo
          etiqueta="Personas que llegaron"
          type="number"
          min={1}
          max={mesa.capacidad}
          inputMode="numeric"
          value={personas}
          onChange={(evento) => setPersonas(evento.target.value)}
          error={error}
          ayuda="La mesa queda ocupada y empieza el reloj de servicio."
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Ocupando…"
            icono={<Save size={16} aria-hidden="true" />}
          >
            Ocupar mesa
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
