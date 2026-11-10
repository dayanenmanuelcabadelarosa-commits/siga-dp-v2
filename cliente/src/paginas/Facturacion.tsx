import { Download, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import {
  anularComprobante,
  estadoDelComprobante,
  listarComprobantes,
  xmlDelComprobante,
} from "../api/cuentas";
import type { RegistroDeComprobante } from "../api/cuentas";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { Selector } from "../componentes/Selector";
import { formatearDinero } from "../utilidades/formato";

export function Facturacion() {
  const [comprobantes, setComprobantes] = useState<RegistroDeComprobante[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cargandoId, setCargandoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aAnular, setAAnular] = useState<RegistroDeComprobante | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setComprobantes(
        await listarComprobantes({
          ...(desde ? { desde } : {}),
          ...(hasta ? { hasta } : {}),
          ...(estado ? { estado: estado as "Emitido" | "Anulado" } : {}),
          ...(busqueda.trim() ? { busqueda: busqueda.trim() } : {}),
        }),
      );
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function consultarEstado(comprobante: RegistroDeComprobante) {
    setCargandoId(comprobante.id);
    setError(null);
    setAviso(null);
    try {
      const resultado = await estadoDelComprobante(comprobante.id);
      setComprobantes((actuales) =>
        actuales.map((actual) =>
          actual.id === comprobante.id
            ? { ...actual, estadoEcF: resultado.estadoEcF }
            : actual,
        ),
      );
      setAviso(`Estado actualizado para ${comprobante.ncf}.`);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargandoId(null);
    }
  }

  async function descargarXml(comprobante: RegistroDeComprobante) {
    setCargandoId(comprobante.id);
    setError(null);
    try {
      const xml = await xmlDelComprobante(comprobante.id);
      const enlace = document.createElement("a");
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      enlace.href = url;
      enlace.download = `${comprobante.ncf}.xml`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargandoId(null);
    }
  }

  async function cancelar(comprobante: RegistroDeComprobante) {
    if (comprobante.estado === "Anulado") return;

    setCargandoId(comprobante.id);
    setError(null);
    setAviso(null);
    try {
      const resultado = await anularComprobante(comprobante.ncf);
      setAviso(resultado.mensaje);
      await cargar();
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setCargandoId(null);
      setAAnular(null);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Facturación y comprobantes"
        subtitulo="Consulta los comprobantes emitidos, su estado y los pagos vinculados."
        acciones={
          <Boton
            variante="secundario"
            onClick={() => void cargar()}
            cargando={cargando}
            textoDeCarga="Actualizando…"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Actualizar
          </Boton>
        }
      />

      <div className="space-y-4">
        {error !== null && <Alerta tipo="error">{error}</Alerta>}
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}

        <form
          className="grid gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(evento) => {
            evento.preventDefault();
            void cargar();
          }}
        >
          <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <Selector
            etiqueta="Estado"
            value={estado}
            onChange={(evento) => setEstado(evento.target.value)}
            opciones={[
              { valor: "Emitido", texto: "Emitido" },
              { valor: "Anulado", texto: "Anulado" },
            ]}
            marcador="Todos"
          />
          <Campo
            etiqueta="Buscar"
            placeholder="NCF, cliente o cuenta"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <div className="flex items-end">
            <Boton tipo="submit">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              Filtrar
            </Boton>
          </div>
        </form>

        {cargando ? (
          <Cargando texto="Cargando historial fiscal…" />
        ) : comprobantes.length === 0 ? (
          <Alerta tipo="info">No hay comprobantes que coincidan con esos filtros.</Alerta>
        ) : (
          <div className="space-y-3">
            {comprobantes.map((comprobante) => (
              <article
                key={comprobante.id}
                className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-carbon">
                      {comprobante.ncf} · {comprobante.cliente}
                    </h2>
                    <p className="mt-1 text-sm text-madera">
                      {comprobante.tipo} · {new Date(comprobante.emitidoEn).toLocaleString("es-DO")} ·
                      {" "}Cuenta {comprobante.numeroCuenta ?? "—"}
                      {comprobante.comensal !== null
                        ? ` · Comensal ${comprobante.comensal}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-madera/70">
                      Emitido por {comprobante.emisor} · Pago {comprobante.formaPago}
                      {comprobante.pagoId !== null ? ` (#${comprobante.pagoId})` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-carbon">
                      {formatearDinero(comprobante.total)}
                    </p>
                    <p className="text-xs text-madera">
                      Base {formatearDinero(comprobante.base)} · ITBIS{" "}
                      {formatearDinero(comprobante.impuesto)}
                    </p>
                    <p className="mt-1 text-sm text-carbon">
                      {comprobante.estado}
                      {comprobante.estadoEcF ? ` · ${comprobante.estadoEcF}` : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {comprobante.dgiiUrl !== null && (
                    <a
                      className="inline-flex items-center rounded-xl border border-madera/20 px-3 py-2 text-sm text-carbon hover:bg-crema"
                      href={comprobante.dgiiUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                      Ver en DGII
                    </a>
                  )}
                  {comprobante.idEcF !== null && (
                    <>
                      <Boton
                        variante="secundario"
                        cargando={cargandoId === comprobante.id}
                        onClick={() => void descargarXml(comprobante)}
                      >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        XML
                      </Boton>
                      <Boton
                        variante="secundario"
                        cargando={cargandoId === comprobante.id}
                        onClick={() => void consultarEstado(comprobante)}
                      >
                        Consultar estado
                      </Boton>
                    </>
                  )}
                  {comprobante.estado === "Emitido" && (
                    <Boton
                      variante="peligro"
                      cargando={cargandoId === comprobante.id}
                      onClick={() => setAAnular(comprobante)}
                    >
                      Solicitar anulación fiscal
                    </Boton>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {aAnular !== null && (
        <ModalConfirmacion
          titulo="¿Solicitar la anulación fiscal?"
          peligroso
          textoConfirmar="Sí, solicitar la anulación"
          procesando={cargandoId === aAnular.id}
          mensaje={
            <p>
              Se pedirá a la DGII anular el comprobante{" "}
              <strong>{aAnular.ncf}</strong> por{" "}
              <strong>{formatearDinero(aAnular.total)}</strong>. Esta acción
              fiscal no se puede deshacer.
            </p>
          }
          alConfirmar={() => void cancelar(aAnular)}
          alCerrar={() => setAAnular(null)}
        />
      )}
    </div>
  );
}
