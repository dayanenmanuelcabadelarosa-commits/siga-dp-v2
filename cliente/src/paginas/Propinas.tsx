/*
  Propinas.tsx — registrar y cerrar las propinas del día (Fase 5, módulo 3).
  -------------------------------------------------------------------------

  Dos vistas, con permisos distintos:

    · Registrar: el empleado elige una mesa de las que abrió hoy, escribe el
      monto y la forma de pago. La mesa siempre se elige: no hay valor por
      defecto. Con tarjeta, la referencia es obligatoria (RN-28).
    · Cierre del día: solo para quien tiene CERRAR_PROPINAS. Muestra lo que
      registró cada mesero, recibe lo contado y deja el cierre en PostgreSQL.

  Reglas que se ven en la pantalla:

    · Solo aparecen las mesas cuya orden abrió la persona que está dentro
      (RN-04). La API lo vuelve a comprobar; esconder la mesa aquí no es la
      seguridad.
    · Una propina por mesa y día: si ya está registrada, la mesa no se ofrece
      otra vez y la tabla lo dice.
    · El monto y la diferencia oficiales los calcula PostgreSQL. La diferencia
      que se ve mientras se escribe es solo una vista previa.

  Nada se simula: después de registrar o cerrar se usa el resumen que devolvió
  el servidor, que salió de la base.
*/

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../api/errores";
import {
  cerrarPropinas,
  listarCierreDePropinas,
  listarMisPropinas,
  registrarPropina,
} from "../api/propinas";
import type {
  FilaDeCierre,
  FormaDePropina,
  ResumenDeCierre,
  ResumenDePropinas,
} from "../api/propinas";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { Selector } from "../componentes/Selector";
import { Tabla } from "../componentes/Tabla";
import { useSesion } from "../sesion/useSesion";
import { formatearDinero } from "../utilidades/formato";
import { formatearFecha } from "../utilidades/fecha";

type Vista = "registrar" | "cierre";

interface ErroresDelFormulario {
  mesa?: string;
  monto?: string;
  forma?: string;
  referencia?: string;
}

const MONTO_VALIDO = /^\d{1,10}(\.\d{1,2})?$/;

