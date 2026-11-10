/*
  Cocina.tsx — el tablero de comandas y la disponibilidad (Fase 5, módulo 2).
  ---------------------------------------------------------------------------

  Dos vistas, con permisos distintos:

    · Comandas: lo que el mesero envió, separado por estación. Cada comanda
      avanza en un solo sentido: Pendiente → En preparación → Preparado.
    · Disponibilidad: los productos activos, para marcarlos agotados o
      reponerlos. Es la operación 28 (`REPORTAR_AGOTADO`), que el dueño aprobó
      el 19 de octubre de 2026.

  El servidor vuelve a comprobar los dos permisos. La pantalla solo esconde lo
  que el rol no puede hacer; no es la seguridad.

  Las acciones no inventan estados: después de cada una se usa la respuesta del
  servidor, que es la que salió de PostgreSQL.
*/

import {
  CheckCircle2,
  Flame,
  RefreshCw,
  Search,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  cambiarDisponibilidadDeProducto,
  iniciarComanda,
  listarComandas,
  listarEstacionesDeCocina,
  listarProductosDeCocina,
  prepararComanda,
} from "../api/cocina";
import type {
  Comanda,
  EstadoDeComanda,
  EstacionConPendientes,
  ProductoDeCocina,
} from "../api/cocina";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import type { ColorDeInsignia } from "../componentes/Insignia";
import { useSesion } from "../sesion/useSesion";

const COLOR_DE_ESTADO: Record<EstadoDeComanda, ColorDeInsignia> = {
  Pendiente: "miel",
  "En preparación": "brasa",
  Preparado: "verde",
  Cerrada: "gris",
};

