/*
  Pedidos.tsx — los pedidos del local, todos juntos (Fase 5, módulo 1).
  ---------------------------------------------------------------------------

  La pantalla ya no pide que se busque una mesa: sale la lista completa de
  pedidos en tarjetas, con la mesa, el estado, la hora y el total (todo eso lo
  calcula la base). Con un clic en una tarjeta se abre ese pedido para
  agregarle líneas, mandarlo a cocina o ver cómo va.

  Los filtros (estado y fecha) son opcionales: sin ellos se ven todos los
  pedidos, hasta el más reciente.

  Para abrir un pedido en una mesa que todavía no tiene uno hay un apartado
  pequeño, abajo de los filtros. No es la forma normal de trabajar: la normal
  es ver la lista y tocar la mesa.
*/

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { obtenerSugerencias } from "../api/asistente";
import type { SugerenciasDelAsistente } from "../api/asistente";
import { mensajeDeError } from "../api/errores";
import {
  agregarLinea,
  anularLinea,
  enviarPedido,
  listarPedidos,
  obtenerPedidoDeMesa,
  abrirPedido,
  pedirLaCuenta,
  quitarLaCuenta,
} from "../api/pedidos";
import type { LineaDePedido, PedidoAbierto } from "../api/pedidos";
import { listarProductosDisponibles } from "../api/productos";
import type { Producto } from "../api/productos";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import type { ColorDeInsignia } from "../componentes/Insignia";
import { Selector } from "../componentes/Selector";
import { Tabla } from "../componentes/Tabla";
import type { Columna } from "../componentes/Tabla";
import { useSesion } from "../sesion/useSesion";
import { formatearDinero } from "../utilidades/formato";

/** El color del estado de una comanda. El texto siempre dice qué es. */
const COLOR_DE_COMANDA: Record<string, ColorDeInsignia> = {
  Pendiente: "miel",
  "En preparación": "brasa",
  Preparado: "verde",
  Cerrada: "gris",
};

/** El color del estado de un pedido. */
const COLOR_DE_PEDIDO: Record<string, ColorDeInsignia> = {
  Abierto: "miel",
  Enviado: "brasa",
  Cerrado: "gris",
  Anulado: "rojo",
};

const ESTADOS_DE_PEDIDO = ["Todos", "Abierto", "Enviado", "Cerrado", "Anulado"];

interface PedidosProps {
  /**
   * Cuando se usa dentro de otra pantalla (el salón), se pasa la mesa y se
   * muestra solo el pedido de esa mesa: sin cabecera, sin filtros y sin la
   * lista de todos los pedidos.
   */
  mesaInicial?: number;
  incrustado?: boolean;
}

