/*
  ModalZonasMesas.tsx — administrar el salón sin tocar SQL.
  --------------------------------------------------------

  Dos pestañas: Zonas y Mesas. Se crean, se editan y se eliminan. Las reglas
  viven en el servidor y aquí se muestran tal cual:

    • Una zona con mesas no se puede eliminar (RN-15).
    • Una mesa con reservas o servicios registrados no se puede eliminar.
    • El número de mesa y el nombre de la zona no se repiten.
    • La capacidad no puede quedar por debajo de las personas que ya están
      sentadas ni de las reservas futuras (RN-20).

  Las listas no se guardan en el estado local: se leen de las props y, después
  de cada cambio, se pide al padre que vuelva a cargar el mapa. Así no hay dos
  copias de la verdad.
*/

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { mensajeDeError } from "../../api/errores";
import {
  crearMesa,
  crearZona,
  editarMesa,
  editarZona,
  eliminarMesa,
  eliminarZona,
} from "../../api/mesas";
import type {
  CambiosDeMesa,
  CambiosDeZona,
  DatosParaMesa,
  DatosParaZona,
  Mesa,
  Zona,
} from "../../api/mesas";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";

export interface ModalZonasMesasProps {
  zonas: readonly Zona[];
  mesas: readonly Mesa[];
  alCerrar: () => void;
  /** Vuelve a pedir el mapa para que la pantalla vea los cambios. */
  alRefrescar: () => Promise<void>;
}

type Seccion = "zonas" | "mesas";

type Confirmacion =
  | { tipo: "zona"; zona: Zona }
  | { tipo: "mesa"; mesa: Mesa };

const TIPOS_DE_AMBIENTE = [
  "Salón",
  "Terraza",
  "Barra",
  "Privado",
  "Exterior",
] as const;

interface ErroresDeZona {
  nombre?: string;
  tipo_ambiente?: string;
}

interface ErroresDeMesa {
  numero?: string;
  id_zona?: string;
  capacidad?: string;
}

function opcionesDeAmbiente(tipoActual?: string) {
  const tipos = new Set<string>(TIPOS_DE_AMBIENTE);

  if (tipoActual !== undefined && tipoActual !== "") tipos.add(tipoActual);

  return [...tipos].map((tipo) => ({ valor: tipo, texto: tipo }));
}

function validarZona(nombre: string, tipo: string): ErroresDeZona {
  const errores: ErroresDeZona = {};

  if (nombre.trim() === "") {
    errores.nombre = "Escribe el nombre de la zona.";
  } else if (nombre.trim().length > 60) {
    errores.nombre = "El nombre de la zona no puede pasar de 60 caracteres.";
  }

  if (tipo.trim() === "") {
    errores.tipo_ambiente = "Elige el tipo de ambiente.";
  }

  return errores;
}

function validarMesa(
  numero: string,
  idZona: string,
  capacidad: string,
): ErroresDeMesa {
  const errores: ErroresDeMesa = {};
  const valorNumero = Number(numero);
  const valorCapacidad = Number(capacidad);

  if (numero.trim() === "" || !Number.isInteger(valorNumero) || valorNumero <= 0) {
    errores.numero = "El número de mesa debe ser un entero mayor que cero.";
  }

  if (idZona === "") {
    errores.id_zona = "Elige una zona.";
  }

  if (
    capacidad.trim() === "" ||
    !Number.isInteger(valorCapacidad) ||
    valorCapacidad <= 0
  ) {
    errores.capacidad = "La capacidad debe ser un entero mayor que cero.";
  }

  return errores;
}

