/*
  Productos.tsx — la pantalla de Productos y catálogo (M07).
  ---------------------------------------------------------

  Qué se ve y qué se puede hacer:

    · La lista completa del catálogo, con los productos activos primero. Los
      inactivos no se esconden: hay que poder encontrarlos para reactivarlos.
    · Dos estados separados, porque son cosas distintas:
        - Catálogo (activo): si el producto se ofrece o no.
        - Disponibilidad (disponible): si hoy se puede pedir.
      La baja no borra nada (RN-16): solo lo saca del catálogo.
    · Buscar por nombre y filtrar por categoría, por agotados o por inactivos.
    · Crear y editar en una ventana; la baja y la reactivación piden confirmación.
    · Categorías y estaciones se administran desde su propia ventana, no con SQL.
      Una categoría con productos activos no se puede desactivar.

  Los errores de una acción no se pierden: si la baja falla, la ventana de
  confirmación se queda abierta con el mensaje del servidor. Si falla una acción
  rápida, el mensaje aparece arriba. Si falla la recarga de la lista, los datos
  que ya estaban se quedan en pantalla.
*/

import {
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Tags,
} from "lucide-react";
import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  cambiarDisponibilidadDeProducto,
  darDeBajaProducto,
  editarProducto,
  listarProductos,
  reactivarProducto,
  crearProducto,
} from "../api/productos";
import type { DatosDeProductos, Producto } from "../api/productos";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Buscador } from "../componentes/Buscador";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { ModalConfirmacion } from "../componentes/ModalConfirmacion";
import { Pestanas } from "../componentes/Pestanas";
import type { OpcionDePestana } from "../componentes/Pestanas";
import { Tabla } from "../componentes/Tabla";
import type { Columna } from "../componentes/Tabla";
import { formatearDinero } from "../utilidades/formato";
import { ModalCatalogo } from "./productos/ModalCatalogo";
import { ModalProducto } from "./productos/ModalProducto";
import type { DatosDelFormularioProducto } from "./productos/ModalProducto";

type TipoDeConfirmacion = "baja" | "reactivar";

interface ConfirmacionPendiente {
  tipo: TipoDeConfirmacion;
  producto: Producto;
}

