/*
  Mesas.tsx — Mesas y reservas (M02, Fase 4).
  ------------------------------------------

  Dos vistas que comparten el mismo salón:

    • Mapa de mesas: el estado real de cada mesa, con sus zonas, su capacidad y
      las acciones del anfitrión (registrar llegada, mandar a limpieza, liberar).
    • Reservas: la agenda de un día. Se crean, se editan mientras están
      pendientes, se cancelan con motivo y se abren. Abrir una reserva ocupa la
      mesa con las personas y la hora de llegada.

  Nada se guarda en el cliente como si fuera la verdad: después de cada acción se
  vuelve a pedir el mapa y la agenda. Los errores del servidor se muestran tal
  cual, incluso dentro de las ventanas, para que una acción que falló no parezca
  que salió bien.

  La configuración de zonas y mesas solo se dibuja si el rol tiene
  ADMINISTRAR_MESAS. El servidor lo vuelve a comprobar en cada llamada.
*/

import {
  Ban,
  CalendarPlus,
  Check,
  Clock,
  DoorOpen,
  Pencil,
  RefreshCw,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  abrirReserva,
  cambiarEstadoDeMesa,
  cancelarReserva,
  crearReserva,
  editarReserva,
  listarMesas,
  listarReservas,
} from "../api/mesas";
import type {
  CambioDeEstadoDeMesa,
  DatosDeMesas,
  DatosDeReservas,
  EstadoDeMesa,
  Mesa,
  Reserva,
} from "../api/mesas";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import type { ColorDeInsignia } from "../componentes/Insignia";
import { Modal } from "../componentes/Modal";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { Pedidos } from "./Pedidos";
import { Pestanas } from "../componentes/Pestanas";
import type { OpcionDePestana } from "../componentes/Pestanas";
import { useSesion } from "../sesion/useSesion";
import { fechaDeHoy, formatearFecha } from "../utilidades/fecha";
import { ModalCancelarReserva } from "./mesas/ModalCancelarReserva";
import { ModalLlegada } from "./mesas/ModalLlegada";
import { ModalReserva } from "./mesas/ModalReserva";
import type { DatosDelFormularioReserva } from "./mesas/ModalReserva";
import { ModalZonasMesas } from "./mesas/ModalZonasMesas";

type Vista = "mapa" | "reservas";

const ESTADOS_DE_MESA: readonly {
  estado: EstadoDeMesa;
  texto: string;
  color: ColorDeInsignia;
  punto: string;
  caja: string;
}[] = [
  {
    estado: "libre",
    texto: "Libre",
    color: "verde",
    punto: "bg-hoja",
    caja: "border-hoja/30 bg-hoja/5",
  },
  {
    estado: "ocupada",
    texto: "Ocupada",
    color: "brasa",
    punto: "bg-brasa",
    caja: "border-brasa/40 bg-brasa/10",
  },
  {
    estado: "reservada",
    texto: "Reservada",
    color: "miel",
    punto: "bg-miel",
    caja: "border-miel/50 bg-miel/10",
  },
  {
    estado: "limpieza",
    texto: "Limpieza",
    color: "pizarra",
    punto: "bg-pizarra",
    caja: "border-pizarra/40 bg-pizarra/10",
  },
];

function estiloDeEstado(
  estado: EstadoDeMesa,
): (typeof ESTADOS_DE_MESA)[number] {
  const encontrado = ESTADOS_DE_MESA.find((item) => item.estado === estado);

  if (encontrado !== undefined) return encontrado;

  return {
    estado,
    texto: estado,
    color: "gris",
    punto: "bg-carbon",
    caja: "border-madera/20 bg-white",
  };
}

function colorDeReserva(estado: Reserva["estado"]): ColorDeInsignia {
  if (estado === "Pendiente") return "miel";
  if (estado === "Abierta") return "verde";
  return "gris";
}