function BotonDeSeccion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa ${
        activa
          ? "bg-carbon text-white"
          : "border border-madera/15 bg-white text-madera hover:border-brasa/40 hover:text-brasa"
      }`}
    >
      {children}
    </button>
  );
}

export function ModalZonasMesas({
  zonas,
  mesas,
  alCerrar,
  alRefrescar,
}: ModalZonasMesasProps) {
  const [seccion, setSeccion] = useState<Seccion>("zonas");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  const [nuevaZonaNombre, setNuevaZonaNombre] = useState("");
  const [nuevaZonaTipo, setNuevaZonaTipo] = useState("");
  const [erroresNuevaZona, setErroresNuevaZona] = useState<ErroresDeZona>({});

  const [zonaEditando, setZonaEditando] = useState<Zona | null>(null);
  const [nombreZonaEditada, setNombreZonaEditada] = useState("");
  const [tipoZonaEditado, setTipoZonaEditado] = useState("");
  const [erroresZonaEditada, setErroresZonaEditada] = useState<ErroresDeZona>(
    {},
  );

  const [nuevaMesaNumero, setNuevaMesaNumero] = useState("");
  const [nuevaMesaZona, setNuevaMesaZona] = useState("");
  const [nuevaMesaCapacidad, setNuevaMesaCapacidad] = useState("");
  const [erroresNuevaMesa, setErroresNuevaMesa] = useState<ErroresDeMesa>({});

  const [mesaEditando, setMesaEditando] = useState<Mesa | null>(null);
  const [numeroMesaEditada, setNumeroMesaEditada] = useState("");
  const [zonaMesaEditada, setZonaMesaEditada] = useState("");
  const [capacidadMesaEditada, setCapacidadMesaEditada] = useState("");
  const [erroresMesaEditada, setErroresMesaEditada] = useState<ErroresDeMesa>(
    {},
  );

  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(
    null,
  );

  const ocupado = accionEnCurso !== null;
  const mesasPorZona = new Map<number, number>();

  for (const mesa of mesas) {
    mesasPorZona.set(mesa.id_zona, (mesasPorZona.get(mesa.id_zona) ?? 0) + 1);
  }

  async function ejecutar(
    clave: string,
    trabajo: () => Promise<void>,
    alFallar?: (mensaje: string) => void,
  ): Promise<void> {
    setAccionEnCurso(clave);
    setError(null);
    setAviso(null);

    try {
      await trabajo();
    } catch (fallo) {
      const mensaje = mensajeDeError(fallo);
      setAviso(null);
      setError(mensaje);
      alFallar?.(mensaje);
    } finally {
      setAccionEnCurso(null);
    }
  }

  function crearLaZona(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const errores = validarZona(nuevaZonaNombre, nuevaZonaTipo);
    setErroresNuevaZona(errores);
    if (Object.keys(errores).length > 0) return;

    const datos: DatosParaZona = {
      nombre: nuevaZonaNombre.trim(),
      tipo_ambiente: nuevaZonaTipo.trim(),
    };

    void ejecutar("crear-zona", async () => {
      const creada = await crearZona(datos);
      setNuevaZonaNombre("");
      setNuevaZonaTipo("");
      setAviso(`Se creó la zona "${creada.nombre}".`);
      await alRefrescar();
    });
  }

  function empezarEdicionDeZona(zona: Zona): void {
    setZonaEditando(zona);
    setNombreZonaEditada(zona.nombre);
    setTipoZonaEditado(zona.tipo_ambiente);
    setErroresZonaEditada({});
    setError(null);
    setAviso(null);
  }

  function guardarLaZona(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (zonaEditando === null) return;

    const errores = validarZona(nombreZonaEditada, tipoZonaEditado);
    setErroresZonaEditada(errores);
    if (Object.keys(errores).length > 0) return;

    const cambios: CambiosDeZona = {
      nombre: nombreZonaEditada.trim(),
      tipo_ambiente: tipoZonaEditado.trim(),
    };

    void ejecutar("editar-zona", async () => {
      const actualizada = await editarZona(zonaEditando.id_zona, cambios);
      setZonaEditando(null);
      setAviso(`Se actualizó la zona "${actualizada.nombre}".`);
      await alRefrescar();
    });
  }

  function crearLaMesa(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();

    const errores = validarMesa(
      nuevaMesaNumero,
      nuevaMesaZona,
      nuevaMesaCapacidad,
    );
    setErroresNuevaMesa(errores);
    if (Object.keys(errores).length > 0) return;

    const datos: DatosParaMesa = {
      numero: Number(nuevaMesaNumero),
      id_zona: Number(nuevaMesaZona),
      capacidad: Number(nuevaMesaCapacidad),
    };

    void ejecutar("crear-mesa", async () => {
      const creada = await crearMesa(datos);
      setNuevaMesaNumero("");
      setNuevaMesaCapacidad("");
      setAviso(`Se creó la mesa ${creada.numero}.`);
      await alRefrescar();
    });
  }

  function empezarEdicionDeMesa(mesa: Mesa): void {
    setMesaEditando(mesa);
    setNumeroMesaEditada(String(mesa.numero));
    setZonaMesaEditada(String(mesa.id_zona));
    setCapacidadMesaEditada(String(mesa.capacidad));
    setErroresMesaEditada({});
    setError(null);
    setAviso(null);
  }

  function guardarLaMesa(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (mesaEditando === null) return;

    const errores = validarMesa(
      numeroMesaEditada,
      zonaMesaEditada,
      capacidadMesaEditada,
    );
    setErroresMesaEditada(errores);
    if (Object.keys(errores).length > 0) return;

    const cambios: CambiosDeMesa = {
      numero: Number(numeroMesaEditada),
      id_zona: Number(zonaMesaEditada),
      capacidad: Number(capacidadMesaEditada),
    };

    void ejecutar("editar-mesa", async () => {
      const actualizada = await editarMesa(mesaEditando.id_mesa, cambios);
      setMesaEditando(null);
      setAviso(`Se actualizó la mesa ${actualizada.numero}.`);
      await alRefrescar();
    });
  }

  function pedirConfirmacion(elemento: Confirmacion): void {
    setConfirmacion(elemento);
    setErrorConfirmacion(null);
    setError(null);
    setAviso(null);
  }

  function eliminarLoConfirmado(): void {
    if (confirmacion === null) return;

    const clave =
      confirmacion.tipo === "zona"
        ? `eliminar-zona-${confirmacion.zona.id_zona}`
        : `eliminar-mesa-${confirmacion.mesa.id_mesa}`;

    void ejecutar(
      clave,
      async () => {
        if (confirmacion.tipo === "zona") {
          await eliminarZona(confirmacion.zona.id_zona);
          if (zonaEditando?.id_zona === confirmacion.zona.id_zona) {
            setZonaEditando(null);
          }
          setAviso(`Se eliminó la zona "${confirmacion.zona.nombre}".`);
        } else {
          await eliminarMesa(confirmacion.mesa.id_mesa);
          if (mesaEditando?.id_mesa === confirmacion.mesa.id_mesa) {
            setMesaEditando(null);
          }
          setAviso(`Se eliminó la mesa ${confirmacion.mesa.numero}.`);
        }

        setConfirmacion(null);
        setErrorConfirmacion(null);
        await alRefrescar();
      },
      (mensaje) => setErrorConfirmacion(mensaje),
    );
  }

  return (
    <Modal
      titulo="Zonas y mesas"
      alCerrar={alCerrar}
      cerrable={!ocupado}
      ancho="ancho"
    >
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Zonas y mesas"
          className="flex gap-2 border-b border-madera/10 pb-3"
        >
          <BotonDeSeccion
            activa={seccion === "zonas"}
            onClick={() => {
              setSeccion("zonas");
              setConfirmacion(null);
              setError(null);
              setAviso(null);
            }}
          >
            Zonas
          </BotonDeSeccion>

          <BotonDeSeccion
            activa={seccion === "mesas"}
            onClick={() => {
              setSeccion("mesas");
              setConfirmacion(null);
              setError(null);
              setAviso(null);
            }}
          >
            Mesas
          </BotonDeSeccion>
        </div>

        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && <Alerta tipo="error">{error}</Alerta>}

        {confirmacion !== null && (
          <div className="rounded-xl border border-ladrillo/30 bg-ladrillo/5 p-3">
            <p className="text-sm font-medium text-ladrillo">
              {confirmacion.tipo === "zona"
                ? `¿Eliminar la zona "${confirmacion.zona.nombre}"?`
                : `¿Eliminar la mesa ${confirmacion.mesa.numero}?`}
            </p>

            <p className="mt-1 text-xs text-madera">
              Esta acción no se puede deshacer. Si hay historial, el servidor la
              rechazará y verás el motivo.
            </p>

            {errorConfirmacion !== null && (
              <div className="mt-2">
                <Alerta tipo="error">{errorConfirmacion}</Alerta>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Boton
                variante="peligro"
                onClick={eliminarLoConfirmado}
                cargando={accionEnCurso?.startsWith("eliminar-") ?? false}
                textoDeCarga="Eliminando…"
                disabled={ocupado && !accionEnCurso?.startsWith("eliminar-")}
              >
                Sí, eliminar
              </Boton>

              <Boton
                variante="secundario"
                onClick={() => {
                  setConfirmacion(null);
                  setErrorConfirmacion(null);
                }}
                disabled={ocupado}
              >
                Cancelar
              </Boton>
            </div>
          </div>
        )}

        {seccion === "zonas" ? (
          <section aria-label="Zonas del salón" className="space-y-4">
            <form
              onSubmit={crearLaZona}
              className="rounded-xl border border-madera/10 bg-crema/40 p-3"
              noValidate
            >
              <h3 className="text-sm font-semibold text-carbon">Nueva zona</h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Campo
                  etiqueta="Nombre"
                  value={nuevaZonaNombre}
                  onChange={(evento) => setNuevaZonaNombre(evento.target.value)}
                  error={erroresNuevaZona.nombre}
                  maxLength={60}
                />

                <Selector
                  etiqueta="Tipo de ambiente"
                  value={nuevaZonaTipo}
                  onChange={(evento) => setNuevaZonaTipo(evento.target.value)}
                  opciones={opcionesDeAmbiente()}
                  marcador="Elige un ambiente…"
                  error={erroresNuevaZona.tipo_ambiente}
                />
              </div>

              <div className="mt-3">
                <Boton
                  tipo="submit"
                  cargando={accionEnCurso === "crear-zona"}
                  textoDeCarga="Creando…"
                  icono={<Plus size={16} aria-hidden="true" />}
                  disabled={ocupado && accionEnCurso !== "crear-zona"}
                >
                  Crear zona
                </Boton>
              </div>
            </form>

            {zonas.length === 0 ? (
              <p className="rounded-xl bg-crema px-3 py-4 text-sm text-madera">
                No hay zonas todavía. Crea la primera arriba.
              </p>
            ) : (
              <ul className="divide-y divide-madera/10 rounded-xl border border-madera/10 bg-white">
                {zonas.map((zona) => {
                  const cantidadDeMesas = mesasPorZona.get(zona.id_zona) ?? 0;
                  const enEdicion = zonaEditando?.id_zona === zona.id_zona;

                  return (
                    <li key={zona.id_zona} className="px-3 py-3">
                      {enEdicion ? (
                        <form
                          onSubmit={guardarLaZona}
                          className="space-y-3"
                          noValidate
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo
                              etiqueta="Nombre"
                              value={nombreZonaEditada}
                              onChange={(evento) =>
                                setNombreZonaEditada(evento.target.value)
                              }
                              error={erroresZonaEditada.nombre}
                              maxLength={60}
                            />

                            <Selector
                              etiqueta="Tipo de ambiente"
                              value={tipoZonaEditado}
                              onChange={(evento) =>
                                setTipoZonaEditado(evento.target.value)
                              }
                              opciones={opcionesDeAmbiente(zona.tipo_ambiente)}
                              error={erroresZonaEditada.tipo_ambiente}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Boton
                              tipo="submit"
                              cargando={accionEnCurso === "editar-zona"}
                              textoDeCarga="Guardando…"
                            >
                              Guardar zona
                            </Boton>

                            <Boton
                              variante="secundario"
                              onClick={() => setZonaEditando(null)}
                              disabled={ocupado}
                            >
                              Cancelar
                            </Boton>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-carbon">
                              {zona.nombre}
                            </p>
                            <p className="text-xs text-madera">
                              {zona.tipo_ambiente} · {cantidadDeMesas}{" "}
                              {cantidadDeMesas === 1 ? "mesa" : "mesas"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Insignia
                              texto={zona.activo ? "Activa" : "Inactiva"}
                              color={zona.activo ? "verde" : "gris"}
                            />

                            <Boton
                              variante="texto"
                              aria-label={`Editar la zona ${zona.nombre}`}
                              title={`Editar la zona ${zona.nombre}`}
                              icono={<Pencil size={16} aria-hidden="true" />}
                              onClick={() => empezarEdicionDeZona(zona)}
                              disabled={ocupado}
                            >
                              <span className="sr-only">Editar</span>
                            </Boton>

                            <Boton
                              variante="texto"
                              aria-label={`Eliminar la zona ${zona.nombre}`}
                              title={
                                cantidadDeMesas > 0
                                  ? "No se puede eliminar: tiene mesas asignadas"
                                  : `Eliminar la zona ${zona.nombre}`
                              }
                              icono={
                                <Trash2
                                  size={16}
                                  className="text-ladrillo"
                                  aria-hidden="true"
                                />
                              }
                              onClick={() =>
                                pedirConfirmacion({ tipo: "zona", zona })
                              }
                              disabled={ocupado || cantidadDeMesas > 0}
                            >
                              <span className="sr-only">Eliminar</span>
                            </Boton>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <section aria-label="Mesas del salón" className="space-y-4">
            <form
              onSubmit={crearLaMesa}
              className="rounded-xl border border-madera/10 bg-crema/40 p-3"
              noValidate
            >
              <h3 className="text-sm font-semibold text-carbon">Nueva mesa</h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Campo
                  etiqueta="Número"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={nuevaMesaNumero}
                  onChange={(evento) => setNuevaMesaNumero(evento.target.value)}
                  error={erroresNuevaMesa.numero}
                />

                <Selector
                  etiqueta="Zona"
                  value={nuevaMesaZona}
                  onChange={(evento) => setNuevaMesaZona(evento.target.value)}
                  opciones={zonas.map((zona) => ({
                    valor: zona.id_zona,
                    texto: zona.activo ? zona.nombre : `${zona.nombre} (inactiva)`,
                  }))}
                  marcador="Elige una zona…"
                  error={erroresNuevaMesa.id_zona}
                />

                <Campo
                  etiqueta="Capacidad"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={nuevaMesaCapacidad}
                  onChange={(evento) =>
                    setNuevaMesaCapacidad(evento.target.value)
                  }
                  error={erroresNuevaMesa.capacidad}
                />
              </div>

              <div className="mt-3">
                <Boton
                  tipo="submit"
                  cargando={accionEnCurso === "crear-mesa"}
                  textoDeCarga="Creando…"
                  icono={<Plus size={16} aria-hidden="true" />}
                  disabled={
                    zonas.length === 0 ||
                    (ocupado && accionEnCurso !== "crear-mesa")
                  }
                >
                  Crear mesa
                </Boton>
              </div>
            </form>

            {mesas.length === 0 ? (
              <p className="rounded-xl bg-crema px-3 py-4 text-sm text-madera">
                No hay mesas todavía. Crea la primera arriba.
              </p>
            ) : (
              <ul className="divide-y divide-madera/10 rounded-xl border border-madera/10 bg-white">
                {mesas.map((mesa) => {
                  const enEdicion = mesaEditando?.id_mesa === mesa.id_mesa;

                  return (
                    <li key={mesa.id_mesa} className="px-3 py-3">
                      {enEdicion ? (
                        <form
                          onSubmit={guardarLaMesa}
                          className="space-y-3"
                          noValidate
                        >
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Campo
                              etiqueta="Número"
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={numeroMesaEditada}
                              onChange={(evento) =>
                                setNumeroMesaEditada(evento.target.value)
                              }
                              error={erroresMesaEditada.numero}
                            />

                            <Selector
                              etiqueta="Zona"
                              value={zonaMesaEditada}
                              onChange={(evento) =>
                                setZonaMesaEditada(evento.target.value)
                              }
                              opciones={zonas.map((zona) => ({
                                valor: zona.id_zona,
                                texto: zona.activo
                                  ? zona.nombre
                                  : `${zona.nombre} (inactiva)`,
                              }))}
                              error={erroresMesaEditada.id_zona}
                            />

                            <Campo
                              etiqueta="Capacidad"
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={capacidadMesaEditada}
                              onChange={(evento) =>
                                setCapacidadMesaEditada(evento.target.value)
                              }
                              error={erroresMesaEditada.capacidad}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Boton
                              tipo="submit"
                              cargando={accionEnCurso === "editar-mesa"}
                              textoDeCarga="Guardando…"
                            >
                              Guardar mesa
                            </Boton>

                            <Boton
                              variante="secundario"
                              onClick={() => setMesaEditando(null)}
                              disabled={ocupado}
                            >
                              Cancelar
                            </Boton>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-carbon">
                              Mesa {mesa.numero}
                            </p>
                            <p className="text-xs text-madera">
                              {mesa.zona} · capacidad {mesa.capacidad}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Insignia
                              texto={
                                mesa.estado === "libre"
                                  ? "Libre"
                                  : mesa.estado === "ocupada"
                                    ? "Ocupada"
                                    : mesa.estado === "reservada"
                                      ? "Reservada"
                                      : "Limpieza"
                              }
                              color={
                                mesa.estado === "libre"
                                  ? "verde"
                                  : mesa.estado === "ocupada"
                                    ? "brasa"
                                    : mesa.estado === "reservada"
                                      ? "miel"
                                      : "pizarra"
                              }
                            />

                            <Boton
                              variante="texto"
                              aria-label={`Editar la mesa ${mesa.numero}`}
                              title={`Editar la mesa ${mesa.numero}`}
                              icono={<Pencil size={16} aria-hidden="true" />}
                              onClick={() => empezarEdicionDeMesa(mesa)}
                              disabled={ocupado}
                            >
                              <span className="sr-only">Editar</span>
                            </Boton>

                            <Boton
                              variante="texto"
                              aria-label={`Eliminar la mesa ${mesa.numero}`}
                              title={`Eliminar la mesa ${mesa.numero}`}
                              icono={
                                <Trash2
                                  size={16}
                                  className="text-ladrillo"
                                  aria-hidden="true"
                                />
                              }
                              onClick={() =>
                                pedirConfirmacion({ tipo: "mesa", mesa })
                              }
                              disabled={ocupado}
                            >
                              <span className="sr-only">Eliminar</span>
                            </Boton>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
