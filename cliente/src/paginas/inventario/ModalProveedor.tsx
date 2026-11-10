/*
  ModalProveedor.tsx — el formulario para crear o editar un proveedor.
  -------------------------------------------------------------------

  Un proveedor nunca se borra: se desactiva (RN-16). El estado se cambia aquí,
  en el mismo formulario, para que no haya dos acciones parecidas.

  El teléfono admite la misma forma que el del personal y las reservas
  (809-555-0101, +1 809 555 0101…).
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type {
  CambiosDeProveedor,
  DatosParaProveedor,
  Proveedor,
} from "../../api/inventario";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export type DatosDelFormularioProveedor =
  | { modo: "crear"; datos: DatosParaProveedor }
  | { modo: "editar"; datos: CambiosDeProveedor };

export interface ModalProveedorProps {
  /** `null` para crear; una fila para editar. */
  proveedor: Proveedor | null;
  alCerrar: () => void;
  /** Si falla, la ventana se queda abierta y muestra el error. */
  alGuardar: (entrada: DatosDelFormularioProveedor) => Promise<void>;
}

interface ErroresDelFormulario {
  nombre?: string;
  telefono?: string;
}

const TELEFONO_VALIDO = /^[0-9+()\-\s]{7,20}$/;

export function ModalProveedor({
  proveedor,
  alCerrar,
  alGuardar,
}: ModalProveedorProps) {
  const [nombre, setNombre] = useState(proveedor?.nombre ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [estado, setEstado] = useState<"Activo" | "Inactivo">(
    proveedor?.estado ?? "Activo",
  );
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const nombreLimpio = nombre.trim();
    const telefonoLimpio = telefono.trim();

    if (nombreLimpio === "") {
      nuevos.nombre = "Escribe el nombre del proveedor.";
    } else if (nombreLimpio.length > 80) {
      nuevos.nombre =
        "El nombre del proveedor no puede pasar de 80 caracteres.";
    }

    if (telefonoLimpio === "") {
      nuevos.telefono = "Escribe el teléfono del proveedor.";
    } else if (!TELEFONO_VALIDO.test(telefonoLimpio)) {
      nuevos.telefono =
        "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).";
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
        telefono: telefono.trim(),
      };

      await alGuardar(
        proveedor === null
          ? { modo: "crear", datos }
          : { modo: "editar", datos: { ...datos, estado } },
      );
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={proveedor === null ? "Nuevo proveedor" : "Editar proveedor"}
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={(evento) => void guardar(evento)} className="space-y-4">
        {errorDelServidor !== null && (
          <Alerta tipo="error" titulo="No se pudo guardar el proveedor">
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

        <Campo
          etiqueta="Teléfono"
          value={telefono}
          maxLength={20}
          inputMode="tel"
          ayuda="Números, espacios, +, - y paréntesis."
          error={errores.telefono}
          onChange={(evento) => setTelefono(evento.target.value)}
        />

        {proveedor !== null && (
          <Selector
            etiqueta="Estado"
            value={estado}
            opciones={[
              { valor: "Activo", texto: "Activo" },
              { valor: "Inactivo", texto: "Inactivo" },
            ]}
            ayuda="Un proveedor inactivo conserva sus compras, pero no se puede usar en una entrada nueva."
            onChange={(evento) =>
              setEstado(evento.target.value === "Activo" ? "Activo" : "Inactivo")
            }
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
            {proveedor === null ? "Crear proveedor" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