function horaDeLlegada(iso: string | null): string {
  if (iso === null) return "";

  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";

  return fecha.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Leyenda() {
  return (
    <div
      role="list"
      aria-label="Leyenda de estados de las mesas"
      className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-madera"
    >
      {ESTADOS_DE_MESA.map((item) => (
        <div
          key={item.estado}
          role="listitem"
          className="flex items-center gap-1.5"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${item.punto}`}
            aria-hidden="true"
          />
          <span>{item.texto}</span>
        </div>
      ))}
    </div>
  );
}

function TarjetaDeMesa({
  mesa,
  seleccionada,
  alElegir,
}: {
  mesa: Mesa;
  seleccionada: boolean;
  alElegir: () => void;
}) {
  const estilo = estiloDeEstado(mesa.estado);
  const llegada = horaDeLlegada(mesa.hora_llegada);

  return (
    <button
      type="button"
      aria-pressed={seleccionada}
      aria-label={`Mesa ${mesa.numero}, ${mesa.zona}, ${estilo.texto}, capacidad ${mesa.capacidad}`}
      onClick={alElegir}
      className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa ${
        estilo.caja
      } ${seleccionada ? "ring-2 ring-brasa ring-offset-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-carbon">
            Mesa {mesa.numero}
          </p>
          <p className="text-xs text-madera">
            {mesa.zona}
            {!mesa.zona_activa && " (inactiva)"}
          </p>
        </div>

        <Insignia texto={estilo.texto} color={estilo.color} />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-madera">
        <Users size={14} aria-hidden="true" />
        <span>
          Capacidad para {mesa.capacidad}{" "}
          {mesa.capacidad === 1 ? "persona" : "personas"}
        </span>
      </div>

      {mesa.estado === "ocupada" && mesa.personas !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-carbon">
          <span>
            {mesa.personas} {mesa.personas === 1 ? "persona" : "personas"}
          </span>
          {llegada !== "" && (
            <span className="flex items-center gap-1 text-madera">
              <Clock size={13} aria-hidden="true" />
              Llegó a las {llegada}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function TarjetaDeReserva({
  reserva,
  alEditar,
  alCancelar,
  alAbrir,
  ocupado,
}: {
  reserva: Reserva;
  alEditar: () => void;
  alCancelar: () => void;
  alAbrir: () => void;
  ocupado: boolean;
}) {
  const pendiente = reserva.estado === "Pendiente";

  return (
    <li className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-crema px-3 py-2 text-center">
            <p className="text-base font-semibold text-carbon">
              {reserva.hora}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-madera">
              Hora
            </p>
          </div>

          <div>
            <p className="font-semibold text-carbon">
              {reserva.nombre_cliente}
            </p>
            <p className="mt-0.5 text-xs text-madera">
              Mesa {reserva.mesa_numero} · {reserva.zona} · {reserva.personas}{" "}
              {reserva.personas === 1 ? "persona" : "personas"}
            </p>
            <p className="mt-0.5 text-xs text-madera">{reserva.telefono}</p>
          </div>
        </div>

        <Insignia
          texto={reserva.estado}
          color={colorDeReserva(reserva.estado)}
        />
      </div>

      {reserva.estado === "Cancelada" &&
        reserva.motivo_cancelacion !== null && (
          <p className="mt-3 rounded-xl bg-crema px-3 py-2 text-xs text-madera">
            Motivo: {reserva.motivo_cancelacion}
          </p>
        )}

      {reserva.estado === "Abierta" && (
        <p className="mt-3 text-xs text-hoja">
          La mesa está ocupada desde que se abrió la reserva.
        </p>
      )}

      {pendiente && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-madera/10 pt-3">
          <Boton
            variante="secundario"
            icono={<Pencil size={15} aria-hidden="true" />}
            onClick={alEditar}
            disabled={ocupado}
          >
            Editar
          </Boton>

          <Boton
            variante="secundario"
            icono={<Ban size={15} aria-hidden="true" />}
            onClick={alCancelar}
            disabled={ocupado}
          >
            Cancelar
          </Boton>

          <Boton
            icono={<DoorOpen size={15} aria-hidden="true" />}
            onClick={alAbrir}
            disabled={ocupado}
          >
            Abrir reserva
          </Boton>
        </div>
      )}
    </li>
  );
}

export function Mesas() {
  const { puede } = useSesion();

  const [vista, setVista] = useState<Vista>("mapa");
  const [datos, setDatos] = useState<DatosDeMesas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const [fecha, setFecha] = useState(fechaDeHoy());
  const [reservas, setReservas] = useState<DatosDeReservas | null>(null);
  const [cargandoReservas, setCargandoReservas] = useState(true);
  const [errorDeReservas, setErrorDeReservas] = useState<string | null>(null);

  const [zonaFiltro, setZonaFiltro] = useState("todas");
  const [mesaSeleccionada, setMesaSeleccionada] = useState<number | null>(null);
  const [mesaParaLlegada, setMesaParaLlegada] = useState<Mesa | null>(null);

  const [modalReserva, setModalReserva] = useState<{
    reserva: Reserva | null;
  } | null>(null);
  const [reservaACancelar, setReservaACancelar] = useState<Reserva | null>(
    null,
  );
  const [reservaParaAbrir, setReservaParaAbrir] = useState<Reserva | null>(
    null,
  );
  const [modalZonas, setModalZonas] = useState(false);
  const [mesaConPedido, setMesaConPedido] = useState<number | null>(null);

  const [aviso, setAviso] = useState<string | null>(null);
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null);
  const [errorDeConfirmacion, setErrorDeConfirmacion] = useState<string | null>(
    null,
  );
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  const ocupado = accionEnCurso !== null;
  const puedeAsignar = puede("ASIGNAR_MESA");
  const puedeAdministrar = puede("ADMINISTRAR_MESAS");
  const puedeReservar = puede("GESTIONAR_RESERVA");

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const recibidos = await listarMesas();
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

  /*
    El plano se refresca solo cada 15 segundos para que una mesa que otro
    compañero ocupó o liberó se vea sin tocar nada. Se detiene mientras hay una
    acción en curso o una ventana abierta, para no pisar lo que se está
    haciendo. Si falla, se sigue viendo el último plano.
  */
  const hayVentana =
    mesaParaLlegada !== null ||
    modalReserva !== null ||
    reservaACancelar !== null ||
    reservaParaAbrir !== null ||
    modalZonas ||
    mesaConPedido !== null;

  useEffect(() => {
    if (vista !== "mapa" || accionEnCurso !== null || hayVentana) return;

    let vivo = true;

    const intervalo = window.setInterval(() => {
      void (async () => {
        try {
          const recibidos = await listarMesas();
          if (vivo) setDatos(recibidos);
        } catch {
          // Se queda con el último plano.
        }
      })();
    }, 15000);

    return () => {
      vivo = false;
      window.clearInterval(intervalo);
    };
  }, [vista, accionEnCurso, hayVentana]);

  useEffect(() => {
    if (vista !== "reservas") return;

    let vivo = true;
    setCargandoReservas(true);
    setErrorDeReservas(null);

    void (async () => {
      try {
        const recibidas = await listarReservas(fecha);
        if (vivo) {
          setReservas(recibidas);
          setErrorDeReservas(null);
        }
      } catch (fallo) {
        if (vivo) {
          setReservas(null);
          setErrorDeReservas(mensajeDeError(fallo));
        }
      } finally {
        if (vivo) setCargandoReservas(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [vista, fecha]);

  async function refrescarMapa(): Promise<void> {
    const recibidos = await listarMesas();
    setDatos(recibidos);
    setError(null);
  }

  async function refrescarReservas(): Promise<void> {
    const recibidas = await listarReservas(fecha);
    setReservas(recibidas);
    setErrorDeReservas(null);
  }

  /** El salón y la agenda comparten mesas: se refrescan juntos. */
  async function refrescarSalonYAgenda(): Promise<void> {
    await Promise.all([refrescarMapa(), refrescarReservas()]);
  }

  async function refrescarDespuesDeAccion(): Promise<void> {
    try {
      await Promise.all([refrescarMapa(), refrescarReservas()]);
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    }
  }

  function reintentarMapa(): void {
    setCargando(true);
    setError(null);

    void (async () => {
      try {
        setDatos(await listarMesas());
      } catch (fallo) {
        setError(mensajeDeError(fallo));
      } finally {
        setCargando(false);
      }
    })();
  }

  function reintentarReservas(): void {
    setCargandoReservas(true);
    setErrorDeReservas(null);

    void (async () => {
      try {
        setReservas(await listarReservas(fecha));
      } catch (fallo) {
        setReservas(null);
        setErrorDeReservas(mensajeDeError(fallo));
      } finally {
        setCargandoReservas(false);
      }
    })();
  }

  async function guardarReserva(
    entrada: DatosDelFormularioReserva,
  ): Promise<void> {
    if (entrada.modo === "crear") {
      const creada = await crearReserva(entrada.datos);
      setAviso(`Se creó la reserva de "${creada.nombre_cliente}".`);
    } else {
      const enEdicion = modalReserva?.reserva ?? null;

      if (enEdicion === null) {
        throw new Error("No se sabe qué reserva se está editando.");
      }

      const actualizada = await editarReserva(
        enEdicion.id_reserva,
        entrada.datos,
      );
      setAviso(`Se actualizó la reserva de "${actualizada.nombre_cliente}".`);
    }

    setModalReserva(null);
    await refrescarDespuesDeAccion();
  }

  async function cancelarLaReserva(motivo: string): Promise<void> {
    if (reservaACancelar === null) return;

    const cancelada = await cancelarReserva(
      reservaACancelar.id_reserva,
      motivo,
    );

    setReservaACancelar(null);
    setAviso(`Se canceló la reserva de "${cancelada.nombre_cliente}".`);
    await refrescarDespuesDeAccion();
  }

  async function abrirLaReserva(): Promise<void> {
    if (reservaParaAbrir === null || ocupado) return;

    setAccionEnCurso(`abrir-${reservaParaAbrir.id_reserva}`);
    setErrorDeConfirmacion(null);
    setErrorDeAccion(null);
    setAviso(null);

    try {
      const resultado = await abrirReserva(reservaParaAbrir.id_reserva);
      setReservaParaAbrir(null);
      setMesaSeleccionada(resultado.mesa.id_mesa);
      setAviso(
        `La reserva de "${resultado.reserva.nombre_cliente}" quedó abierta y la mesa ${resultado.mesa.numero} ocupada.`,
      );
      await refrescarDespuesDeAccion();
    } catch (fallo) {
      setErrorDeConfirmacion(mensajeDeError(fallo));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function ocuparLaMesa(personas: number): Promise<void> {
    if (mesaParaLlegada === null) return;

    const actualizada = await cambiarEstadoDeMesa(mesaParaLlegada.id_mesa, {
      estado: "ocupada",
      personas,
    });

    setMesaParaLlegada(null);
    setMesaSeleccionada(actualizada.id_mesa);
    setAviso(
      `La mesa ${actualizada.numero} quedó ocupada con ${personas} ${
        personas === 1 ? "persona" : "personas"
      }.`,
    );

    try {
      await refrescarMapa();
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    }
  }

  async function cambiarEstado(
    mesa: Mesa,
    cambio: CambioDeEstadoDeMesa,
  ): Promise<void> {
    if (ocupado) return;

    setAccionEnCurso(`estado-${mesa.id_mesa}`);
    setErrorDeAccion(null);
    setAviso(null);

    try {
      const actualizada = await cambiarEstadoDeMesa(mesa.id_mesa, cambio);
      setMesaSeleccionada(actualizada.id_mesa);
      setAviso(
        cambio.estado === "limpieza"
          ? `La mesa ${actualizada.numero} quedó en limpieza.`
          : `La mesa ${actualizada.numero} quedó libre.`,
      );

      try {
        await refrescarMapa();
      } catch (fallo) {
        setErrorDeAccion(mensajeDeError(fallo));
      }
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function actualizarMapa(): Promise<void> {
    setRefrescando(true);
    setErrorDeAccion(null);

    try {
      await refrescarMapa();
      setAviso("Mapa actualizado.");
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  if (cargando) {
    return <Cargando texto="Cargando el salón…" />;
  }

  if (datos === null) {
    return (
      <div>
        <EncabezadoPagina
          titulo="Mesas y reservas"
          subtitulo="El salón se carga desde el servidor."
        />

        <Alerta tipo="error" titulo="No se pudo cargar el salón">
          {error ?? "Ocurrió un error inesperado. Inténtalo otra vez."}
        </Alerta>

        <div className="mt-4">
          <Boton
            variante="secundario"
            onClick={reintentarMapa}
            icono={<RefreshCw size={16} aria-hidden="true" />}
          >
            Reintentar
          </Boton>
        </div>
      </div>
    );
  }

  const zonasVisibles = datos.zonas.filter(
    (zona) =>
      zona.activo || datos.mesas.some((mesa) => mesa.id_zona === zona.id_zona),
  );

  const opcionesDeZona: OpcionDePestana[] = [
    { valor: "todas", texto: "Todas" },
    ...zonasVisibles.map((zona) => ({
      valor: String(zona.id_zona),
      texto: zona.nombre,
    })),
  ];

  const zonaActiva = opcionesDeZona.some(
    (opcion) => opcion.valor === zonaFiltro,
  )
    ? zonaFiltro
    : "todas";

  const mesasVisibles = datos.mesas.filter(
    (mesa) => zonaActiva === "todas" || String(mesa.id_zona) === zonaActiva,
  );

  const mesaElegida =
    datos.mesas.find((mesa) => mesa.id_mesa === mesaSeleccionada) ?? null;

  const ocupadas = datos.mesas.filter(
    (mesa) => mesa.estado === "ocupada",
  ).length;
  const libres = datos.mesas.filter((mesa) => mesa.estado === "libre").length;
  const enLimpieza = datos.mesas.filter(
    (mesa) => mesa.estado === "limpieza",
  ).length;

  return (
    <div>
      <EncabezadoPagina
        titulo="Mesas y reservas"
        subtitulo="El plano del salón y la agenda de las reservas."
        acciones={
          <>
            <Boton
              variante="secundario"
              onClick={() => void actualizarMapa()}
              cargando={refrescando}
              textoDeCarga="Actualizando…"
              icono={<RefreshCw size={16} aria-hidden="true" />}
              disabled={ocupado}
            >
              Actualizar
            </Boton>

            {puedeAdministrar && (
              <Boton
                variante="secundario"
                onClick={() => setModalZonas(true)}
                icono={<Settings2 size={16} aria-hidden="true" />}
                disabled={ocupado}
              >
                Zonas y mesas
              </Boton>
            )}
          </>
        }
      />

      {puedeReservar && (
        <div className="mb-4">
          <Pestanas
            opciones={[
              { valor: "mapa", texto: "Mapa de mesas" },
              { valor: "reservas", texto: "Reservas" },
            ]}
            activa={vista}
            alCambiar={(valor) => {
              const nueva = valor as Vista;

              if (nueva === "reservas") setCargandoReservas(true);

              setVista(nueva);
              setErrorDeAccion(null);
              setAviso(null);
            }}
            etiqueta="Vista de mesas y reservas"
          />
        </div>
      )}

      {aviso !== null && (
        <div className="mb-4">
          <Alerta tipo="exito">{aviso}</Alerta>
        </div>
      )}

      {errorDeAccion !== null && (
        <div className="mb-4">
          <Alerta tipo="error">{errorDeAccion}</Alerta>
        </div>
      )}

      {vista === "mapa" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <Pestanas
              opciones={opcionesDeZona}
              activa={zonaActiva}
              alCambiar={(valor) => {
                setZonaFiltro(valor);
                setMesaSeleccionada(null);
              }}
              etiqueta="Filtrar mesas por zona"
            />

            <div className="flex flex-wrap gap-2 text-xs text-madera">
              <Insignia
                texto={`${libres} ${libres === 1 ? "libre" : "libres"}`}
                color="verde"
              />
              <Insignia
                texto={`${ocupadas} ${ocupadas === 1 ? "ocupada" : "ocupadas"}`}
                color="brasa"
              />
              <Insignia texto={`${enLimpieza} en limpieza`} color="pizarra" />
            </div>
          </div>

          <Leyenda />

          {mesasVisibles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-madera/20 bg-white px-4 py-10 text-center">
              <p className="text-sm text-madera">
                No hay mesas en esta zona.{" "}
                {puedeAdministrar
                  ? "Crea una desde “Zonas y mesas”."
                  : "Pide a gerencia que cree una."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {mesasVisibles.map((mesa) => (
                <TarjetaDeMesa
                  key={mesa.id_mesa}
                  mesa={mesa}
                  seleccionada={mesa.id_mesa === mesaSeleccionada}
                  alElegir={() => {
                    setMesaSeleccionada(mesa.id_mesa);
                    setErrorDeAccion(null);
                  }}
                />
              ))}
            </div>
          )}

          <section
            aria-label="Acciones de la mesa seleccionada"
            className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
          >
            {mesaElegida === null ? (
              <p className="text-sm text-madera">
                Elige una mesa del plano para ver sus datos y sus acciones.
              </p>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-carbon">
                      Mesa {mesaElegida.numero}
                    </h2>
                    <Insignia
                      texto={estiloDeEstado(mesaElegida.estado).texto}
                      color={estiloDeEstado(mesaElegida.estado).color}
                    />
                  </div>
                  <p className="mt-1 text-sm text-madera">
                    {mesaElegida.zona} · capacidad {mesaElegida.capacidad}
                    {mesaElegida.estado === "ocupada" &&
                      mesaElegida.personas !== null &&
                      ` · ${mesaElegida.personas} ${
                        mesaElegida.personas === 1 ? "persona" : "personas"
                      }`}
                  </p>
                </div>

                {puedeAsignar ? (
                  <div className="flex flex-wrap gap-2">
                    <Boton
                      variante="secundario"
                      icono={<Users size={16} aria-hidden="true" />}
                      onClick={() => setMesaParaLlegada(mesaElegida)}
                      disabled={
                        ocupado ||
                        mesaElegida.estado === "ocupada" ||
                        mesaElegida.estado === "limpieza"
                      }
                    >
                      Registrar llegada
                    </Boton>

                    {puede("CAPTURAR_PEDIDO") &&
                      mesaElegida.estado === "ocupada" && (
                        <Boton
                          onClick={() => setMesaConPedido(mesaElegida.numero)}
                        >
                          Tomar pedido
                        </Boton>
                      )}

                    <Boton
                      variante="secundario"
                      icono={<Sparkles size={16} aria-hidden="true" />}
                      onClick={() =>
                        void cambiarEstado(mesaElegida, { estado: "limpieza" })
                      }
                      disabled={ocupado || mesaElegida.estado === "limpieza"}
                    >
                      Marcar en limpieza
                    </Boton>

                    <Boton
                      variante="secundario"
                      icono={<Check size={16} aria-hidden="true" />}
                      onClick={() =>
                        void cambiarEstado(mesaElegida, { estado: "libre" })
                      }
                      disabled={ocupado || mesaElegida.estado === "libre"}
                    >
                      Liberar mesa
                    </Boton>
                  </div>
                ) : (
                  <p className="text-sm text-madera">
                    Tu rol puede ver el plano, pero no cambiar el estado de las
                    mesas.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:w-56">
                <Campo
                  etiqueta="Fecha de la agenda"
                  type="date"
                  value={fecha}
                  onChange={(evento) => setFecha(evento.target.value)}
                />
              </div>

              <Boton
                variante="secundario"
                onClick={() => setFecha(fechaDeHoy())}
                disabled={fecha === fechaDeHoy()}
              >
                Hoy
              </Boton>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-sm text-madera">
                {formatearFecha(fecha)}
              </p>

              {puedeReservar && (
                <Boton
                  icono={<CalendarPlus size={16} aria-hidden="true" />}
                  onClick={() => setModalReserva({ reserva: null })}
                  disabled={ocupado}
                >
                  Nueva reserva
                </Boton>
              )}
            </div>
          </div>

          {errorDeReservas !== null && (
            <Alerta tipo="error" titulo="No se pudo cargar la agenda">
              <p>{errorDeReservas}</p>
              <div className="mt-3">
                <Boton
                  variante="secundario"
                  onClick={reintentarReservas}
                  icono={<RefreshCw size={16} aria-hidden="true" />}
                >
                  Reintentar
                </Boton>
              </div>
            </Alerta>
          )}

          {cargandoReservas ? (
            <Cargando texto="Cargando las reservas…" />
          ) : reservas === null ? (
            errorDeReservas === null ? (
              <Cargando texto="Cargando las reservas…" />
            ) : null
          ) : reservas.reservas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-madera/20 bg-white px-4 py-10 text-center">
              <p className="text-sm text-madera">
                No hay reservas para {formatearFecha(fecha)}.
              </p>
              <div className="mt-3">
                {puedeReservar && (
                  <Boton
                    icono={<CalendarPlus size={16} aria-hidden="true" />}
                    onClick={() => setModalReserva({ reserva: null })}
                    disabled={ocupado}
                  >
                    Crear la primera
                  </Boton>
                )}
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {reservas.reservas.map((reserva) => (
                <TarjetaDeReserva
                  key={reserva.id_reserva}
                  reserva={reserva}
                  ocupado={ocupado}
                  alEditar={() => setModalReserva({ reserva })}
                  alCancelar={() => setReservaACancelar(reserva)}
                  alAbrir={() => {
                    setReservaParaAbrir(reserva);
                    setErrorDeConfirmacion(null);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {mesaParaLlegada !== null && (
        <ModalLlegada
          mesa={mesaParaLlegada}
          alCerrar={() => setMesaParaLlegada(null)}
          alOcupar={ocuparLaMesa}
        />
      )}

      {modalReserva !== null && (
        <ModalReserva
          reserva={modalReserva.reserva}
          mesas={datos.mesas}
          fechaInicial={fecha}
          alCerrar={() => setModalReserva(null)}
          alGuardar={guardarReserva}
        />
      )}

      {reservaACancelar !== null && (
        <ModalCancelarReserva
          reserva={reservaACancelar}
          alCerrar={() => setReservaACancelar(null)}
          alCancelar={cancelarLaReserva}
        />
      )}

      {reservaParaAbrir !== null && (
        <ModalConfirmacion
          titulo="Abrir reserva"
          mensaje={
            <>
              <p>
                La reserva de <strong>{reservaParaAbrir.nombre_cliente}</strong>{" "}
                pasará a abierta y la mesa {reservaParaAbrir.mesa_numero}{" "}
                quedará ocupada con {reservaParaAbrir.personas}{" "}
                {reservaParaAbrir.personas === 1 ? "persona" : "personas"}.
              </p>
              <p className="mt-2">
                Si la mesa está ocupada o en limpieza, el servidor no dejará
                abrirla.
              </p>
            </>
          }
          textoConfirmar="Abrir y ocupar mesa"
          procesando={accionEnCurso === `abrir-${reservaParaAbrir.id_reserva}`}
          error={errorDeConfirmacion}
          alConfirmar={() => void abrirLaReserva()}
          alCerrar={() => {
            if (accionEnCurso === null) {
              setReservaParaAbrir(null);
              setErrorDeConfirmacion(null);
            }
          }}
        />
      )}

      {modalZonas && (
        <ModalZonasMesas
          zonas={datos.zonas}
          mesas={datos.mesas}
          alCerrar={() => setModalZonas(false)}
          alRefrescar={refrescarSalonYAgenda}
        />
      )}

      {mesaConPedido !== null && (
        <Modal
          titulo={`Pedido de la mesa ${mesaConPedido}`}
          ancho="ancho"
          alCerrar={() => {
            setMesaConPedido(null);
            void refrescarMapa();
          }}
        >
          <Pedidos incrustado mesaInicial={mesaConPedido} />
        </Modal>
      )}
    </div>
  );
}
