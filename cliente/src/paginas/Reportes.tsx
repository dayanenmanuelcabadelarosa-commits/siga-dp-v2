/*
  Reportes.tsx — el catálogo de reportes del sistema (48+).
  --------------------------------------------------------

  El servidor regala los reportes ya formateados. Esta pantalla los agrupa por
  categoría, deja elegir fechas y exporta a PDF.
*/

import { useEffect, useMemo, useState } from "react";

import {
  ejecutarReporte,
  listarReportes,
} from "../api/reportes";
import type { ReporteDelCatalogo, ReporteEjecutado } from "../api/reportes";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { BotonExportarPdf } from "../componentes/BotonExportarPdf";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Tabla } from "../componentes/Tabla";

const TODAS = "Todas las categorías";

export function Reportes() {
  const [catalogo, setCatalogo] = useState<ReporteDelCatalogo[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState(TODAS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errorDeFechas, setErrorDeFechas] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<ReporteDelCatalogo | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [datos, setDatos] = useState<ReporteEjecutado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      try {
        const reportes = await listarReportes();
        if (!vigente) return;
        setCatalogo(reportes);
      } catch (fallo) {
        if (vigente) setErrorCatalogo(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargandoCatalogo(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, []);

  const categorias = useMemo(() => {
    const unicas = new Set(catalogo.map((reporte) => reporte.categoria));
    return [TODAS, ...Array.from(unicas).sort((a, b) => a.localeCompare(b))];
  }, [catalogo]);

  const visibles = useMemo(() => {
    if (categoriaActiva === TODAS) return catalogo;
    return catalogo.filter((reporte) => reporte.categoria === categoriaActiva);
  }, [catalogo, categoriaActiva]);

  /** Ejecuta un reporte del catálogo con las fechas elegidas. */
  async function ejecutar(reporte: ReporteDelCatalogo) {
    if (reporte.necesitaRango && desde !== "" && hasta !== "" && hasta < desde) {
      setErrorDeFechas("La fecha final no puede ser anterior a la inicial.");
      return;
    }

    if (reporte.necesitaRango === false) {
      setDesde("");
      setHasta("");
    }

    setErrorDeFechas(null);
    setError(null);
    setSeleccionado(reporte);
    setEjecutando(true);

    try {
      const resultado = await ejecutarReporte(
        reporte.codigo,
        reporte.necesitaRango && desde !== "" ? desde : undefined,
        reporte.necesitaRango && hasta !== "" ? hasta : undefined,
      );
      setDatos(resultado);
    } catch (fallo) {
      setDatos(null);
      setError(mensajeDeError(fallo));
    } finally {
      setEjecutando(false);
    }
  }

  if (cargandoCatalogo) {
    return <Cargando texto="Cargando los reportes…" />;
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo={`Catálogo de ${catalogo.length} reportes listos para generar y exportar a PDF.`}
      />

      <div className="space-y-5">
        {errorCatalogo !== null && (
          <Alerta tipo="error" titulo="No se pudo cargar el catálogo">
            {errorCatalogo}
          </Alerta>
        )}

        {/* Fechas: aplican a los reportes que las necesitan. */}
        <div className="grid gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(evento) => {
              setDesde(evento.target.value);
              setErrorDeFechas(null);
            }}
          />
          <Campo
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(evento) => {
              setHasta(evento.target.value);
              setErrorDeFechas(null);
            }}
            error={errorDeFechas ?? undefined}
          />
          <Boton
            variante="secundario"
            onClick={() => {
              setDesde("");
              setHasta("");
              setErrorDeFechas(null);
            }}
          >
            Quitar fechas
          </Boton>
        </div>

        {/* Categorías como pestañas desplazables. */}
        <div className="flex flex-wrap gap-2">
          {categorias.map((categoria) => (
            <button
              key={categoria}
              type="button"
              onClick={() => setCategoriaActiva(categoria)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                categoriaActiva === categoria
                  ? "border-brasa bg-brasa text-white"
                  : "border-madera/20 bg-white text-carbon hover:border-brasa/40"
              }`}
            >
              {categoria}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
          {/* Cuadrícula de reportes. */}
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {visibles.map((reporte) => (
              <button
                key={reporte.codigo}
                type="button"
                disabled={ejecutando}
                onClick={() => {
                  void ejecutar(reporte);
                }}
                className={`w-full rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                  seleccionado?.codigo === reporte.codigo
                    ? "border-brasa bg-brasa/5 shadow-sm ring-1 ring-brasa"
                    : "border-madera/10 bg-white hover:border-brasa/50"
                }`}
              >
                <span className="block text-sm font-semibold text-carbon">
                  {reporte.titulo}
                </span>
                <span className="mt-1 block text-xs text-madera">
                  {reporte.descripcion}
                </span>
                {reporte.necesitaRango !== true ? (
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-madera/70">
                    No usa fechas
                  </span>
                ) : (
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-madera/70">
                    {desde === "" ? "Usa todo el historial" : `Desde ${desde}${hasta ? ` hasta ${hasta}` : ""}`}
                  </span>
                )}
              </button>
            ))}

            {visibles.length === 0 && (
              <p className="rounded-xl border border-dashed border-madera/20 p-6 text-center text-sm text-madera">
                No hay reportes en esta categoría.
              </p>
            )}
          </div>

          {/* Panel de detalle. */}
          <div className="space-y-3">
            {ejecutando && (
              <Cargando texto={`Generando «${seleccionado?.titulo}»…`} />
            )}

            {error !== null && (
              <Alerta tipo="error" titulo="No se pudo generar el reporte">
                {error}
              </Alerta>
            )}

            {datos !== null && !ejecutando && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
                  <div>
                    <h2 className="text-base font-semibold text-carbon">
                      {datos.titulo}
                    </h2>
                    {datos.subtitulo !== undefined && (
                      <p className="text-xs text-madera">{datos.subtitulo}</p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-madera/70">
                      {datos.filas.length} fila{datos.filas.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <BotonExportarPdf
                    titulo={datos.titulo}
                    subtitulo={datos.subtitulo}
                    columnas={datos.columnas}
                    filas={datos.filas}
                    nombreArchivo={datos.nombreArchivo}
                  />
                </div>

                <Tabla
                  titulo={datos.titulo}
                  filas={datos.filas.map((fila) => [...fila])}
                  claveDeFila={(fila) => fila.map((celda) => String(celda ?? "")).join("|")}
                  vacio="No hay datos para el rango elegido."
                  columnas={datos.columnas.map((columna, indice) => ({
                    clave: `c${indice}`,
                    encabezado: columna.encabezado,
                    alinear: columna.alinear,
                    render: (fila: (string | number | null)[]) => fila[indice],
                  }))}
                />
              </div>
            )}

            {datos === null && !ejecutando && error === null && seleccionado === null && (
              <div className="rounded-2xl border border-dashed border-madera/20 bg-white/60 p-10 text-center">
                <p className="text-lg font-semibold text-carbon">Elige un reporte</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-madera">
                  Toca cualquier tarjeta de la izquierda para generarlo. Puedes
                  aplicar un rango de fechas arriba; los reportes que no usan
                  fechas ignoran el rango.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
