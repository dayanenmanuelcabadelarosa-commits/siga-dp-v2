/*
  ModalEmpleado.tsx — el formulario para crear o editar a una persona.
  -------------------------------------------------------------------

  Crear es una sola operación del servidor: el empleado y su cuenta de acceso
  nacen juntos o no nace ninguno. Por eso este formulario pide también el
  usuario y la clave inicial.

  Editar no permite cambiar el nombre de usuario: es la llave con la que la
  persona entra y cambiarla sin avisar solo confunde. Tampoco deja que alguien
  se cambie su propio rol; el servidor lo rechaza y aquí el selector se apaga.

  La validación de este lado es una ayuda para no gastar un viaje al servidor.
  La de verdad es la del servidor; si él responde con un error, se muestra tal
  cual.
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type {
  DatosParaCrearEmpleado,
  DatosParaEditarEmpleado,
  EmpleadoDePersonal,
  RolAsignable,
} from "../../api/personal";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export type DatosDelFormulario =
  | { modo: "crear"; datos: DatosParaCrearEmpleado }
  | { modo: "editar"; datos: DatosParaEditarEmpleado };

export interface ModalEmpleadoProps {
  /** `null` para crear; una fila para editar. */
  empleado: EmpleadoDePersonal | null;
  roles: readonly RolAsignable[];
  /** Si es la propia persona, el rol no se puede cambiar. */
  esUnoMismo: boolean;
  alCerrar: () => void;
  /** Si el servidor falla, se lanza el error y este formulario lo muestra. */
  alGuardar: (entrada: DatosDelFormulario) => Promise<void>;
}

const TELEFONO = /^[0-9+()\s-]{7,20}$/;
const USUARIO = /^[A-Za-z0-9._-]+$/;

export function ModalEmpleado({
  empleado,
  roles,
  esUnoMismo,
  alCerrar,
  alGuardar,
}: ModalEmpleadoProps) {
  const [cedula, setCedula] = useState(empleado?.cedula ?? "");
  const [nombre, setNombre] = useState(empleado?.nombre ?? "");
  const [telefono, setTelefono] = useState(empleado?.telefono ?? "");
  const [idRol, setIdRol] = useState(empleado === null ? "" : String(empleado.id_rol));
  const [usuario, setUsuario] = useState(empleado?.usuario ?? "");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const esNuevo = empleado === null;
  const titulo = esNuevo ? "Nuevo empleado" : `Editar a ${empleado.nombre}`;

  function validar(): string | null {
    if (cedula.trim() === "") return "Escribe la cédula.";
    if (nombre.trim() === "") return "Escribe el nombre completo.";
    if (idRol === "") return "Elige un rol.";

    if (telefono.trim() !== "" && !TELEFONO.test(telefono.trim())) {
      return "El teléfono solo puede tener números, espacios, +, - y paréntesis (7 a 20 caracteres).";
    }

    if (esNuevo) {
      if (usuario.trim() === "") return "Escribe el nombre de usuario.";
      if (usuario.trim().length < 3) {
        return "El usuario debe tener al menos 3 caracteres.";
      }
      if (!USUARIO.test(usuario.trim())) {
        return "El usuario solo puede tener letras, números, punto, guion y guion bajo.";
      }
      if (clave.length < 8) return "La clave debe tener al menos 8 caracteres.";
    }

    return null;
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    if (enviando) return;

    const problema = validar();
    if (problema !== null) {
      setError(problema);
      return;
    }

    setError(null);
    setEnviando(true);

    try {
      if (esNuevo) {
        await alGuardar({
          modo: "crear",
          datos: {
            cedula: cedula.trim(),
            nombre: nombre.trim(),
            telefono: telefono.trim(),
            id_rol: Number(idRol),
            usuario: usuario.trim(),
            clave,
          },
        });
      } else {
        await alGuardar({
          modo: "editar",
          datos: {
            nombre: nombre.trim(),
            telefono: telefono.trim(),
            id_rol: Number(idRol),
          },
        });
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={titulo} alCerrar={alCerrar} cerrable={!enviando}>
      <form
        noValidate
        onSubmit={(evento) => {
          void enviar(evento);
        }}
        className="space-y-4"
      >
        {error !== null && <Alerta tipo="error">{error}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Cédula"
            value={cedula}
            onChange={(evento) => setCedula(evento.target.value)}
            maxLength={20}
            autoComplete="off"
            disabled={!esNuevo}
            ayuda={esNuevo ? undefined : "La cédula no se cambia."}
            required
          />

          <Campo
            etiqueta="Teléfono"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            maxLength={20}
            ayuda="Opcional."
            autoComplete="off"
          />
        </div>

        <Campo
          etiqueta="Nombre completo"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          maxLength={80}
          autoComplete="off"
          required
        />

        <Selector
          etiqueta="Rol"
          value={idRol}
          onChange={(evento) => setIdRol(evento.target.value)}
          opciones={roles.map((rol) => ({
            valor: rol.id_rol,
            texto: rol.nombre,
          }))}
          marcador={esNuevo ? "Elige un rol…" : undefined}
          disabled={esUnoMismo}
          ayuda={
            esUnoMismo
              ? "No puedes cambiarte el rol a ti mismo."
              : "El rol decide qué pantallas y operaciones puede usar."
          }
          required
        />

        {esNuevo ? (
          <>
            <Campo
              etiqueta="Usuario"
              value={usuario}
              onChange={(evento) => setUsuario(evento.target.value)}
              maxLength={30}
              ayuda="Con este usuario va a entrar. Se guarda en minúsculas."
              autoComplete="off"
              required
            />

            <Campo
              etiqueta="Clave inicial"
              type="password"
              value={clave}
              onChange={(evento) => setClave(evento.target.value)}
              maxLength={200}
              ayuda="Mínimo 8 caracteres. Se le debe decir a la persona."
              autoComplete="new-password"
              required
            />
          </>
        ) : (
          <Campo
            etiqueta="Usuario"
            value={empleado.usuario ?? ""}
            disabled
            ayuda={
              empleado.usuario === null
                ? "Esta persona no tiene cuenta de acceso."
                : "El nombre de usuario no se cambia."
            }
          />
        )}

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
            icono={<Save size={18} aria-hidden="true" />}
          >
            {esNuevo ? "Crear empleado" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
