/*
  ModalClave.tsx — restablecer la clave de una cuenta.
  ---------------------------------------------------

  Es una acción aparte del desbloqueo a propósito: cambiar la clave no vuelve a
  habilitar una cuenta bloqueada. Si la cuenta está bloqueada, la pantalla
  ofrece "Desbloquear" además de "Cambiar clave", y el servidor mantiene las dos
  cosas separadas.

  El ojito para ver lo que se escribe evita el error más común al dictar una
  clave: creer que se escribió una cosa cuando se escribió otra.
*/

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type { EmpleadoDePersonal } from "../../api/personal";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";

export interface ModalClaveProps {
  empleado: EmpleadoDePersonal;
  alCerrar: () => void;
  /** Si el servidor falla, se lanza el error y este formulario lo muestra. */
  alGuardar: (clave: string) => Promise<void>;
}

export function ModalClave({ empleado, alCerrar, alGuardar }: ModalClaveProps) {
  const [clave, setClave] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    if (enviando) return;

    if (clave.length < 8) {
      setError("La clave debe tener al menos 8 caracteres.");
      return;
    }

    setError(null);
    setEnviando(true);

    try {
      await alGuardar(clave);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={`Cambiar la clave de ${empleado.nombre}`}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form
        noValidate
        onSubmit={(evento) => {
          void enviar(evento);
        }}
        className="space-y-4"
      >
        {error !== null && <Alerta tipo="error">{error}</Alerta>}

        <p className="text-sm text-madera">
          La persona tendrá que usar esta clave la próxima vez que entre.
          Cambiarla no desbloquea la cuenta: si está bloqueada, usa
          «Desbloquear» después.
        </p>

        <Campo
          etiqueta="Clave nueva"
          type={mostrar ? "text" : "password"}
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          maxLength={200}
          ayuda="Mínimo 8 caracteres."
          autoComplete="new-password"
          required
          adorno={
            <button
              type="button"
              onClick={() => setMostrar((valor) => !valor)}
              aria-label={mostrar ? "Ocultar la clave" : "Mostrar la clave"}
              className="rounded-lg p-1.5 text-madera transition hover:bg-crema hover:text-carbon focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa"
            >
              {mostrar ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          }
        />

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton
            variante="secundario"
            onClick={alCerrar}
            disabled={enviando}
          >
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Guardando…"
            icono={<KeyRound size={18} aria-hidden="true" />}
          >
            Guardar clave
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
