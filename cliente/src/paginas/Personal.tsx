/*
  Personal.tsx — la pantalla de Personal y usuarios (M07).
  -------------------------------------------------------

  Es la primera pantalla real de la Fase 4. Todo lo que muestra sale de
  `GET /api/personal`; ninguna fila se inventa y ningún cambio se queda solo en
  el estado de React. Después de cada acción se vuelve a pedir la lista al
  servidor, y lo que se ve es lo que quedó guardado en PostgreSQL.

  Dos comodidades que no son la seguridad:

    · Los botones de una fila de nivel superior al de la persona que mira se
      deshabilitan. El servidor igualmente rechaza la operación (403).
    · El botón de dar de baja no se ofrece sobre uno mismo. El servidor también
      lo rechaza.
*/

import {
  KeyRound,
  LockOpen,
  Pencil,
  Plus,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  cambiarClaveDeEmpleado,
  darDeBajaEmpleado,
  desbloquearEmpleado,
  editarEmpleado,
  listarPersonal,
  reactivarEmpleado,
  crearEmpleado,
} from "../api/personal";
import type {
  DatosDePersonal,
  EmpleadoDePersonal,
  EstadoDeEmpleado,
} from "../api/personal";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import type { ColorDeInsignia } from "../componentes/Insignia";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { Tabla } from "../componentes/Tabla";
import type { Columna } from "../componentes/Tabla";
import { useSesion } from "../sesion/useSesion";
import { ModalClave } from "./personal/ModalClave";
import { ModalEmpleado } from "./personal/ModalEmpleado";
import type { DatosDelFormulario } from "./personal/ModalEmpleado";

type TipoDeConfirmacion = "baja" | "reactivar" | "desbloquear";

interface ConfirmacionPendiente {
  tipo: TipoDeConfirmacion;
  empleado: EmpleadoDePersonal;
}

interface TextoDeConfirmacion {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  peligroso: boolean;
}

function textoDeConfirmacion(
  tipo: TipoDeConfirmacion,
  nombre: string,
): TextoDeConfirmacion {
  if (tipo === "baja") {
    return {
      titulo: `Dar de baja a ${nombre}`,
      mensaje:
        "Su cuenta quedará inactiva de inmediato y no podrá entrar al sistema. El historial se conserva y puedes reactivarla después.",
      textoConfirmar: "Dar de baja",
      peligroso: true,
    };
  }

  if (tipo === "reactivar") {
    return {
      titulo: `Reactivar a ${nombre}`,
      mensaje:
        "Su cuenta volverá a estar activa y podrá entrar con la misma clave que tenía.",
      textoConfirmar: "Reactivar",
      peligroso: false,
    };
  }

  return {
    titulo: `Desbloquear la cuenta de ${nombre}`,
    mensaje:
      "La cuenta podrá volver a intentar entrar y los intentos fallidos se ponen en cero.",
    textoConfirmar: "Desbloquear",
    peligroso: false,
  };
}

function colorDeEstado(estado: EstadoDeEmpleado): ColorDeInsignia {
  if (estado === "Activo") return "verde";
  if (estado === "Bloqueado") return "rojo";
  return "gris";
}