interface TextoDeConfirmacion {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  peligroso: boolean;
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function textoDeConfirmacion({
  tipo,
  producto,
}: ConfirmacionPendiente): TextoDeConfirmacion {
  if (tipo === "baja") {
    return {
      titulo: `Dar de baja ${producto.nombre}`,
      mensaje:
        "Saldrá del catálogo y no se podrá pedir. No se borra: su historial de ventas se conserva y puedes reactivarlo después.",
      textoConfirmar: "Dar de baja",
      peligroso: true,
    };
  }

  return {
    titulo: `Reactivar ${producto.nombre}`,
    mensaje: `Volverá al catálogo con la disponibilidad que tenía: ${
      producto.disponible ? "Disponible" : "Agotado"
    }.`,
    textoConfirmar: "Reactivar",
    peligroso: false,
  };
}

export function Productos() {
  const [datos, setDatos] = useState<DatosDeProductos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [pestana, setPestana] = useState("todos");

  const [modalProducto, setModalProducto] = useState<{
    producto: Producto | null;
  } | null>(null);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [confirmacion, setConfirmacion] =
    useState<ConfirmacionPendiente | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [accionRapida, setAccionRapida] = useState<number | null>(null);

  const ocupado = accionRapida !== null || procesando;

  useEffect(() => {
    let vigente = true;

    async function cargar(): Promise<void> {
      try {
        const recibidos = await listarProductos();
        if (!vigente) return;
        setDatos(recibidos);
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
  }, []);

  async function refrescar(): Promise<void> {
    setRefrescando(true);

    try {
      const recibidos = await listarProductos();
      setDatos(recibidos);
      setError(null);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  function reintentar(): void {
    setCargando(true);
    setError(null);

    void (async () => {
      try {
        const recibidos = await listarProductos();
        setDatos(recibidos);
      } catch (fallo) {
        setError(mensajeDeError(fallo));
      } finally {
        setCargando(false);
      }
    })();
  }

  async function guardarProducto(
    entrada: DatosDelFormularioProducto,
  ): Promise<void> {
    if (entrada.modo === "crear") {
      const creado = await crearProducto(entrada.datos);
      setAviso(`Se creó "${creado.nombre}".`);
    } else {
      const enEdicion = modalProducto?.producto ?? null;

      if (enEdicion === null) {
        throw new Error("No se sabe qué producto se está editando.");
      }

      const editado = await editarProducto(
        enEdicion.id_producto,
        entrada.datos,
      );
      setAviso(`Se actualizó "${editado.nombre}".`);
    }

    setModalProducto(null);
    await refrescar();
  }

  async function cambiarDisponibilidad(producto: Producto): Promise<void> {
    if (ocupado) return;

    setAccionRapida(producto.id_producto);
    setErrorDeAccion(null);
    setAviso(null);

    try {
      const actualizado = await cambiarDisponibilidadDeProducto(
        producto.id_producto,
        !producto.disponible,
      );

      setAviso(
        actualizado.disponible
          ? `"${actualizado.nombre}" quedó disponible.`
          : `"${actualizado.nombre}" quedó agotado.`,
      );

      await refrescar();
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    } finally {
      setAccionRapida(null);
    }
  }

  function abrirConfirmacion(
    tipo: TipoDeConfirmacion,
    producto: Producto,
  ): void {
    if (ocupado) return;

    setErrorDeAccion(null);
    setAviso(null);
    setConfirmacion({ tipo, producto });
  }

  async function ejecutarConfirmacion(): Promise<void> {
    if (confirmacion === null || procesando) return;

    setProcesando(true);
    setErrorDeAccion(null);

    try {
      if (confirmacion.tipo === "baja") {
        const dadoDeBaja = await darDeBajaProducto(
          confirmacion.producto.id_producto,
        );
        setAviso(
          `"${dadoDeBaja.nombre}" salió del catálogo. No se borró; puedes reactivarlo.`,
        );
      } else {
        const reactivado = await reactivarProducto(
          confirmacion.producto.id_producto,
        );
        setAviso(
          `"${reactivado.nombre}" volvió al catálogo y quedó ${
            reactivado.disponible ? "disponible" : "agotado"
          }.`,
        );
      }

      setConfirmacion(null);
      await refrescar();
    } catch (fallo) {
      setErrorDeAccion(mensajeDeError(fallo));
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return <Cargando texto="Cargando el catálogo…" />;
  }

  if (datos === null) {
    return (
      <div>
        <EncabezadoPagina
          titulo="Productos y catálogo"
          subtitulo="El catálogo se carga desde el servidor."
        />

        <Alerta tipo="error" titulo="No se pudo cargar el catálogo">
          {error ?? "Ocurrió un error inesperado. Inténtalo otra vez."}
        </Alerta>

        <div className="mt-4">
          <Boton
            variante="secundario"
            onClick={reintentar}
            icono={<RefreshCw size={16} aria-hidden="true" />}
          >
            Reintentar
          </Boton>
        </div>
      </div>
    );
  }

  const total = datos.productos.length;
  const disponibles = datos.productos.filter(
    (producto) => producto.activo && producto.disponible,
  ).length;
  const agotados = datos.productos.filter(
    (producto) => producto.activo && !producto.disponible,
  ).length;
  const inactivos = datos.productos.filter(
    (producto) => !producto.activo,
  ).length;

  const puedeCrear =
    datos.categorias.some((categoria) => categoria.activo) &&
    datos.estaciones.length > 0;

  const categoriasConProductos = new Set(
    datos.productos.map((producto) => producto.id_categoria),
  );

  const opcionesDePestanas: OpcionDePestana[] = [
    { valor: "todos", texto: "Todos" },
    ...datos.categorias
      .filter(
        (categoria) =>
          categoria.activo || categoriasConProductos.has(categoria.id_categoria),
      )
      .map((categoria) => ({
        valor: `categoria:${categoria.id_categoria}`,
        texto: categoria.nombre,
      })),
    { valor: "agotados", texto: "Agotados" },
    { valor: "inactivos", texto: "Inactivos" },
  ];

  const pestanaActiva = opcionesDePestanas.some(
    (opcion) => opcion.valor === pestana,
  )
    ? pestana
    : "todos";

  const textoBuscado = busqueda.trim().toLocaleLowerCase("es");

  const visibles = datos.productos.filter((producto) => {
    if (
      textoBuscado !== "" &&
      !producto.nombre.toLocaleLowerCase("es").includes(textoBuscado)
    ) {
      return false;
    }

    if (pestanaActiva === "todos") return true;
    if (pestanaActiva === "agotados") {
      return producto.activo && !producto.disponible;
    }
    if (pestanaActiva === "inactivos") return !producto.activo;

    const idCategoria = Number(pestanaActiva.slice("categoria:".length));
    return producto.id_categoria === idCategoria;
  });

  const columnas: readonly Columna<Producto>[] = [
    {
      clave: "producto",
      encabezado: "Producto",
      render: (producto) => (
        <div>
          <p className="font-medium text-carbon">{producto.nombre}</p>
          {producto.riesgo_agotarse && (
            <div className="mt-1">
              <Insignia texto="Por agotarse" color="miel" />
            </div>
          )}
        </div>
      ),
    },
    {
      clave: "categoria",
      encabezado: "Categoría",
      render: (producto) => (
        <div>
          <p>{producto.categoria}</p>
          {!producto.categoria_activa && (
            <p className="text-xs text-madera/70">Categoría inactiva</p>
          )}
        </div>
      ),
    },
    {
      clave: "estacion",
      encabezado: "Estación",
      render: (producto) => producto.estacion,
    },
    {
      clave: "precio",
      encabezado: "Precio",
      alinear: "derecha",
      render: (producto) => (
        <span className="tabular-nums font-medium">
          {formatearDinero(producto.precio)}
        </span>
      ),
    },
    {
      clave: "tiempo",
      encabezado: "Tiempo",
      alinear: "derecha",
      render: (producto) =>
        producto.tiempo_estimado_minutos === null
          ? "Sin estimar"
          : `${producto.tiempo_estimado_minutos} min`,
    },
    {
      clave: "catalogo",
      encabezado: "Catálogo",
      render: (producto) => (
        <Insignia
          texto={producto.activo ? "Activo" : "Inactivo"}
          color={producto.activo ? "verde" : "gris"}
        />
      ),
    },
    {
      clave: "disponibilidad",
      encabezado: "Disponibilidad",
      render: (producto) => (
        <span
          title={
            producto.activo
              ? undefined
              : "Está fuera del catálogo. Esta es la disponibilidad que tendrá al reactivarlo."
          }
        >
          <Insignia
            texto={producto.disponible ? "Disponible" : "Agotado"}
            color={
              !producto.activo ? "gris" : producto.disponible ? "verde" : "miel"
            }
          />
        </span>
      ),
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      render: (producto) => {
        const cambiando = accionRapida === producto.id_producto;
        const textoDisponibilidad = producto.disponible
          ? `Marcar como agotado: ${producto.nombre}`
          : `Marcar como disponible: ${producto.nombre}`;

        return (
          <div className="flex justify-end gap-1">
            <Boton
              variante="texto"
              aria-label={`Editar ${producto.nombre}`}
              title={`Editar ${producto.nombre}`}
              icono={<Pencil size={16} aria-hidden="true" />}
              disabled={ocupado}
              onClick={() => {
                setErrorDeAccion(null);
                setAviso(null);
                setModalProducto({ producto });
              }}
            >
              <span className="sr-only">Editar</span>
            </Boton>

            {producto.activo ? (
              <>
                <Boton
                  variante="texto"
                  aria-label={textoDisponibilidad}
                  title={textoDisponibilidad}
                  icono={
                    <Power
                      size={16}
                      className={
                        producto.disponible ? "text-miel" : "text-hoja"
                      }
                      aria-hidden="true"
                    />
                  }
                  cargando={cambiando}
                  disabled={ocupado && !cambiando}
                  onClick={() => {
                    void cambiarDisponibilidad(producto);
                  }}
                >
                  <span className="sr-only">
                    {producto.disponible ? "Marcar agotado" : "Marcar disponible"}
                  </span>
                </Boton>

                <Boton
                  variante="texto"
                  aria-label={`Dar de baja ${producto.nombre}`}
                  title={`Dar de baja ${producto.nombre}`}
                  icono={
                    <PowerOff
                      size={16}
                      className="text-ladrillo"
                      aria-hidden="true"
                    />
                  }
                  disabled={ocupado}
                  onClick={() => abrirConfirmacion("baja", producto)}
                >
                  <span className="sr-only">Dar de baja</span>
                </Boton>
              </>
            ) : (
              <Boton
                variante="texto"
                aria-label={`Reactivar ${producto.nombre}`}
                title={
                  producto.categoria_activa
                    ? `Reactivar ${producto.nombre}`
                    : "La categoría está inactiva. Edita el producto y cámbiala antes de reactivarlo."
                }
                icono={
                  <RotateCcw
                    size={16}
                    className="text-hoja"
                    aria-hidden="true"
                  />
                }
                disabled={ocupado || !producto.categoria_activa}
                onClick={() => abrirConfirmacion("reactivar", producto)}
              >
                <span className="sr-only">Reactivar</span>
              </Boton>
            )}
          </div>
        );
      },
    },
  ];

  const mensajeVacio =
    datos.productos.length === 0
      ? "Todavía no hay productos. Crea el primero con «Nuevo producto»."
      : "No hay productos que coincidan con la búsqueda o el filtro.";

  return (
    <div>
      <EncabezadoPagina
        titulo="Productos y catálogo"
        subtitulo={`${contar(total, "producto", "productos")} · ${contar(
          disponibles,
          "disponible",
          "disponibles",
        )} · ${contar(agotados, "agotado", "agotados")} · ${contar(
          inactivos,
          "inactivo",
          "inactivos",
        )}.`}
        acciones={
          <>
            <Boton
              variante="secundario"
              icono={<Tags size={16} aria-hidden="true" />}
              disabled={ocupado}
              onClick={() => {
                setErrorDeAccion(null);
                setCatalogoAbierto(true);
              }}
            >
              Categorías y estaciones
            </Boton>

            <Boton
              icono={<Plus size={16} aria-hidden="true" />}
              disabled={ocupado || !puedeCrear}
              title={
                puedeCrear
                  ? undefined
                  : "Necesitas una categoría activa y una estación para crear productos."
              }
              onClick={() => {
                setErrorDeAccion(null);
                setAviso(null);
                setModalProducto({ producto: null });
              }}
            >
              Nuevo producto
            </Boton>
          </>
        }
      />

      <div className="space-y-4">
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}

        {/*
          Si hay una confirmación abierta, el error se muestra dentro de ella:
          repetirlo detrás de la ventana solo confunde. Las acciones rápidas, que
          no tienen ventana, sí lo muestran aquí.
        */}
        {errorDeAccion !== null && confirmacion === null && (
          <Alerta tipo="error" titulo="No se pudo completar la acción">
            {errorDeAccion}
          </Alerta>
        )}

        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar la lista">
            <p>{error}</p>
            <div className="mt-2">
              <Boton
                variante="secundario"
                onClick={() => {
                  void refrescar();
                }}
                disabled={refrescando}
                icono={<RefreshCw size={16} aria-hidden="true" />}
              >
                Reintentar
              </Boton>
            </div>
          </Alerta>
        )}

        {!puedeCrear && (
          <Alerta tipo="info" titulo="Falta preparar el catálogo">
            <p>
              Para crear productos necesitas al menos una categoría activa y una
              estación.
            </p>
            <p className="mt-1">
              Abre «Categorías y estaciones» y crea o activa lo que falte.
            </p>
          </Alerta>
        )}

        <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
          <Buscador
            valor={busqueda}
            alCambiar={setBusqueda}
            etiqueta="Buscar producto"
            marcador="Buscar por nombre…"
          />

          <div className="mt-3">
            <Pestanas
              opciones={opcionesDePestanas}
              activa={pestanaActiva}
              alCambiar={setPestana}
              etiqueta="Filtrar productos"
            />
          </div>

          {(busqueda.trim() !== "" || pestanaActiva !== "todos") && (
            <p className="mt-2 text-xs text-madera">
              Mostrando {visibles.length} de {total}{" "}
              {total === 1 ? "producto" : "productos"}.
            </p>
          )}

          {refrescando && (
            <p role="status" className="mt-2 text-xs text-madera">
              Actualizando la lista…
            </p>
          )}
        </div>

        <Tabla
          titulo="Catálogo de productos"
          columnas={columnas}
          filas={visibles}
          claveDeFila={(producto) => producto.id_producto}
          vacio={mensajeVacio}
        />
      </div>

      {modalProducto !== null && (
        <ModalProducto
          producto={modalProducto.producto}
          categorias={datos.categorias}
          estaciones={datos.estaciones}
          alCerrar={() => setModalProducto(null)}
          alGuardar={guardarProducto}
        />
      )}

      {catalogoAbierto && (
        <ModalCatalogo
          categorias={datos.categorias}
          estaciones={datos.estaciones}
          alCerrar={() => setCatalogoAbierto(false)}
          alRefrescar={refrescar}
        />
      )}

      {confirmacion !== null && (
        <ModalConfirmacion
          {...textoDeConfirmacion(confirmacion)}
          procesando={procesando}
          error={errorDeAccion}
          alConfirmar={() => {
            void ejecutarConfirmacion();
          }}
          alCerrar={() => {
            if (procesando) return;
            setConfirmacion(null);
            setErrorDeAccion(null);
          }}
        />
      )}
    </div>
  );
}