export function Propinas() {
  const { puede } = useSesion();
  const puedeCerrar = puede("CERRAR_PROPINAS");

  const [vista, setVista] = useState<Vista>("registrar");
  const [resumen, setResumen] = useState<ResumenDePropinas | null>(null);
  const [cierre, setCierre] = useState<ResumenDeCierre | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Formulario de registro.
  const [mesaElegida, setMesaElegida] = useState("");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<FormaDePropina | "">("");
  const [referencia, setReferencia] = useState("");
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [guardando, setGuardando] = useState(false);

  // Cierre del día.
  const [contados, setContados] = useState<Record<number, string>>({});
  const [filaEnCurso, setFilaEnCurso] = useState<number | null>(null);
  const [filaAConfirmar, setFilaAConfirmar] = useState<FilaDeCierre | null>(
    null,
  );
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const datos = await listarMisPropinas();
        if (!vigente) return;
        setResumen(datos);
      } catch (fallo) {
        if (vigente) {
          setError(mensajeDeError(fallo));
          setCargando(false);
        }
        return;
      }

      if (puedeCerrar) {
        try {
          const datosCierre = await listarCierreDePropinas();
          if (vigente) setCierre(datosCierre);
        } catch (fallo) {
          if (vigente) setError(mensajeDeError(fallo));
        }
      }

      if (vigente) setCargando(false);
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [puedeCerrar]);

  /*
    Cuando llega el cierre, se prepara un campo de "contado" por empleado. Si
    ya estaba cerrado, se muestra lo que quedó guardado; si no, empieza vacío.
  */
  useEffect(() => {
    if (cierre === null) return;

    setContados((actuales) => {
      const siguiente = { ...actuales };

      for (const fila of cierre.filas) {
        siguiente[fila.idEmpleado] ??= fila.cierre
          ? String(fila.cierre.contado)
          : "";
      }

      return siguiente;
    });
  }, [cierre]);

  if (cargando) {
    return <Cargando texto="Cargando las propinas…" />;
  }

  const mesas = resumen?.mesas ?? [];
  const mesasDisponibles = mesas.filter((mesa) => mesa.propina === null);
  const propinas = resumen?.propinas ?? [];

  async function refrescar() {
    setRefrescando(true);
    setError(null);
    setAviso(null);

    try {
      setResumen(await listarMisPropinas());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
      setRefrescando(false);
      return;
    }

    if (puedeCerrar) {
      try {
        setCierre(await listarCierreDePropinas());
      } catch (fallo) {
        setError(mensajeDeError(fallo));
      }
    }

    setRefrescando(false);
  }

  function limpiarFormulario() {
    setMesaElegida("");
    setMonto("");
    setForma("");
    setReferencia("");
    setErrores({});
  }

  function validarFormulario(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const textoMonto = monto.trim();

    if (mesaElegida === "") {
      nuevos.mesa = "Elige la mesa.";
    }

    if (!MONTO_VALIDO.test(textoMonto) || Number(textoMonto) <= 0) {
      nuevos.monto =
        "Escribe un monto mayor que cero, con hasta dos decimales.";
    }

    if (forma === "") {
      nuevos.forma = "Elige la forma de pago.";
    }

    if (forma === "Tarjeta" && referencia.trim() === "") {
      nuevos.referencia = "Escribe la referencia de la tarjeta.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    if (!validarFormulario() || forma === "") return;

    setGuardando(true);

    try {
      const resultado = await registrarPropina({
        mesa: Number(mesaElegida),
        monto: monto.trim(),
        forma,
        ...(forma === "Tarjeta"
          ? { referencia: referencia.trim() }
          : {}),
      });

      setResumen(resultado.resumen);
      setAviso(resultado.mensaje);
      limpiarFormulario();

      if (puedeCerrar) {
        try {
          setCierre(await listarCierreDePropinas());
        } catch {
          setError(
            "La propina se guardó, pero no se pudo actualizar el cierre. Usa Refrescar.",
          );
        }
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  function contadoDe(fila: FilaDeCierre): string {
    return (contados[fila.idEmpleado] ?? "").trim();
  }

  function diferenciaPrevia(fila: FilaDeCierre): number | null {
    if (fila.cierre !== null) return fila.cierre.diferencia;

    const texto = contadoDe(fila);
    if (!MONTO_VALIDO.test(texto)) return null;

    return Number(texto) - fila.esperado;
  }

  function pedirConfirmacion(fila: FilaDeCierre) {
    setError(null);
    setAviso(null);
    setErrorConfirmacion(null);

    if (!MONTO_VALIDO.test(contadoDe(fila))) {
      setError(
        "Escribe lo contado con hasta dos decimales antes de cerrar.",
      );
      return;
    }

    setFilaAConfirmar(fila);
  }

  async function confirmarCierre() {
    if (filaAConfirmar === null) return;

    const texto = contadoDe(filaAConfirmar);
    setFilaEnCurso(filaAConfirmar.idEmpleado);
    setErrorConfirmacion(null);

    try {
      const resultado = await cerrarPropinas(
        filaAConfirmar.idEmpleado,
        texto,
      );

      setCierre(resultado.resumen);
      setAviso(resultado.mensaje);
      setFilaAConfirmar(null);
    } catch (fallo) {
      setErrorConfirmacion(mensajeDeError(fallo));
    } finally {
      setFilaEnCurso(null);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Propinas"
        subtitulo="Registra la propina de tus mesas y, si te toca, cierra el día."
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
        {puedeCerrar && (
          <div
            className="flex gap-2 border-b border-madera/10"
            role="tablist"
            aria-label="Vistas de propinas"
          >
            <button
              type="button"
              role="tab"
              aria-selected={vista === "registrar"}
              onClick={() => {
                setVista("registrar");
                setAviso(null);
                setError(null);
              }}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                vista === "registrar"
                  ? "border-brasa text-brasa"
                  : "border-transparent text-madera hover:text-carbon"
              }`}
            >
              Registrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "cierre"}
              onClick={() => {
                setVista("cierre");
                setAviso(null);
                setError(null);
              }}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                vista === "cierre"
                  ? "border-brasa text-brasa"
                  : "border-transparent text-madera hover:text-carbon"
              }`}
            >
              Cierre del día
            </button>
          </div>
        )}

        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar">
            {error}
          </Alerta>
        )}

        {vista === "registrar" ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <p className="text-sm text-madera">
                Hoy, {resumen ? formatearFecha(resumen.fecha) : "—"} · Total
                registrado:{" "}
                <strong className="text-carbon">
                  {formatearDinero(resumen?.total ?? 0)}
                </strong>
              </p>
              <p className="mt-1 text-xs text-madera/70">
                Solo puedes registrar la propina de una mesa cuya orden hayas
                tomado tú hoy.
              </p>
            </div>

            {mesas.length === 0 ? (
              <Alerta tipo="info">
                No tienes mesas con pedido hoy. La propina se registra sobre
                una mesa que hayas abierto tú.
              </Alerta>
            ) : mesasDisponibles.length === 0 ? (
              <Alerta tipo="info">
                Ya registraste la propina de todas tus mesas de hoy.
              </Alerta>
            ) : (
              <form
                onSubmit={(evento) => void registrar(evento)}
                className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
              >
                <h2 className="mb-4 text-sm font-semibold text-carbon">
                  Registrar una propina
                </h2>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Selector
                    etiqueta="Mesa"
                    marcador="Elige una mesa…"
                    ayuda="Solo aparecen las mesas que abriste hoy."
                    value={mesaElegida}
                    onChange={(evento) =>
                      setMesaElegida(evento.target.value)
                    }
                    error={errores.mesa}
                    opciones={mesasDisponibles.map((mesa) => ({
                      valor: mesa.numero,
                      texto: `${mesa.numero} — ${mesa.zona}`,
                    }))}
                  />

                  <Campo
                    etiqueta="Monto"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={monto}
                    onChange={(evento) => setMonto(evento.target.value)}
                    error={errores.monto}
                    ayuda="En pesos dominicanos, con hasta dos decimales."
                  />

                  <Selector
                    etiqueta="Forma de pago"
                    marcador="Elige la forma…"
                    value={forma}
                    onChange={(evento) =>
                      setForma(evento.target.value as FormaDePropina | "")
                    }
                    error={errores.forma}
                    opciones={[
                      { valor: "Efectivo", texto: "Efectivo" },
                      { valor: "Tarjeta", texto: "Tarjeta" },
                    ]}
                  />

                  {forma === "Tarjeta" && (
                    <Campo
                      etiqueta="Referencia"
                      placeholder="Número de aprobación"
                      value={referencia}
                      onChange={(evento) =>
                        setReferencia(evento.target.value)
                      }
                      error={errores.referencia}
                      ayuda="La referencia es obligatoria con tarjeta (RN-28)."
                    />
                  )}
                </div>

                <div className="mt-4">
                  <Boton
                    tipo="submit"
                    cargando={guardando}
                    textoDeCarga="Registrando…"
                  >
                    Registrar propina
                  </Boton>
                </div>
              </form>
            )}

            <section>
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Tus mesas de hoy
              </h2>
              <Tabla
                titulo="Tus mesas de hoy"
                filas={mesas}
                claveDeFila={(mesa) => mesa.idMesa}
                vacio="No tienes mesas con pedido hoy."
                columnas={[
                  {
                    clave: "mesa",
                    encabezado: "Mesa",
                    render: (mesa) => mesa.numero,
                  },
                  {
                    clave: "zona",
                    encabezado: "Zona",
                    render: (mesa) => mesa.zona,
                  },
                  {
                    clave: "estado",
                    encabezado: "Propina",
                    render: (mesa) =>
                      mesa.propina ? (
                        <Insignia texto="Registrada" color="verde" />
                      ) : (
                        <Insignia texto="Pendiente" color="miel" />
                      ),
                  },
                  {
                    clave: "monto",
                    encabezado: "Monto",
                    alinear: "derecha",
                    render: (mesa) =>
                      mesa.propina
                        ? formatearDinero(mesa.propina.monto)
                        : "—",
                  },
                ]}
              />
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Propinas registradas hoy
              </h2>
              <Tabla
                titulo="Propinas registradas hoy"
                filas={propinas}
                claveDeFila={(propina) => propina.id}
                vacio="Todavía no registraste propinas hoy."
                columnas={[
                  {
                    clave: "mesa",
                    encabezado: "Mesa",
                    render: (propina) => propina.mesa,
                  },
                  {
                    clave: "zona",
                    encabezado: "Zona",
                    render: (propina) => propina.zona,
                  },
                  {
                    clave: "monto",
                    encabezado: "Monto",
                    alinear: "derecha",
                    render: (propina) => formatearDinero(propina.monto),
                  },
                  {
                    clave: "forma",
                    encabezado: "Forma",
                    render: (propina) => propina.forma,
                  },
                  {
                    clave: "referencia",
                    encabezado: "Referencia",
                    render: (propina) => propina.referencia ?? "—",
                  },
                  {
                    clave: "hora",
                    encabezado: "Hora",
                    render: (propina) => propina.hora,
                  },
                ]}
              />
            </section>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <p className="text-sm text-madera">
                Cierre del{" "}
                {cierre ? formatearFecha(cierre.fecha) : "día de hoy"}. Lo
                esperado sale de las propinas registradas en PostgreSQL.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Esperado</p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(cierre?.totales.totalEsperado ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">
                    Contado en los cierres
                  </p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(cierre?.totales.totalContado ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-crema/60 px-3 py-2">
                  <p className="text-xs text-madera">Diferencia</p>
                  <p className="text-lg font-semibold text-carbon">
                    {formatearDinero(cierre?.totales.totalDiferencia ?? 0)}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-madera/70">
                La diferencia oficial la calcula PostgreSQL al cerrar. Lo que
                se ve antes de cerrar es solo una vista previa.
              </p>
            </div>

            <Tabla
              titulo="Cierre de propinas del día"
              filas={cierre?.filas ?? []}
              claveDeFila={(fila) => fila.idEmpleado}
              vacio="No hay propinas registradas hoy."
              columnas={[
                {
                  clave: "empleado",
                  encabezado: "Mesero",
                  render: (fila) => fila.empleado,
                },
                {
                  clave: "esperado",
                  encabezado: "Esperado",
                  alinear: "derecha",
                  render: (fila) => formatearDinero(fila.esperado),
                },
                {
                  clave: "contado",
                  encabezado: "Contado",
                  alinear: "derecha",
                  render: (fila) =>
                    fila.cierre ? (
                      formatearDinero(fila.cierre.contado)
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Contado de ${fila.empleado}`}
                        placeholder="0.00"
                        value={contados[fila.idEmpleado] ?? ""}
                        onChange={(evento) =>
                          setContados((actuales) => ({
                            ...actuales,
                            [fila.idEmpleado]: evento.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-madera/20 px-3 py-2 text-right text-sm"
                      />
                    ),
                },
                {
                  clave: "diferencia",
                  encabezado: "Diferencia",
                  alinear: "derecha",
                  render: (fila) => {
                    const diferencia = diferenciaPrevia(fila);
                    return diferencia === null
                      ? "—"
                      : formatearDinero(diferencia);
                  },
                },
                {
                  clave: "estado",
                  encabezado: "Estado",
                  render: (fila) =>
                    fila.cierre ? (
                      <div>
                        <Insignia texto="Cerrado" color="verde" />
                        <p className="mt-1 text-xs text-madera">
                          {fila.cierre.cerradoPor} ·{" "}
                          {fila.cierre.cerradoEn}
                        </p>
                      </div>
                    ) : (
                      <Insignia texto="Abierto" color="miel" />
                    ),
                },
                {
                  clave: "acciones",
                  encabezado: "Acciones",
                  alinear: "derecha",
                  render: (fila) =>
                    fila.cierre ? null : (
                      <Boton
                        variante="secundario"
                        onClick={() => pedirConfirmacion(fila)}
                        disabled={filaEnCurso !== null}
                      >
                        Cerrar propinas
                      </Boton>
                    ),
                },
              ]}
            />
          </div>
        )}
      </div>

      {filaAConfirmar !== null && (
        <ModalConfirmacion
          titulo="Cerrar propinas"
          mensaje={
            <div className="space-y-2">
              <p>
                Vas a cerrar las propinas de{" "}
                <strong>{filaAConfirmar.empleado}</strong>.
              </p>
              <p>
                Esperado: {formatearDinero(filaAConfirmar.esperado)}. Contado:{" "}
                {formatearDinero(Number(contadoDe(filaAConfirmar) || 0))}.
              </p>
              <p>
                La diferencia la calcula la base al cerrar y ya no se puede
                repetir el cierre del mismo empleado y día.
              </p>
            </div>
          }
          textoConfirmar="Cerrar propinas"
          procesando={filaEnCurso === filaAConfirmar.idEmpleado}
          error={errorConfirmacion}
          alConfirmar={() => void confirmarCierre()}
          alCerrar={() => {
            if (filaEnCurso !== null) return;
            setFilaAConfirmar(null);
            setErrorConfirmacion(null);
          }}
        />
      )}
    </div>
  );
}
