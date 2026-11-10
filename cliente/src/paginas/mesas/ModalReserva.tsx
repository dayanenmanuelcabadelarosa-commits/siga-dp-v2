/*
  ModalReserva.tsx — el formulario para crear o editar una reserva.
  ----------------------------------------------------------------

  Una reserva es una promesa: todavía no ocupa la mesa. La mesa se ocupa cuando
  el anfitrión usa "Abrir reserva", que es una acción aparte y pide confirmación.

  La fecha y la hora viajan como texto para no cruzar zonas horarias. La
  capacidad se revisa aquí para avisar pronto, pero el servidor vuelve a
  revisarla junto con los choques de horario (RN-20 y RN-21).
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type { DatosParaReserva, Mesa, Reserva } from "../../api/mesas";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export type DatosDelFormularioReserva =
  | { modo: "crear"; datos: DatosParaReserva }
  | { modo: "editar"; datos: DatosParaReserva };

export interface ModalReservaProps {
  /** `null` para crear; una reserva pendiente para editar. */
  reserva: Reserva | null;
  mesas: readonly Mesa[];
  fechaInicial: string;
  alCerrar: () => void;
  /** La página hace la llamada y refresca la agenda. */
  alGuardar: (entrada: DatosDelFormularioReserva) => Promise<void>;
}

interface ErroresDelFormulario {
  fecha?: string;
  hora?: string;
  nombre_cliente?: string;
  telefono?: string;
  personas?: string;
  id_mesa?: string;
}

const TELEFONO_VALIDO = /^[0-9+()\-\s]{7,20}$/;

export function ModalReserva({
  reserva,
  mesas,
  fechaInicial,
  alCerrar,
  alGuardar,
}: ModalReservaProps) {
  const [fecha, setFecha] = useState(reserva?.fecha ?? fechaInicial);
  const [hora, setHora] = useState(reserva?.hora ?? "");
  const [nombreCliente, setNombreCliente] = useState(
    reserva?.nombre_cliente ?? "",
  );
  const [telefono, setTelefono] = useState(reserva?.telefono ?? "");
  const [personas, setPersonas] = useState(
    reserva === null ? "" : String(reserva.personas),
  );
  const [idMesa, setIdMesa] = useState(
    reserva === null ? "" : String(reserva.id_mesa),
  );
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const mesasDisponibles = mesas.filter(
    (mesa) =>
      mesa.zona_activa || (reserva !== null && mesa.id_mesa === reserva.id_mesa),
  );

  const mesaElegida = mesasDisponibles.find(
    (mesa) => String(mesa.id_mesa) === idMesa,
  );

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const nombreLimpio = nombreCliente.trim();
    const telefonoLimpio = telefono.trim();
    const cantidad = Number(personas);

    if (fecha.trim() === "") {
      nuevos.fecha = "Elige la fecha de la reserva.";
    }

    if (hora.trim() === "") {
      nuevos.hora = "Elige la hora de la reserva.";
    }

    if (nombreLimpio === "") {
      nuevos.nombre_cliente = "Escribe el nombre del cliente.";
    } else if (nombreLimpio.length > 80) {
      nuevos.nombre_cliente =
        "El nombre del cliente no puede pasar de 80 caracteres.";
    }

    if (telefonoLimpio === "") {
      nuevos.telefono = "Escribe el teléfono.";
    } else if (!TELEFONO_VALIDO.test(telefonoLimpio)) {
      nuevos.telefono =
        "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).";
    }

    if (personas.trim() === "") {
      nuevos.personas = "Escribe cuántas personas llegan.";
    } else if (!Number.isInteger(cantidad) || cantidad <= 0) {
      nuevos.personas =
        "La cantidad de personas debe ser un número entero mayor que cero.";
    } else if (mesaElegida !== undefined && cantidad > mesaElegida.capacidad) {
      nuevos.personas = `La mesa ${mesaElegida.numero} tiene capacidad para ${mesaElegida.capacidad} personas.`;
    }

    if (idMesa === "") {
      nuevos.id_mesa = "Elige una mesa.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function guardar(): Promise<void> {
    if (!validar()) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      const datos: DatosParaReserva = {
        fecha: fecha.trim(),
        hora: hora.trim(),
        nombre_cliente: nombreCliente.trim(),
        telefono: telefono.trim(),
        personas: Number(personas),
        id_mesa: Number(idMesa),
      };

      await alGuardar({
        modo: reserva === null ? "crear" : "editar",
        datos,
      });
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
      titulo={reserva === null ? "Nueva reserva" : "Editar reserva"}
      alCerrar={alCerrar}
      cerrable={!enviando}
      ancho="ancho"
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {mesasDisponibles.length === 0 && (
          <Alerta tipo="aviso">
            No hay mesas en zonas activas. Primero crea una zona y una mesa.
          </Alerta>
        )}

        {errorDelServidor !== null && (
          <Alerta tipo="error">{errorDelServidor}</Alerta>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Fecha"
            type="date"
            value={fecha}
            onChange={(evento) => setFecha(evento.target.value)}
            error={errores.fecha}
          />

          <Campo
            etiqueta="Hora"
            type="time"
            value={hora}
            onChange={(evento) => setHora(evento.target.value)}
            error={errores.hora}
          />
        </div>

        <Campo
          etiqueta="Nombre del cliente"
          value={nombreCliente}
          onChange={(evento) => setNombreCliente(evento.target.value)}
          error={errores.nombre_cliente}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Teléfono"
            type="tel"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            error={errores.telefono}
          />

          <Campo
            etiqueta="Personas"
            type="number"
            min={1}
            max={mesaElegida?.capacidad}
            inputMode="numeric"
            value={personas}
            onChange={(evento) => setPersonas(evento.target.value)}
            error={errores.personas}
          />
        </div>

        <Selector
          etiqueta="Mesa"
          value={idMesa}
          onChange={(evento) => setIdMesa(evento.target.value)}
          opciones={mesasDisponibles.map((mesa) => ({
            valor: mesa.id_mesa,
            texto: `Mesa ${mesa.numero} · ${mesa.zona} · ${mesa.capacidad} ${
              mesa.capacidad === 1 ? "persona" : "personas"
            }`,
          }))}
          marcador="Elige una mesa…"
          error={errores.id_mesa}
          ayuda="La mesa no se ocupa hasta que uses Abrir reserva."
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Guardando…"
            icono={<Save size={16} aria-hidden="true" />}
            disabled={mesasDisponibles.length === 0}
          >
            {reserva === null ? "Crear reserva" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