export function Pedidos({
  mesaInicial,
  incrustado = false,
}: PedidosProps = {}) {
  const { puede } = useSesion();
  const [parametros] = useSearchParams();
  // Desde Mesas se llega con /pedidos?mesa=N: ese pedido se abre solo.
  const mesaDeLaUrl = mesaInicial ?? Number(parametros.get("mesa"));

  // La lista de todos los pedidos.
  const [pedidos, setPedidos] = useState<PedidoAbierto[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroFecha, setFiltroFecha] = useState("");

  // El pedido que se está trabajando.
  const [mesaSeleccionada, setMesaSeleccionada] = useState<number | null>(null);
  const [pedido, setPedido] = useState<PedidoAbierto | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cambiandoCuenta, setCambiandoCuenta] = useState(false);
  const [lineaParaAnular, setLineaParaAnular] = useState<LineaDePedido | null>(
    null,
  );
  const panelDelPedido = useRef<HTMLDivElement | null>(null);

  // Para abrir un pedido en una mesa que todavía no tiene uno.
  const [mesaParaAbrir, setMesaParaAbrir] = useState("");
  const [comensalesParaAbrir, setComensalesParaAbrir] = useState("2");

  // formulario de nueva línea
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [observacion, setObservacion] = useState("");
  const [persona, setPersona] = useState("1");

  // Sugerencias del asistente (Fase 8). Solo para quien tiene VER_ASISTENTE.
  const [sugerencias, setSugerencias] =
    useState<SugerenciasDelAsistente | null>(null);
  const [pidiendoSugerencias, setPidiendoSugerencias] = useState(false);
  const [errorSugerencias, setErrorSugerencias] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargandoLista(true);

      try {
        const lista = await listarPedidos({
          estado: filtroEstado,
          fecha: filtroFecha,
        });
        if (!vigente) return;
        setPedidos(lista);
        setError(null);
      } catch (fallo) {
        if (vigente) setError(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargandoLista(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [filtroEstado, filtroFecha]);

  useEffect(() => {
    let vigente = true;

    async function cargarProductos() {
      try {
        const disponibles = await listarProductosDisponibles();
        if (vigente) setProductos(disponibles.productos);
      } catch {
        // Si no se pueden ver los productos, el resto de la pantalla sigue viva.
      }
    }

    void cargarProductos();

    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (Number.isInteger(mesaDeLaUrl) && mesaDeLaUrl > 0) {
      void seleccionar(mesaDeLaUrl);
    }
    // Solo cuando cambia la mesa de la dirección.
  }, [mesaDeLaUrl]);

  /*
    Los pedidos se refrescan solos cada 10 segundos: así el mesero ve que cocina
    marcó algo como preparado sin tocar nada. Se detiene mientras hay una acción
    o una confirmación en curso, para no pisarla. Si falla, se sigue viendo lo
    anterior.
  */
  useEffect(() => {
    if (enviando || cambiandoCuenta || lineaParaAnular !== null) {
      return undefined;
    }

    let vigente = true;

    const intervalo = window.setInterval(() => {
      void (async () => {
        try {
          const lista = await listarPedidos({
            estado: filtroEstado,
            fecha: filtroFecha,
          });
          if (!vigente) return;
          setPedidos(lista);

          if (mesaSeleccionada !== null) {
            const actual = await obtenerPedidoDeMesa(mesaSeleccionada);
            if (vigente) setPedido(actual);
          }
        } catch {
          // Si el refresco falla, la pantalla sigue mostrando lo anterior.
        }
      })();
    }, 10000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [
    filtroEstado,
    filtroFecha,
    mesaSeleccionada,
    enviando,
    cambiandoCuenta,
    lineaParaAnular,
  ]);

  async function seleccionar(mesa: number) {
    setMesaSeleccionada(mesa);
    setCargando(true);
    setError(null);
    setSugerencias(null);

    try {
      setPedido(await obtenerPedidoDeMesa(mesa));
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargando(false);
      // El pedido se abre debajo de la lista: se lleva a la vista.
      window.setTimeout(() => {
        panelDelPedido.current?.scrollIntoView?.({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  }

  /**
   * Abre un pedido. Sin argumento usa la mesa escrita en el apartado "Abrir un
   * pedido en otra mesa"; con argumento (la mesa que ya se eligió) no pide
   * escribirla otra vez.
   */
  async function abrir(mesaElegida?: number) {
    const mesa = mesaElegida ?? Number(mesaParaAbrir);

    if (!Number.isInteger(mesa) || mesa <= 0) {
      setError("Escribe el número de la mesa.");
      return;
    }

    setEnviando(true);
    setAviso(null);
    setError(null);

    try {
      const resultado = await abrirPedido(
        mesa,
        Number(comensalesParaAbrir) || 1,
      );
      setPedido(resultado.pedido);
      setMesaSeleccionada(mesa);
      setAviso(resultado.mensaje);
      setMesaParaAbrir("");
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Recarga la lista después de una acción. Si la recarga falla, la acción ya
   * se guardó: se avisa aparte y no se presenta como si hubiera fallado.
   */
  async function refrescarLista() {
    try {
      setPedidos(
        await listarPedidos({ estado: filtroEstado, fecha: filtroFecha }),
      );
    } catch {
      setError(
        "Se guardó el cambio, pero no se pudo actualizar la lista. Cambia un filtro o espera unos segundos.",
      );
    }
  }

  async function agregar() {
    if (productoId === "" || mesaSeleccionada === null) return;
    setEnviando(true);
    setAviso(null);
    setError(null);
    try {
      const resultado = await agregarLinea(
        mesaSeleccionada,
        Number(productoId),
        Number(cantidad) || 1,
        observacion,
        Number(persona) || 1,
      );
      setPedido(resultado.pedido);
      setProductoId("");
      setCantidad("1");
      setObservacion("");
      setAviso("Línea agregada al pedido.");
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function pedirSugerencias() {
    if (mesaSeleccionada === null) return;

    setPidiendoSugerencias(true);
    setErrorSugerencias(null);
    setSugerencias(null);

    try {
      setSugerencias(await obtenerSugerencias(mesaSeleccionada));
    } catch (fallo) {
      setErrorSugerencias(mensajeDeError(fallo));
    } finally {
      setPidiendoSugerencias(false);
    }
  }

  async function agregarSugerencia(productoId: number) {
    if (mesaSeleccionada === null) return;

    setEnviando(true);
    setAviso(null);
    setError(null);

    try {
      const resultado = await agregarLinea(
        mesaSeleccionada,
        productoId,
        1,
        "",
        1,
      );
      setPedido(resultado.pedido);
      setAviso("Línea agregada al pedido.");
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function anular(idLinea: number) {
    if (mesaSeleccionada === null) return;

    setEnviando(true);
    setAviso(null);
    setError(null);
    try {
      await anularLinea(idLinea);
      setPedido(await obtenerPedidoDeMesa(mesaSeleccionada));
      setAviso("Línea anulada.");
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function enviar() {
    if (mesaSeleccionada === null) return;

    setEnviando(true);
    setAviso(null);
    setError(null);
    try {
      const resultado = await enviarPedido(mesaSeleccionada);
      setAviso(resultado.mensaje);
      setPedido(await obtenerPedidoDeMesa(mesaSeleccionada));
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function pedirCuenta() {
    if (mesaSeleccionada === null || pedido === null) return;

    setCambiandoCuenta(true);
    setAviso(null);
    setError(null);
    try {
      const resultado = await pedirLaCuenta(mesaSeleccionada);
      setPedido(resultado.pedido);
      setAviso(resultado.mensaje);
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCambiandoCuenta(false);
    }
  }

  async function quitarCuenta() {
    if (mesaSeleccionada === null || pedido === null) return;

    setCambiandoCuenta(true);
    setAviso(null);
    setError(null);
    try {
      const resultado = await quitarLaCuenta(mesaSeleccionada);
      setPedido(resultado.pedido);
      setAviso(resultado.mensaje);
      await refrescarLista();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCambiandoCuenta(false);
    }
  }

  // Un pedido cerrado o anulado ya no admite cambios.
  const editable = pedido?.estado === "Abierto" || pedido?.estado === "Enviado";

  const columnas: readonly Columna<LineaDePedido>[] = [
    {
      clave: "producto",
      encabezado: "Producto",
      render: (linea) => (
        <span className="font-medium text-carbon">{linea.nombre}</span>
      ),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      render: (linea) => linea.cantidad,
    },
    {
      clave: "precio",
      encabezado: "Precio",
      alinear: "derecha",
      render: (linea) => `RD$ ${linea.precio.toFixed(2)}`,
    },
    {
      clave: "persona",
      encabezado: "Comensal",
      alinear: "derecha",
      render: (linea) => linea.persona,
    },
    {
      clave: "observacion",
      encabezado: "Observación",
      render: (linea) => linea.observacion || "—",
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (linea) => linea.estado,
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      render: (linea) =>
        linea.estado === "Guardada" && editable ? (
          <Boton
            variante="peligro"
            onClick={() => setLineaParaAnular(linea)}
            disabled={enviando}
          >
            Anular
          </Boton>
        ) : null,
    },
  ];

  return (
    <div>
      {!incrustado && (
        <EncabezadoPagina
          titulo="Pedidos"
          subtitulo="Todos los pedidos del local, juntos. Toca uno para atenderlo."
        />
      )}

      <div className="space-y-4">
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar">
            {error}
          </Alerta>
        )}

        {!incrustado && (
          <>
            <div className="grid gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:grid-cols-3">
              <Selector
                etiqueta="Estado"
                value={filtroEstado}
                onChange={(evento) => setFiltroEstado(evento.target.value)}
                opciones={ESTADOS_DE_PEDIDO.map((estado) => ({
                  valor: estado,
                  texto: estado,
                }))}
              />
              <Campo
                etiqueta="Fecha"
                type="date"
                value={filtroFecha}
                onChange={(evento) => setFiltroFecha(evento.target.value)}
                ayuda="Vacío = todos los días."
              />
              <div className="flex items-end">
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setFiltroEstado("Todos");
                    setFiltroFecha("");
                  }}
                  disabled={filtroEstado === "Todos" && filtroFecha === ""}
                >
                  Quitar filtros
                </Boton>
              </div>
            </div>

            {cargandoLista ? (
              <Cargando texto="Cargando los pedidos…" />
            ) : pedidos.length === 0 ? (
              <Alerta tipo="info">No hay pedidos que cumplan el filtro.</Alerta>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pedidos.map((pedidoDeLaLista) => {
                  const elegido = pedidoDeLaLista.mesa === mesaSeleccionada;

                  return (
                    <li key={pedidoDeLaLista.id_pedido}>
                      <button
                        type="button"
                        onClick={() => void seleccionar(pedidoDeLaLista.mesa)}
                        aria-pressed={elegido}
                        className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                          elegido
                            ? "border-brasa bg-crema/70"
                            : "border-madera/10 bg-white hover:border-madera/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-lg font-semibold text-carbon">
                            Mesa {pedidoDeLaLista.mesa}
                          </p>
                          <Insignia
                            texto={pedidoDeLaLista.estado}
                            color={
                              COLOR_DE_PEDIDO[pedidoDeLaLista.estado] ?? "gris"
                            }
                          />
                          {pedidoDeLaLista.cuenta_pedida_en !== null && (
                            <Insignia texto="Cuenta pedida" color="miel" />
                          )}
                        </div>

                        <p className="mt-1 text-sm text-madera">
                          {pedidoDeLaLista.mesero}
                        </p>
                        <p className="text-xs text-madera">
                          Abrió a las <span>{pedidoDeLaLista.hora}</span>
                        </p>

                        <p className="mt-2 text-base font-semibold text-carbon">
                          {formatearDinero(pedidoDeLaLista.total)}
                        </p>
                        <p className="text-xs text-madera/70">
                          {pedidoDeLaLista.lineas.length} línea
                          {pedidoDeLaLista.lineas.length === 1 ? "" : "s"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Abrir un pedido en otra mesa
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <Campo
                  etiqueta="Mesa"
                  type="number"
                  min={1}
                  value={mesaParaAbrir}
                  onChange={(evento) => setMesaParaAbrir(evento.target.value)}
                />
                <Campo
                  etiqueta="Comensales"
                  type="number"
                  min={1}
                  value={comensalesParaAbrir}
                  onChange={(evento) =>
                    setComensalesParaAbrir(evento.target.value)
                  }
                />
                <Boton
                  onClick={() => void abrir()}
                  cargando={enviando}
                  disabled={mesaParaAbrir === ""}
                >
                  Abrir pedido
                </Boton>
              </div>
            </div>
          </>
        )}

        {mesaSeleccionada === null ? (
          <p className="text-sm text-madera">
            Toca una tarjeta para trabajar ese pedido.
          </p>
        ) : cargando ? (
          <Cargando texto="Cargando el pedido…" />
        ) : pedido === null ? (
          <div className="space-y-3">
            <p className="text-sm text-madera">
              La mesa {mesaSeleccionada} no tiene un pedido abierto.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Campo
                etiqueta="Comensales"
                type="number"
                min={1}
                value={comensalesParaAbrir}
                onChange={(evento) =>
                  setComensalesParaAbrir(evento.target.value)
                }
              />
              <Boton
                onClick={() => void abrir(mesaSeleccionada)}
                cargando={enviando}
              >
                Abrir pedido
              </Boton>
            </div>
          </div>
        ) : (
          <div ref={panelDelPedido} className="space-y-4">
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <p className="text-sm text-madera">
                Pedido #{pedido.id_pedido} · Mesero: {pedido.mesero} ·{" "}
                {pedido.hora} · Estado: {pedido.estado} · Total:{" "}
                {formatearDinero(pedido.total)}
              </p>
            </div>

            <Tabla
              titulo="Líneas del pedido"
              columnas={columnas}
              filas={pedido.lineas}
              claveDeFila={(linea) => linea.id}
              vacio="No hay líneas en este pedido."
            />

            {puede("VER_ASISTENTE") && (
              <section className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-carbon">
                    Sugerencias del asistente
                  </h2>
                  <Boton
                    variante="secundario"
                    onClick={() => void pedirSugerencias()}
                    cargando={pidiendoSugerencias}
                    textoDeCarga="Consultando…"
                  >
                    Pedir sugerencias
                  </Boton>
                </div>

                {errorSugerencias !== null && (
                  <Alerta tipo="error">{errorSugerencias}</Alerta>
                )}

                {sugerencias === null ? (
                  <p className="text-sm text-madera">
                    Pídele al asistente qué encaja con lo que pidió la mesa.
                  </p>
                ) : (
                  <>
                    {sugerencias.aviso !== null && (
                      <Alerta tipo="info">{sugerencias.aviso}</Alerta>
                    )}

                    {sugerencias.sugerencias.length === 0 ? (
                      <p className="text-sm text-madera">
                        No hay sugerencias para esta mesa.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sugerencias.sugerencias.map((sugerencia) => (
                          <li
                            key={sugerencia.productoId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-crema/60 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-carbon">
                                {sugerencia.nombre}
                              </p>
                              <p className="text-xs text-madera">
                                {sugerencia.motivo} ·{" "}
                                {formatearDinero(sugerencia.precio)} ·{" "}
                                {sugerencia.minutos === null
                                  ? "sin tiempo estimado"
                                  : `${sugerencia.minutos} min`}
                              </p>
                            </div>
                            <Boton
                              variante="secundario"
                              disabled={enviando}
                              onClick={() =>
                                void agregarSugerencia(sugerencia.productoId)
                              }
                            >
                              Agregar al pedido
                            </Boton>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            )}

            {pedido.comandas.length > 0 && (
              <section className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-carbon">
                  Seguimiento en cocina
                </h2>
                <ul className="space-y-3">
                  {pedido.comandas.map((comanda) => (
                    <li
                      key={comanda.id_comanda}
                      aria-label={`Comanda ${comanda.numero}`}
                      className="rounded-xl bg-crema/60 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-carbon">
                          Comanda {comanda.numero} · {comanda.estacion} ·
                          enviada {comanda.enviada}
                        </p>
                        <Insignia
                          texto={comanda.estado}
                          color={COLOR_DE_COMANDA[comanda.estado] ?? "gris"}
                        />
                      </div>
                      <ul className="mt-2 space-y-1">
                        {comanda.lineas.map((linea, indice) => (
                          <li
                            key={`${comanda.id_comanda}-${linea.producto}-${indice}`}
                            className="flex justify-between gap-2 text-xs text-madera"
                          >
                            <span>
                              {linea.cantidad} × {linea.producto}
                            </span>
                            <span>{linea.estado}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {editable ? (
              <>
                <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-carbon">
                    Agregar producto
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_6rem_6rem_3fr_auto] lg:items-end">
                    <Selector
                      etiqueta="Producto"
                      value={productoId}
                      onChange={(e) => setProductoId(e.target.value)}
                      marcador="Elige un producto…"
                      opciones={productos.map((p) => ({
                        valor: p.id_producto,
                        texto: `${p.nombre} — RD$ ${p.precio.toFixed(2)}`,
                      }))}
                    />
                    <Campo
                      etiqueta="Cantidad"
                      type="number"
                      min={1}
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                    />
                    <Campo
                      etiqueta="Comensal"
                      type="number"
                      min={1}
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                    />
                    <Campo
                      etiqueta="Observación"
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      placeholder="Ej.: sin cebolla"
                    />
                    <Boton
                      onClick={() => void agregar()}
                      cargando={enviando}
                      disabled={productoId === ""}
                    >
                      Agregar
                    </Boton>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Boton
                    onClick={() => void enviar()}
                    cargando={enviando}
                    disabled={
                      !pedido.lineas.some(
                        (linea) => linea.estado === "Guardada",
                      )
                    }
                    title={
                      pedido.lineas.some((linea) => linea.estado === "Guardada")
                        ? undefined
                        : "No hay líneas nuevas para mandar a cocina."
                    }
                  >
                    Enviar a cocina
                  </Boton>
                </div>
              </>
            ) : (
              <Alerta tipo="info">
                Este pedido está {pedido.estado.toLowerCase()}: ya no se puede
                modificar.
              </Alerta>
            )}

            <section className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-carbon">Cuenta</h2>
                  <p className="mt-1 text-sm text-madera">
                    {pedido.cuenta_pedida_en !== null
                      ? "La mesa ya avisó que quiere la cuenta. El cajero la ve en su lista."
                      : "Cuando el cliente pida la cuenta, avísale al cajero desde aquí."}
                  </p>
                </div>
                {pedido.cuenta_pedida_en !== null ? (
                  <Boton
                    variante="secundario"
                    cargando={cambiandoCuenta}
                    textoDeCarga="Quitando..."
                    onClick={() => void quitarCuenta()}
                  >
                    Quitar pedido de cuenta
                  </Boton>
                ) : (
                  <Boton
                    cargando={cambiandoCuenta}
                    textoDeCarga="Pidiendo..."
                    disabled={
                      cambiandoCuenta ||
                      pedido.lineas.length === 0 ||
                      pedido.lineas.some((linea) => linea.estado === "Guardada")
                    }
                    title={
                      pedido.lineas.some((linea) => linea.estado === "Guardada")
                        ? "Envía primero todo el consumo a cocina."
                        : pedido.lineas.length === 0
                          ? "La mesa no tiene consumo enviado."
                          : undefined
                    }
                    onClick={() => void pedirCuenta()}
                  >
                    Pedir cuenta
                  </Boton>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {lineaParaAnular !== null && (
        <ModalConfirmacion
          titulo="¿Anular esta línea?"
          peligroso
          textoConfirmar="Sí, anular"
          procesando={enviando}
          mensaje={
            <p>
              Se va a anular {lineaParaAnular.cantidad} ×{" "}
              <strong>{lineaParaAnular.nombre}</strong> del pedido.
            </p>
          }
          alConfirmar={() => {
            const id = lineaParaAnular.id;
            void anular(id).then(() => setLineaParaAnular(null));
          }}
          alCerrar={() => setLineaParaAnular(null)}
        />
      )}
    </div>
  );
}