/** La hora local de un instante ISO, para saber cuándo entró la comanda. */
function horaDe(instante: string): string {
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return instante;

  return new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

export function Cocina() {
  const { puede } = useSesion();
  const puedeConfirmar = puede("CONFIRMAR_PREPARACION");
  const puedeReportar = puede("REPORTAR_AGOTADO");

  const [vista, setVista] = useState<"comandas" | "disponibilidad">("comandas");

  const [estaciones, setEstaciones] = useState<EstacionConPendientes[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [filtro, setFiltro] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<number | null>(null);

  const [productos, setProductos] = useState<ProductoDeCocina[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [refrescandoProductos, setRefrescandoProductos] = useState(false);
  const [productoEnCurso, setProductoEnCurso] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      try {
        const [listaEstaciones, listaComandas] = await Promise.all([
          listarEstacionesDeCocina(),
          listarComandas(filtro ?? undefined),
        ]);

        if (!vigente) return;

        setEstaciones(listaEstaciones);
        setComandas(listaComandas);
        setError(null);
      } catch (fallo) {
        if (vigente) setError(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargando(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [filtro]);

  /*
    El tablero se refresca solo: una comanda nueva tiene que aparecer en pocos
    segundos sin que nadie toque "Refrescar". Es silencioso: si falla, se sigue
    viendo lo anterior. No corre mientras se ejecuta una acción ni en la otra
    vista, para no pisar lo que la persona está haciendo.
  */
  useEffect(() => {
    if (vista !== "comandas" || accionEnCurso !== null) return undefined;

    let vigente = true;

    const intervalo = window.setInterval(() => {
      void (async () => {
        try {
          const [listaEstaciones, listaComandas] = await Promise.all([
            listarEstacionesDeCocina(),
            listarComandas(filtro ?? undefined),
          ]);
          if (!vigente) return;
          setEstaciones(listaEstaciones);
          setComandas(listaComandas);
        } catch {
          // Si el refresco falla, la pantalla sigue mostrando lo anterior.
        }
      })();
    }, 8000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [vista, filtro, accionEnCurso]);

  useEffect(() => {
    if (vista !== "disponibilidad") return undefined;

    let vigente = true;

    async function cargar() {
      setCargandoProductos(true);
      try {
        const lista = await listarProductosDeCocina();
        if (!vigente) return;

        setProductos(lista);
        setError(null);
      } catch (fallo) {
        if (vigente) setError(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargandoProductos(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [vista]);

  async function refrescarComandas() {
    setRefrescando(true);
    setError(null);
    try {
      const [listaEstaciones, listaComandas] = await Promise.all([
        listarEstacionesDeCocina(),
        listarComandas(filtro ?? undefined),
      ]);
      setEstaciones(listaEstaciones);
      setComandas(listaComandas);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  async function refrescarProductos() {
    setRefrescandoProductos(true);
    setError(null);
    try {
      setProductos(await listarProductosDeCocina());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescandoProductos(false);
    }
  }

  async function avanzar(comanda: Comanda, accion: "iniciar" | "preparar") {
    setAccionEnCurso(comanda.id_comanda);
    setError(null);
    setAviso(null);

    try {
      const resultado =
        accion === "iniciar"
          ? await iniciarComanda(comanda.id_comanda)
          : await prepararComanda(comanda.id_comanda);

      setComandas((actuales) =>
        actuales.map((actual) =>
          actual.id_comanda === resultado.comanda.id_comanda
            ? resultado.comanda
            : actual,
        ),
      );

      const listaEstaciones = await listarEstacionesDeCocina();
      setEstaciones(listaEstaciones);
      setAviso(resultado.mensaje);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function cambiarDisponibilidad(producto: ProductoDeCocina) {
    setProductoEnCurso(producto.id_producto);
    setError(null);
    setAviso(null);

    try {
      const resultado = await cambiarDisponibilidadDeProducto(
        producto.id_producto,
        !producto.disponible,
      );

      setProductos((actuales) =>
        actuales.map((actual) =>
          actual.id_producto === resultado.producto.id_producto
            ? { ...actual, disponible: resultado.producto.disponible }
            : actual,
        ),
      );
      setAviso(resultado.mensaje);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setProductoEnCurso(null);
    }
  }

  if (cargando) {
    return <Cargando texto="Cargando las comandas…" />;
  }

  const productosFiltrados = productos.filter((producto) =>
    `${producto.nombre} ${producto.categoria} ${producto.estacion}`
      .toLowerCase()
      .includes(busqueda.trim().toLowerCase()),
  );

  return (
    <div>
      <EncabezadoPagina
        titulo="Cocina"
        subtitulo="Las comandas que van saliendo y lo que se agotó hoy."
      />

      <div className="space-y-5">
        <div
          className="flex gap-2 border-b border-madera/10"
          role="tablist"
          aria-label="Vistas de cocina"
        >
          <button
            type="button"
            role="tab"
            aria-selected={vista === "comandas"}
            onClick={() => {
              setVista("comandas");
              setAviso(null);
              setError(null);
            }}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              vista === "comandas"
                ? "border-brasa text-brasa"
                : "border-transparent text-madera hover:text-carbon"
            }`}
          >
            Comandas
          </button>
          {puedeReportar && (
            <button
              type="button"
              role="tab"
              aria-selected={vista === "disponibilidad"}
              onClick={() => {
                setVista("disponibilidad");
                setAviso(null);
                setError(null);
              }}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                vista === "disponibilidad"
                  ? "border-brasa text-brasa"
                  : "border-transparent text-madera hover:text-carbon"
              }`}
            >
              Disponibilidad
            </button>
          )}
        </div>

        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar la cocina">
            {error}
          </Alerta>
        )}

        {vista === "comandas" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filtrar por estación"
              >
                <button
                  type="button"
                  onClick={() => setFiltro(null)}
                  aria-pressed={filtro === null}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    filtro === null
                      ? "bg-brasa text-white"
                      : "border border-madera/20 bg-white text-carbon hover:bg-crema"
                  }`}
                >
                  Todas
                </button>
                {estaciones.map((estacion) => (
                  <button
                    key={estacion.id_estacion}
                    type="button"
                    onClick={() => setFiltro(estacion.id_estacion)}
                    aria-pressed={filtro === estacion.id_estacion}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      filtro === estacion.id_estacion
                        ? "bg-brasa text-white"
                        : "border border-madera/20 bg-white text-carbon hover:bg-crema"
                    }`}
                  >
                    {estacion.nombre}
                    {estacion.pendientes > 0 && (
                      <span className="ml-2 rounded-full bg-white/20 px-1.5 text-xs">
                        {estacion.pendientes}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <Boton
                variante="secundario"
                onClick={() => void refrescarComandas()}
                cargando={refrescando}
                icono={<RefreshCw size={16} aria-hidden="true" />}
              >
                Refrescar
              </Boton>
            </div>

            {comandas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-madera/25 bg-white p-8 text-center">
                <Utensils
                  size={28}
                  className="mx-auto mb-2 text-madera/50"
                  aria-hidden="true"
                />
                <p className="text-sm text-madera">
                  No hay comandas activas
                  {filtro === null ? "" : " en esta estación"}. Cuando el mesero
                  envíe un pedido, aparecerá aquí.
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {comandas.map((comanda) => (
                  <li
                    key={comanda.id_comanda}
                    aria-label={`Comanda ${comanda.numero} de la mesa ${comanda.mesa}`}
                    className="flex flex-col rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold text-carbon">
                          Comanda {comanda.numero}
                        </p>
                        <p className="text-sm text-madera">
                          Mesa {comanda.mesa} · {comanda.mesero}
                        </p>
                        <p className="text-xs text-madera/80">
                          {comanda.estacion} · enviada a las{" "}
                          {horaDe(comanda.enviada_en)}
                        </p>
                      </div>
                      <Insignia
                        texto={comanda.estado}
                        color={COLOR_DE_ESTADO[comanda.estado]}
                      />
                    </div>

                    <ul className="mb-4 flex-1 space-y-2">
                      {comanda.lineas.map((linea) => (
                        <li
                          key={linea.id}
                          className="rounded-xl bg-crema/60 px-3 py-2 text-sm"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-carbon">
                              {linea.cantidad} × {linea.producto}
                            </span>
                            <span className="text-xs text-madera">
                              Comensal {linea.comensal}
                            </span>
                          </div>
                          {linea.observacion !== "" && (
                            <p className="mt-1 text-xs text-ladrillo">
                              {linea.observacion}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    {comanda.estado === "Pendiente" && puedeConfirmar && (
                      <Boton
                        onClick={() => void avanzar(comanda, "iniciar")}
                        cargando={accionEnCurso === comanda.id_comanda}
                        textoDeCarga="Empezando…"
                        icono={<Flame size={16} aria-hidden="true" />}
                        aria-label={`Empezar la comanda ${comanda.numero}`}
                        anchoCompleto
                      >
                        Empezar
                      </Boton>
                    )}

                    {comanda.estado === "En preparación" && puedeConfirmar && (
                      <Boton
                        onClick={() => void avanzar(comanda, "preparar")}
                        cargando={accionEnCurso === comanda.id_comanda}
                        textoDeCarga="Avisando…"
                        icono={<CheckCircle2 size={16} aria-hidden="true" />}
                        aria-label={`Marcar lista la comanda ${comanda.numero}`}
                        anchoCompleto
                      >
                        Listo
                      </Boton>
                    )}

                    {comanda.estado === "Preparado" && (
                      <p className="rounded-xl bg-hoja/10 px-3 py-2 text-center text-sm font-medium text-hoja">
                        Lista para servir
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="relative flex-1 md:max-w-sm">
                <span className="sr-only">Buscar producto</span>
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-madera/60"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar producto…"
                  className="w-full rounded-xl border border-madera/20 py-2 pl-9 pr-3 text-sm"
                />
              </label>

              <Boton
                variante="secundario"
                onClick={() => void refrescarProductos()}
                cargando={refrescandoProductos}
                icono={<RefreshCw size={16} aria-hidden="true" />}
              >
                Refrescar
              </Boton>
            </div>

            {cargandoProductos ? (
              <Cargando texto="Cargando los productos…" />
            ) : productosFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-madera/25 bg-white p-8 text-center">
                <p className="text-sm text-madera">
                  No hay productos que coincidan con la búsqueda.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {productosFiltrados.map((producto) => (
                  <li
                    key={producto.id_producto}
                    aria-label={`Producto ${producto.nombre}`}
                    className="flex flex-col rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-carbon">
                          {producto.nombre}
                        </p>
                        <p className="text-xs text-madera">
                          {producto.categoria} · {producto.estacion}
                        </p>
                      </div>
                      <Insignia
                        texto={producto.disponible ? "Disponible" : "Agotado"}
                        color={producto.disponible ? "verde" : "rojo"}
                      />
                    </div>

                    <Boton
                      variante={producto.disponible ? "peligro" : "primario"}
                      onClick={() => void cambiarDisponibilidad(producto)}
                      cargando={productoEnCurso === producto.id_producto}
                      textoDeCarga={
                        producto.disponible ? "Marcando…" : "Reponiendo…"
                      }
                      aria-label={
                        producto.disponible
                          ? `Marcar agotado ${producto.nombre}`
                          : `Reponer ${producto.nombre}`
                      }
                      anchoCompleto
                    >
                      {producto.disponible ? "Marcar agotado" : "Reponer"}
                    </Boton>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
