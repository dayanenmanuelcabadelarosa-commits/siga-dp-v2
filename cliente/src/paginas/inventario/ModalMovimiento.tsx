/*
  ModalMovimiento.tsx — registrar una entrada, una salida o un ajuste.
  -------------------------------------------------------------------

  La persona no escribe el signo ni el tipo de operación dos veces:
    · Entrada de compra: cantidad positiva y proveedor obligatorio.
    · Salida por consumo: cantidad positiva; el servidor la guarda negativa.
    · Ajuste por conteo: se escribe lo que se contó y el servidor calcula y
      guarda la diferencia (RN-14). El detalle se arma solo.

  La existencia actual se muestra en el ajuste para que la diferencia no sea una
  sorpresa. El servidor vuelve a leerla con la fila bloqueada: lo que se ve aquí
  es una ayuda, no la verdad final.
*/

import { Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { mensajeDeError } from "../../api/errores";
import type {
  EntradaDeMovimiento,
  Existencia,
  Insumo,
  Proveedor,
  PuntoDeAcceso,
  TipoDeMovimiento,
} from "../../api/inventario";
import { Alerta } from "../../componentes/Alerta";
import { Boton } from "../../componentes/Boton";
import { Campo } from "../../componentes/Campo";
import { Modal } from "../../componentes/Modal";
import { Selector } from "../../componentes/Selector";
import {
  formatearCantidad,
  formatearCantidadConSigno,
} from "../../utilidades/formato";

export interface ModalMovimientoProps {
  insumos: readonly Insumo[];
  puntos: readonly PuntoDeAcceso[];
  proveedores: readonly Proveedor[];
  existencias: readonly Existencia[];
  alCerrar: () => void;
  /** Si falla, la ventana se queda abierta y muestra el error. */
  alGuardar: (entrada: EntradaDeMovimiento) => Promise<void>;
}

interface ErroresDelFormulario {
  id_insumo?: string;
  id_punto?: string;
  id_proveedor?: string;
  cantidad?: string;
  detalle?: string;
  conteo_fisico?: string;
}

const CANTIDAD_VALIDA = /^\d{1,10}(\.\d{1,2})?$/;

function centavos(valor: string | number): number {
  return Math.round(Number(valor) * 100);
}

export function ModalMovimiento({
  insumos,
  puntos,
  proveedores,
  existencias,
  alCerrar,
  alGuardar,
}: ModalMovimientoProps) {
  const insumosActivos = insumos.filter((insumo) => insumo.activo);
  const proveedoresActivos = proveedores.filter(
    (proveedor) => proveedor.estado === "Activo",
  );
  const puntoInicial =
    puntos.find((punto) => punto.es_almacen) ?? puntos[0] ?? null;

  const [tipo, setTipo] = useState<TipoDeMovimiento>("Entrada de compra");
  const [idInsumo, setIdInsumo] = useState(
    insumosActivos[0] === undefined ? "" : String(insumosActivos[0].id_insumo),
  );
  const [idPunto, setIdPunto] = useState(
    puntoInicial === null ? "" : String(puntoInicial.id_punto),
  );
  const [idProveedor, setIdProveedor] = useState(
    proveedoresActivos[0] === undefined
      ? ""
      : String(proveedoresActivos[0].id_proveedor),
  );
  const [cantidad, setCantidad] = useState("");
  const [detalle, setDetalle] = useState("");
  const [conteoFisico, setConteoFisico] = useState("");
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const insumoElegido = insumosActivos.find(
    (insumo) => String(insumo.id_insumo) === idInsumo,
  );
  const puntoElegido = puntos.find(
    (punto) => String(punto.id_punto) === idPunto,
  );

  const existenciaActual =
    existencias.find(
      (fila) =>
        String(fila.id_insumo) === idInsumo &&
        String(fila.id_punto) === idPunto,
    )?.existencia ?? 0;

  const ayudaDeCantidad =
    insumoElegido === undefined
      ? undefined
      : tipo === "Salida por consumo"
        ? `En ${insumoElegido.unidad} (${insumoElegido.abreviatura}). Hay ${formatearCantidad(
            existenciaActual,
          )} ${insumoElegido.abreviatura} en ${puntoElegido?.nombre ?? "ese punto"}.`
        : `En ${insumoElegido.unidad} (${insumoElegido.abreviatura}).`;

  function limpiarErrores(): void {
    setErrores({});
    setErrorDelServidor(null);
  }

  const diferencia =
    CANTIDAD_VALIDA.test(conteoFisico.trim()) && conteoFisico.trim() !== ""
      ? (centavos(conteoFisico) - centavos(existenciaActual)) / 100
      : null;

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};
    const cantidadLimpia = cantidad.trim();
    const detalleLimpio = detalle.trim();
    const conteoLimpio = conteoFisico.trim();

    if (insumosActivos.length === 0) {
      nuevos.id_insumo = "No hay insumos activos. Crea o activa uno primero.";
    } else if (idInsumo === "") {
      nuevos.id_insumo = "Elige un insumo.";
    }

    if (puntos.length === 0) {
      nuevos.id_punto = "No hay puntos de acceso configurados.";
    } else if (idPunto === "") {
      nuevos.id_punto = "Elige un punto de acceso.";
    }

    if (tipo === "Ajuste por conteo") {
      if (conteoLimpio === "") {
        nuevos.conteo_fisico = "Escribe lo que contaste.";
      } else if (!CANTIDAD_VALIDA.test(conteoLimpio)) {
        nuevos.conteo_fisico =
          "El conteo debe ser un número con hasta dos decimales.";
      } else if (Number(conteoLimpio) < 0) {
        nuevos.conteo_fisico = "El conteo no puede ser negativo.";
      } else if (centavos(conteoLimpio) === centavos(existenciaActual)) {
        nuevos.conteo_fisico =
          "El conteo coincide con la existencia actual. No hay nada que ajustar.";
      }
    } else {
      if (cantidadLimpia === "") {
        nuevos.cantidad = "Escribe la cantidad.";
      } else if (!CANTIDAD_VALIDA.test(cantidadLimpia)) {
        nuevos.cantidad =
          "La cantidad debe ser un número con hasta dos decimales.";
      } else if (!(Number(cantidadLimpia) > 0)) {
        nuevos.cantidad = "La cantidad debe ser mayor que cero.";
      }

      if (detalleLimpio === "") {
        nuevos.detalle = "Escribe el detalle del movimiento.";
      } else if (detalleLimpio.length > 160) {
        nuevos.detalle = "El detalle no puede pasar de 160 caracteres.";
      }
    }

    if (tipo === "Entrada de compra") {
      if (proveedoresActivos.length === 0) {
        nuevos.id_proveedor =
          "No hay proveedores activos. Crea o activa uno primero.";
      } else if (idProveedor === "") {
        nuevos.id_proveedor = "Elige un proveedor.";
      }
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    if (!validar()) return;

    setEnviando(true);
    setErrorDelServidor(null);

    try {
      let entrada: EntradaDeMovimiento;

      if (tipo === "Ajuste por conteo") {
        entrada = {
          tipo,
          id_insumo: Number(idInsumo),
          id_punto: Number(idPunto),
          conteo_fisico: conteoFisico.trim(),
        };
      } else {
        entrada = {
          tipo,
          id_insumo: Number(idInsumo),
          id_punto: Number(idPunto),
          cantidad: cantidad.trim(),
          detalle: detalle.trim(),
          ...(tipo === "Entrada de compra"
            ? { id_proveedor: Number(idProveedor) }
            : {}),
        } as EntradaDeMovimiento;
      }

      await alGuardar(entrada);
    } catch (fallo) {
      setErrorDelServidor(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo="Registrar movimiento"
      alCerrar={alCerrar}
      cerrable={!enviando}
    >
      <form onSubmit={(evento) => void guardar(evento)} className="space-y-4">
        {errorDelServidor !== null && (
          <Alerta tipo="error" titulo="No se pudo registrar el movimiento">
            {errorDelServidor}
          </Alerta>
        )}

        {insumosActivos.length === 0 && (
          <Alerta tipo="aviso" titulo="No hay insumos activos">
            Crea un insumo o activa uno existente antes de mover el inventario.
          </Alerta>
        )}

        <Selector
          etiqueta="Tipo de movimiento"
          value={tipo}
          opciones={[
            { valor: "Entrada de compra", texto: "Entrada de compra" },
            { valor: "Salida por consumo", texto: "Salida por consumo" },
            { valor: "Ajuste por conteo", texto: "Ajuste por conteo" },
          ]}
          onChange={(evento) => {
            setTipo(evento.target.value as TipoDeMovimiento);
            limpiarErrores();
          }}
        />

        <Selector
          etiqueta="Insumo"
          value={idInsumo}
          marcador="Elige un insumo…"
          opciones={insumosActivos.map((insumo) => ({
            valor: insumo.id_insumo,
            texto: `${insumo.nombre} (${insumo.abreviatura})`,
          }))}
          error={errores.id_insumo}
          onChange={(evento) => {
            setIdInsumo(evento.target.value);
            limpiarErrores();
          }}
        />

        <Selector
          etiqueta="Punto de acceso"
          value={idPunto}
          marcador="Elige un punto…"
          opciones={puntos.map((punto) => ({
            valor: punto.id_punto,
            texto: punto.es_almacen ? `${punto.nombre} (almacén)` : punto.nombre,
          }))}
          error={errores.id_punto}
          onChange={(evento) => {
            setIdPunto(evento.target.value);
            limpiarErrores();
          }}
        />

        {tipo === "Entrada de compra" && (
          <Selector
            etiqueta="Proveedor"
            value={idProveedor}
            marcador="Elige un proveedor…"
            opciones={proveedoresActivos.map((proveedor) => ({
              valor: proveedor.id_proveedor,
              texto: proveedor.nombre,
            }))}
            ayuda={
              proveedoresActivos.length === 0
                ? "No hay proveedores activos. Crea uno en «Insumos y proveedores»."
                : undefined
            }
            error={errores.id_proveedor}
            onChange={(evento) => {
              setIdProveedor(evento.target.value);
              limpiarErrores();
            }}
          />
        )}

        {tipo === "Ajuste por conteo" ? (
          <>
            <div className="rounded-xl border border-madera/10 bg-crema/60 p-3 text-sm text-carbon">
              <p>
                Existencia actual en{" "}
                <strong>{puntoElegido?.nombre ?? "ese punto"}</strong>:{" "}
                <strong>
                  {formatearCantidad(existenciaActual)}{" "}
                  {insumoElegido?.abreviatura ?? ""}
                </strong>
                .
              </p>

              {diferencia !== null && diferencia !== 0 && (
                <p className="mt-1 text-madera">
                  Se guardará una diferencia de{" "}
                  <strong>{formatearCantidadConSigno(diferencia)}</strong>{" "}
                  {insumoElegido?.abreviatura ?? ""}.
                </p>
              )}
            </div>

            <Campo
              etiqueta="Conteo físico"
              value={conteoFisico}
              inputMode="decimal"
              maxLength={13}
              autoFocus
              ayuda={`Lo que contaste en ${puntoElegido?.nombre ?? "el punto"}.`}
              error={errores.conteo_fisico}
              onChange={(evento) => {
                setConteoFisico(evento.target.value);
                limpiarErrores();
              }}
            />
          </>
        ) : (
          <>
            <Campo
              etiqueta="Cantidad"
              value={cantidad}
              inputMode="decimal"
              maxLength={13}
              autoFocus
              ayuda={ayudaDeCantidad}
              error={errores.cantidad}
              onChange={(evento) => {
                setCantidad(evento.target.value);
                limpiarErrores();
              }}
            />

            <Campo
              etiqueta="Detalle"
              value={detalle}
              maxLength={160}
              ayuda="Factura, referencia o motivo del movimiento."
              error={errores.detalle}
              onChange={(evento) => {
                setDetalle(evento.target.value);
                limpiarErrores();
              }}
            />
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Boton
            variante="secundario"
            disabled={enviando}
            onClick={alCerrar}
          >
            Cancelar
          </Boton>

          <Boton
            tipo="submit"
            cargando={enviando}
            textoDeCarga="Registrando…"
            icono={<Save size={16} aria-hidden="true" />}
          >
            Registrar movimiento
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
