/*
  Ofertas.tsx — descuentos y ofertas del local (Fase 8).
  ---------------------------------------------------------------

  La gerencia crea las ofertas (un porcentaje o un monto fijo), las edita y las
  activa o desactiva. Después, el cajero puede aplicarle una al cobrar.

  Aquí no interviene la IA: una oferta es un dato guardado en PostgreSQL.
*/

import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  activarOferta,
  crearOferta,
  desactivarOferta,
  editarOferta,
  listarOfertas,
} from "../api/ofertas";
import type { Oferta, TipoDeOferta } from "../api/ofertas";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { Selector } from "../componentes/Selector";
import { Tabla } from "../componentes/Tabla";
import { fechaDeHoy } from "../utilidades/fecha";
import { formatearDinero } from "../utilidades/formato";

interface ErroresDelFormulario {
  nombre?: string;
  valor?: string;
  fechas?: string;
}

function valorDeLaOferta(oferta: Oferta): string {
  if (oferta.tipoValor === null || oferta.valor === null) return "—";
  if (oferta.tipoValor === "Porcentaje") return `${oferta.valor} %`;
  return formatearDinero(oferta.valor);
}

export function Ofertas() {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [enEdicion, setEnEdicion] = useState<Oferta | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoValor, setTipoValor] = useState<TipoDeOferta>("Porcentaje");
  const [valor, setValor] = useState("");
  const [fechaInicio, setFechaInicio] = useState(fechaDeHoy());
  const [fechaFin, setFechaFin] = useState(fechaDeHoy());
  const [errores, setErrores] = useState<ErroresDelFormulario>({});

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);

      try {
        const lista = await listarOfertas();
        if (vigente) setOfertas(lista);
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

  function limpiarFormulario() {
    setEnEdicion(null);
    setNombre("");
    setDescripcion("");
    setTipoValor("Porcentaje");
    setValor("");
    setFechaInicio(fechaDeHoy());
    setFechaFin(fechaDeHoy());
    setErrores({});
  }

  function editar(oferta: Oferta) {
    setEnEdicion(oferta);
    setNombre(oferta.nombre);
    setDescripcion(oferta.descripcion);
    setTipoValor(oferta.tipoValor ?? "Porcentaje");
    setValor(oferta.valor === null ? "" : String(oferta.valor));
    setFechaInicio(oferta.fechaInicio ?? fechaDeHoy());
    setFechaFin(oferta.fechaFin ?? fechaDeHoy());
    setErrores({});
    setError(null);
    setAviso(null);
  }

  function validar(): boolean {
    const nuevos: ErroresDelFormulario = {};

    if (nombre.trim() === "") {
      nuevos.nombre = "Escribe el nombre de la oferta.";
    }

    const valorNumero = Number(valor);
    if (valor.trim() === "" || !Number.isFinite(valorNumero) || valorNumero <= 0) {
      nuevos.valor = "El valor tiene que ser un número mayor que cero.";
    } else if (tipoValor === "Porcentaje" && valorNumero > 100) {
      nuevos.valor = "Un porcentaje no puede pasar de 100.";
    }

    if (fechaFin < fechaInicio) {
      nuevos.fechas = "La fecha de fin no puede ser anterior a la de inicio.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function guardar() {
    if (!validar()) return;

    setGuardando(true);
    setError(null);
    setAviso(null);

    const datos = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      tipoValor,
      valor: Number(valor),
      fechaInicio,
      fechaFin,
    };

    try {
      if (enEdicion === null) {
        const creada = await crearOferta(datos);
        setAviso(`Se creó la oferta "${creada.nombre}".`);
      } else {
        const editada = await editarOferta(enEdicion.id, datos);
        setAviso(`Se actualizó la oferta "${editada.nombre}".`);
      }

      limpiarFormulario();
      setOfertas(await listarOfertas());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(oferta: Oferta, activar: boolean) {
    setGuardando(true);
    setError(null);
    setAviso(null);

    try {
      if (activar) {
        await activarOferta(oferta.id);
        setAviso(`La oferta "${oferta.nombre}" quedó activa.`);
      } else {
        await desactivarOferta(oferta.id);
        setAviso(`La oferta "${oferta.nombre}" quedó desactivada.`);
      }

      setOfertas(await listarOfertas());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Descuentos y ofertas"
        subtitulo="Las ofertas del local: las define la gerencia y el cajero las aplica al cobrar."
      />

      <div className="space-y-5">
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo guardar">
            {error}
          </Alerta>
        )}

        <section className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-carbon">
            {enEdicion === null ? "Crear una oferta" : `Editando "${enEdicion.nombre}"`}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Nombre"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              error={errores.nombre}
            />
            <Campo
              etiqueta="Descripción"
              value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)}
            />
            <Selector
              etiqueta="Tipo"
              value={tipoValor}
              onChange={(evento) =>
                setTipoValor(evento.target.value as TipoDeOferta)
              }
              opciones={[
                { valor: "Porcentaje", texto: "Porcentaje del total" },
                { valor: "Monto", texto: "Monto fijo" },
              ]}
            />
            <Campo
              etiqueta="Valor"
              inputMode="decimal"
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
              error={errores.valor}
              ayuda={
                tipoValor === "Porcentaje"
                  ? "Por ejemplo, 10 para un 10 %."
                  : "Por ejemplo, 100 para RD$ 100 de descuento."
              }
            />
            <Campo
              etiqueta="Vigente desde"
              type="date"
              value={fechaInicio}
              onChange={(evento) => setFechaInicio(evento.target.value)}
            />
            <Campo
              etiqueta="Vigente hasta"
              type="date"
              value={fechaFin}
              onChange={(evento) => setFechaFin(evento.target.value)}
              error={errores.fechas}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Boton
              onClick={() => void guardar()}
              cargando={guardando}
              textoDeCarga="Guardando…"
            >
              {enEdicion === null ? "Crear oferta" : "Guardar cambios"}
            </Boton>

            {enEdicion !== null && (
              <Boton variante="secundario" onClick={limpiarFormulario}>
                Cancelar
              </Boton>
            )}
          </div>
        </section>

        {cargando ? (
          <Cargando texto="Cargando las ofertas…" />
        ) : (
          <Tabla
            titulo="Ofertas del local"
            filas={ofertas}
            claveDeFila={(oferta) => oferta.id}
            vacio="No hay ofertas todavía."
            columnas={[
              {
                clave: "nombre",
                encabezado: "Oferta",
                render: (oferta) => (
                  <span className="font-medium text-carbon">{oferta.nombre}</span>
                ),
              },
              {
                clave: "descripcion",
                encabezado: "Descripción",
                render: (oferta) => oferta.descripcion || "—",
              },
              {
                clave: "valor",
                encabezado: "Descuento",
                alinear: "derecha",
                render: (oferta) => valorDeLaOferta(oferta),
              },
              {
                clave: "vigencia",
                encabezado: "Vigencia",
                render: (oferta) =>
                  `${oferta.fechaInicio ?? "—"} → ${oferta.fechaFin ?? "—"}`,
              },
              {
                clave: "estado",
                encabezado: "Estado",
                render: (oferta) =>
                  oferta.activo ? (
                    <Insignia texto="Activa" color="verde" />
                  ) : (
                    <Insignia texto="Inactiva" color="gris" />
                  ),
              },
              {
                clave: "acciones",
                encabezado: "Acciones",
                alinear: "derecha",
                render: (oferta) => (
                  <div className="flex justify-end gap-2">
                    <Boton
                      variante="secundario"
                      onClick={() => editar(oferta)}
                      disabled={guardando}
                    >
                      Editar
                    </Boton>
                    {oferta.activo ? (
                      <Boton
                        variante="secundario"
                        onClick={() => void cambiarEstado(oferta, false)}
                        disabled={guardando}
                      >
                        Desactivar
                      </Boton>
                    ) : (
                      <Boton
                        variante="secundario"
                        onClick={() => void cambiarEstado(oferta, true)}
                        disabled={guardando}
                      >
                        Activar
                      </Boton>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