export function Personal() {
  const { usuario } = useSesion();

  const [datos, setDatos] = useState<DatosDePersonal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [modalEmpleado, setModalEmpleado] = useState<{
    empleado: EmpleadoDePersonal | null;
  } | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionPendiente | null>(
    null,
  );
  const [claveDe, setClaveDe] = useState<EmpleadoDePersonal | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const recibidos = await listarPersonal();
        if (vivo) {
          setDatos(recibidos);
          setError(null);
        }
      } catch (fallo) {
        if (vivo) setError(mensajeDeError(fallo));
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  async function cargarDeNuevo(): Promise<void> {
    setCargando(true);
    setError(null);

    try {
      setDatos(await listarPersonal());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  async function refrescar(): Promise<void> {
    setRefrescando(true);

    try {
      setDatos(await listarPersonal());
      setError(null);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  async function guardarEmpleado(entrada: DatosDelFormulario): Promise<void> {
    if (entrada.modo === "crear") {
      const creado = await crearEmpleado(entrada.datos);
      setAviso(
        `Se creó a ${creado.nombre} con el usuario ${creado.usuario ?? entrada.datos.usuario}.`,
      );
    } else {
      const enEdicion = modalEmpleado?.empleado ?? null;

      if (enEdicion === null) {
        throw new Error("No se sabe qué empleado se está editando.");
      }

      const editado = await editarEmpleado(enEdicion.id_empleado, entrada.datos);
      setAviso(`Se actualizó a ${editado.nombre}.`);
    }

    setModalEmpleado(null);
    await refrescar();
  }

  async function ejecutarConfirmacion(): Promise<void> {
    if (confirmacion === null) return;

    setProcesando(true);
    setErrorDeAccion(null);

    try {
      const { tipo, empleado: fila } = confirmacion;

      if (tipo === "baja") {
        const resultado = await darDeBajaEmpleado(fila.id_empleado);
        setAviso(
          `${resultado.nombre} quedó dado de baja. Su cuenta no podrá entrar hasta que la reactives.`,
        );
      } else if (tipo === "reactivar") {
        const resultado = await reactivarEmpleado(fila.id_empleado);
        setAviso(`${resultado.nombre} quedó activo otra vez.`);
      } else {
        const resultado = await desbloquearEmpleado(fila.id_empleado);
        setAviso(`La cuenta de ${resultado.nombre} quedó desbloqueada.`);
      }

      setConfirmacion(null);
      await refrescar();
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    } finally {
      setProcesando(false);
    }
  }

  async function guardarClave(clave: string): Promise<void> {
    if (claveDe === null) return;

    const respuesta = await cambiarClaveDeEmpleado(claveDe.id_empleado, clave);
    setAviso(respuesta.mensaje);
    setClaveDe(null);
    await refrescar();
  }

  function abrirConfirmacion(
    tipo: TipoDeConfirmacion,
    empleado: EmpleadoDePersonal,
  ): void {
    setErrorDeAccion(null);
    setConfirmacion({ tipo, empleado });
  }

  if (cargando) {
    return <Cargando texto="Cargando el personal…" />;
  }

  if (datos === null) {
    return (
      <div>
        <EncabezadoPagina
          titulo="Personal y usuarios"
          subtitulo="Altas, bajas, desbloqueo de cuentas y cambio de clave."
        />

        <Alerta tipo="error" titulo="No se pudo cargar el personal">
          {error ?? "Ocurrió un error inesperado."}
        </Alerta>

        <div className="mt-4">
          <Boton
            variante="secundario"
            onClick={() => {
              void cargarDeNuevo();
            }}
          >
            Reintentar
          </Boton>
        </div>
      </div>
    );
  }

  const total = datos.empleados.length;
  const nivelDelActor = usuario?.nivel ?? 0;
  const idDelActor = usuario?.id_empleado ?? null;

  const columnas: readonly Columna<EmpleadoDePersonal>[] = [
    {
      clave: "cedula",
      encabezado: "Cédula",
      render: (fila) => (
        <span className="font-mono text-xs text-madera">{fila.cedula}</span>
      ),
    },
    {
      clave: "nombre",
      encabezado: "Empleado",
      render: (fila) => (
        <div>
          <p className="font-medium text-carbon">{fila.nombre}</p>
          <p className="text-xs text-madera">
            {fila.telefono ?? "Sin teléfono"}
          </p>
        </div>
      ),
    },
    {
      clave: "usuario",
      encabezado: "Usuario",
      render: (fila) =>
        fila.usuario === null ? (
          <span className="text-xs text-madera/60">Sin cuenta</span>
        ) : (
          <span className="font-mono text-xs text-carbon">{fila.usuario}</span>
        ),
    },
    {
      clave: "rol",
      encabezado: "Rol",
      render: (fila) => fila.rol_nombre,
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <div>
          <Insignia texto={fila.estado} color={colorDeEstado(fila.estado)} />

          {fila.estado === "Bloqueado" &&
            fila.intentos_fallidos !== null && (
              <p className="mt-1 text-xs text-ladrillo">
                {fila.intentos_fallidos} intentos fallidos
              </p>
            )}
        </div>
      ),
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      render: (fila) => {
        const administrable = fila.nivel <= nivelDelActor;
        const esUnoMismo = fila.id_empleado === idDelActor;
        const motivo = administrable
          ? undefined
          : "No puedes administrar a alguien de nivel superior.";

        return (
          <div className="flex justify-end gap-1">
            <Boton
              variante="texto"
              className="px-2 py-1.5 disabled:saturate-0"
              aria-label={`Editar a ${fila.nombre}`}
              title={motivo ?? "Editar"}
              disabled={!administrable}
              icono={<Pencil size={16} aria-hidden="true" />}
              onClick={() => setModalEmpleado({ empleado: fila })}
            >
              <span className="sr-only">Editar</span>
            </Boton>

            {fila.estado === "Inactivo" ? (
              <Boton
                variante="texto"
                className="px-2 py-1.5 disabled:saturate-0"
                aria-label={`Reactivar a ${fila.nombre}`}
                title={motivo ?? "Reactivar"}
                disabled={!administrable}
                icono={
                  <UserCheck size={16} className="text-hoja" aria-hidden="true" />
                }
                onClick={() => abrirConfirmacion("reactivar", fila)}
              >
                <span className="sr-only">Reactivar</span>
              </Boton>
            ) : (
              <Boton
                variante="texto"
                className="px-2 py-1.5 disabled:saturate-0"
                aria-label={`Dar de baja a ${fila.nombre}`}
                title={motivo ?? (esUnoMismo ? "No puedes darte de baja" : "Dar de baja")}
                disabled={!administrable || esUnoMismo}
                icono={
                  <UserMinus
                    size={16}
                    className="text-ladrillo"
                    aria-hidden="true"
                  />
                }
                onClick={() => abrirConfirmacion("baja", fila)}
              >
                <span className="sr-only">Dar de baja</span>
              </Boton>
            )}

            {fila.estado === "Bloqueado" && fila.id_usuario !== null && (
              <Boton
                variante="texto"
                className="px-2 py-1.5 disabled:saturate-0"
                aria-label={`Desbloquear la cuenta de ${fila.nombre}`}
                title={motivo ?? "Desbloquear"}
                disabled={!administrable}
                icono={<LockOpen size={16} aria-hidden="true" />}
                onClick={() => abrirConfirmacion("desbloquear", fila)}
              >
                <span className="sr-only">Desbloquear</span>
              </Boton>
            )}

            {fila.id_usuario !== null && (
              <Boton
                variante="texto"
                className="px-2 py-1.5 disabled:saturate-0"
                aria-label={`Cambiar la clave de ${fila.nombre}`}
                title={motivo ?? "Cambiar clave"}
                disabled={!administrable}
                icono={<KeyRound size={16} aria-hidden="true" />}
                onClick={() => setClaveDe(fila)}
              >
                <span className="sr-only">Cambiar clave</span>
              </Boton>
            )}
          </div>
        );
      },
    },
  ];

  const textoConfirmacion =
    confirmacion === null
      ? null
      : textoDeConfirmacion(
          confirmacion.tipo,
          confirmacion.empleado.nombre,
        );

  return (
    <div>
      <EncabezadoPagina
        titulo="Personal y usuarios"
        subtitulo={`${total} ${
          total === 1 ? "empleado registrado" : "empleados registrados"
        }. Administras a personas de tu mismo nivel o menor; no puedes darte de baja ni cambiarte el rol a ti mismo.`}
        acciones={
          <Boton
            icono={<Plus size={18} aria-hidden="true" />}
            onClick={() => setModalEmpleado({ empleado: null })}
          >
            Nuevo empleado
          </Boton>
        }
      />

      {aviso !== null && (
        <div className="mb-4">
          <Alerta tipo="exito">{aviso}</Alerta>
        </div>
      )}

      {error !== null && (
        <div className="mb-4 space-y-2">
          <Alerta tipo="error" titulo="No se pudo actualizar la lista">
            {error}
          </Alerta>

          <Boton
            variante="secundario"
            onClick={() => {
              void refrescar();
            }}
          >
            Reintentar
          </Boton>
        </div>
      )}

      {refrescando && (
        <p role="status" className="mb-2 text-xs text-madera">
          Actualizando la lista…
        </p>
      )}

      <Tabla
        titulo="Personal registrado"
        columnas={columnas}
        filas={datos.empleados}
        claveDeFila={(fila) => fila.id_empleado}
        vacio="Todavía no hay empleados registrados."
      />

      {modalEmpleado !== null && (
        <ModalEmpleado
          empleado={modalEmpleado.empleado}
          roles={datos.roles}
          esUnoMismo={
            modalEmpleado.empleado !== null &&
            modalEmpleado.empleado.id_empleado === idDelActor
          }
          alCerrar={() => setModalEmpleado(null)}
          alGuardar={guardarEmpleado}
        />
      )}

      {confirmacion !== null && textoConfirmacion !== null && (
        <ModalConfirmacion
          titulo={textoConfirmacion.titulo}
          mensaje={textoConfirmacion.mensaje}
          textoConfirmar={textoConfirmacion.textoConfirmar}
          peligroso={textoConfirmacion.peligroso}
          procesando={procesando}
          error={errorDeAccion}
          alConfirmar={() => {
            void ejecutarConfirmacion();
          }}
          alCerrar={() => setConfirmacion(null)}
        />
      )}

      {claveDe !== null && (
        <ModalClave
          empleado={claveDe}
          alCerrar={() => setClaveDe(null)}
          alGuardar={guardarClave}
        />
      )}
    </div>
  );
}
