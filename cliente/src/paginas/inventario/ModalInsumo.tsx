/*
  ModalInsumo.tsx — el formulario para crear o editar un insumo.
  -------------------------------------------------------------

  El mínimo es la cantidad a partir de la cual el sistema avisa que hay que
  reponer. Puede ser cero.

  La unidad solo se puede cambiar mientras el insumo no tenga movimientos: si ya
  los tiene, cambiar "libra" por "kilo" reinterpretaría el historial. El servidor
  lo impide y aquí se explica antes de guardar.
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type {
  CambiosDeInsumo,
  DatosParaInsumo,
  Insumo,
  UnidadDeMedida,
} from "../../api/inventario";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export type DatosDelFormularioInsumo =
  | { modo: "crear"; datos: DatosParaInsumo }
  | { modo: "editar"; datos: CambiosDeInsumo };

export interface ModalInsumoProps {
  /** `null` para crear; una fila para editar. */
  insumo: Insumo | null;
  unidades: readonly UnidadDeMedida[];
  alCerrar: () => void;
  /** Si falla, la ventana se queda abierta y muestra el error. */
  alGuardar: (entrada: DatosDelFormularioInsumo) => Promise<void>;
}

interface ErroresDelFormulario {
  nombre?: string;
  id_unidad?: string;
  minimo?: string;
}

const CANTIDAD_VALIDA = /^\d{1,10}(\.\d{1,2})?$/;

export function ModalInsumo({
  insumo,
  unidades,
  alCerrar,
  alGuardar,
}: ModalInsumoProps) {
  const [nombre, setNombre] = useState(insumo?.nombre ?? "");
  const [idUnidad, setIdUnidad] = useState(
    insumo === null ? "" : String(insumo.id_unidad),
  );
  const [minimo, setMinimo] = useState(
    insumo === null ? "" : insumo.minimo.toFixed(2),
  );
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const nombreLimpio = nombre.trim();
    const minimoLimpio = minimo.trim();

    if (nombreLimpio === "") {
      nuevos.nombre = "Escribe el nombre del insumo.";
    } else if (nombreLimpio.length > 80) {
      nuevos.nombre = "El nombre del insumo no puede pasar de 80 caracteres.";
    }

    if (idUnidad === "") {
      nuevos.id_unidad = "Elige una unidad de medida.";
    }

    if (minimoLimpio === "") {
      nuevos.minimo = "Escribe el mínimo de reposición.";
    } else if (!CANTIDAD_VALIDA.test(minimoLimpio)) {
      nuevos.minimo =
        "El mínimo debe ser un número con hasta dos decimales.";
    } else if (Number(minimoLimpio) < 0) {
      nuevos.minimo = "El mínimo no puede ser negativo.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    if (!validar()) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      const datos = {
        nombre: nombre.trim(),
        id_unidad: Number(idUnidad),
        minimo: minimo.trim(),
      };

      await alGuardar(
        insumo === null
          ? { modo: "crear", datos }
          : { modo: "editar", datos: { ...datos, activo } },
      );
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={insumo === null ? "Nuevo insumo" : "Editar insumo"}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={(evento) => void guardar(evento)} className="space-y-4">
        {errorDelServidor !== null && (
          <Alerta tipo="error" titulo="No se pudo guardar el insumo">
            {errorDelServidor}
          </Alerta>
        )}

        <Campo
          etiqueta="Nombre"
          value={nombre}
          maxLength={80}
          autoFocus
          error={errores.nombre}
          onChange={(evento) => setNombre(evento.target.value)}
        />

        <Selector
          etiqueta="Unidad de medida"
          value={idUnidad}
          marcador="Elige una unidad…"
          opciones={unidades.map((unidad) => ({
            valor: unidad.id_unidad,
            texto: `${unidad.nombre} (${unidad.abreviatura})`,
          }))}
          ayuda={
            insumo === null
              ? undefined
              : "Si el insumo ya tiene movimientos, la unidad no se puede cambiar."
          }
          error={errores.id_unidad}
          onChange={(evento) => setIdUnidad(evento.target.value)}
        />

        <Campo
          etiqueta="Mínimo"
          value={minimo}
          inputMode="decimal"
          maxLength={13}
          ayuda="Se avisa cuando la existencia total baja de este número."
          error={errores.minimo}
          onChange={(evento) => setMinimo(evento.target.value)}
        />

        {insumo !== null && (
          <Selector
            etiqueta="Estado"
            value={activo ? "activo" : "inactivo"}
            opciones={[
              { valor: "activo", texto: "Activo" },
              { valor: "inactivo", texto: "Inactivo" },
            ]}
            ayuda="Un insumo inactivo conserva su historial, pero no se puede mover."
            onChange={(evento) => setActivo(evento.target.value === "activo")}
          />
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Boton
            variante="secundario"
            disabled={enviando}
            onClick={alCerrar}
          >
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Guardando…"
            icono={<Save size={16} aria-hidden="true" />}
          >
            {insumo === null ? "Crear insumo" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
