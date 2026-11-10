/*
  Corte.tsx — cerrar el turno y cuadrar el dinero (Fase 6, módulo 6).
  ---------------------------------------------------------------------
*/

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { cerrarCorte, obtenerCorte } from "../api/corte";
import type { ResumenDeCorte } from "../api/corte";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { formatearDinero } from "../utilidades/formato";

export function Corte() {
  const [resumen, setResumen] = useState<ResumenDeCorte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [efectivoDeclarado, setEfectivoDeclarado] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorDeclarado, setErrorDeclarado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorDeCierre, setErrorDeCierre] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const datos = await obtenerCorte();
        if (vigente) setResumen(datos);
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
  }, []);

  if (cargando) {
    return <Cargando texto="Cargando el corte…" />;
  }

  async function refrescar() {
    setRefrescando(true);
    setError(null);
    setAviso(null);

    try {
      setResumen(await obtenerCorte());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  /**
   * El efectivo declarado es obligatorio: un campo vacío ya no se convierte en
   * "0". Si de verdad no hay efectivo, se escribe 0.
   */
  function pedirConfirmacion() {
    const texto = efectivoDeclarado.trim().replace(",", ".");

    if (texto === "") {
      setErrorDeclarado(
        "Escribe el efectivo que contaste en la caja. Si no hay efectivo, escribe 0.",
      );
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
      setErrorDeclarado("Escribe un monto válido, por ejemplo 1500 o 1500.50.");
      return;
    }

    setErrorDeclarado(null);
    setErrorDeCierre(null);
    setAviso(null);
    setConfirmando(true);
  }

  async function cerrar() {
    setError(null);
    setErrorDeCierre(null);
    setAviso(null);
    setCerrando(true);

    try {
      const resultado = await cerrarCorte(
        efectivoDeclarado.trim().replace(",", "."),
      );
      setResumen(resultado.resumen);
      setAviso(resultado.mensaje);
      setEfectivoDeclarado("");
      setConfirmando(false);
    } catch (fallo) {
      // El error se queda dentro de la ventana, para que no parezca que salió bien.
      setErrorDeCierre(mensajeDeError(fallo));
    } finally {
      setCerrando(false);
    }
  }

  const declaradoNumero = Number(efectivoDeclarado.trim().replace(",", "."));

  const cerrado = resumen?.estado === "Cerrado";

  return (
    <div>
      <EncabezadoPagina
        titulo="Corte de caja"
        subtitulo="Cierra el turno y cuadra el dinero contra los pagos."
        acciones={
          <Boton
            variante="secundario"
            onClick={() => void refrescar()}
            cargando={refrescando}
            textoDeCarga="Refrescando…"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refrescar
          </Boton>
        }
      />

      <div className="space-y-5">
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar">
            {error}
          </Alerta>
        )}

        {resumen !== null && (
          <>
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <p className="text-sm text-madera">
                Fecha del negocio: <strong>{resumen.fecha}</strong> · Estado:{" "}
                <strong>{resumen.estado}</strong>
                {resumen.cerradoPor !== null && (
                  <>
                    {" "}
                    · Cerrado por {resumen.cerradoPor}
                  </>
                )}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Ventas</p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(resumen.totalVentas)}
                  </p>
                </div>
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Descuentos</p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(resumen.totalDescuentos)}
                  </p>
                </div>
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Comprobantes</p>
                  <p className="text-lg font-semibold text-carbon">
                    {resumen.comprobantes}
                  </p>
                </div>
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Efectivo en sistema</p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(resumen.efectivoSistema)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-madera">
                <p>
                  Tarjeta: {formatearDinero(resumen.porForma.Tarjeta)} · PayPal:{" "}
                  {formatearDinero(resumen.porForma.PayPal)} · Crédito:{" "}
                  {formatearDinero(resumen.porForma.Crédito)} · Efectivo:{" "}
                  {formatearDinero(resumen.porForma.Efectivo)}
                </p>
              </div>

              {cerrado && (
                <div className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3 text-sm">
                  <p>
                    Efectivo declarado:{" "}
                    {formatearDinero(resumen.efectivoDeclarado ?? 0)}
                  </p>
                  <p>
                    Diferencia: {formatearDinero(resumen.diferencia ?? 0)}
                  </p>
                </div>
              )}
            </div>

            {!cerrado && (
              <form
                onSubmit={(evento) => {
                  evento.preventDefault();
                  pedirConfirmacion();
                }}
                className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
              >
                <h2 className="mb-3 text-sm font-semibold text-carbon">
                  Cerrar el corte
                </h2>
                <Campo
                  etiqueta="Efectivo declarado"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={efectivoDeclarado}
                  onChange={(evento) => {
                    setEfectivoDeclarado(evento.target.value);
                    setErrorDeclarado(null);
                  }}
                  error={errorDeclarado ?? undefined}
                  ayuda="Cuenta el efectivo de la caja antes de cerrar. Una vez cerrado, solo el dueño puede reabrir el corte."
                />
                <div className="mt-3">
                  <Boton tipo="submit">Cerrar corte</Boton>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {confirmando && resumen !== null && (
        <ModalConfirmacion
          titulo="¿Cerrar el corte de caja?"
          peligroso
          textoConfirmar="Sí, cerrar el corte"
          procesando={cerrando}
          error={errorDeCierre}
          alConfirmar={() => void cerrar()}
          alCerrar={() => setConfirmando(false)}
          mensaje={
            <div className="space-y-2">
              <p>Revisa los montos. Después de cerrar no se puede cambiar.</p>
              <p>
                Efectivo en el sistema:{" "}
                <strong>{formatearDinero(resumen.efectivoSistema)}</strong>
              </p>
              <p>
                Efectivo que declaras:{" "}
                <strong>{formatearDinero(declaradoNumero)}</strong>
              </p>
              <p>
                Diferencia:{" "}
                <strong>
                  {formatearDinero(declaradoNumero - resumen.efectivoSistema)}
                </strong>
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
