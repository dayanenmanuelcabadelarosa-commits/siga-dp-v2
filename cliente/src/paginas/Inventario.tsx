/*
  Inventario.tsx — la pantalla de Inventario (M08).
  ------------------------------------------------

  Tres secciones, con permisos distintos:

    · Existencias: lo que hay hoy en cada punto, con aviso de los insumos que
      están por debajo del mínimo. La ve quien tiene VER_EXISTENCIAS (dueño,
      gerente, cocina y almacén).
    · Movimientos: el historial. Es de solo lectura; registrar es otra cosa.
    · Insumos y proveedores: solo con ADMINISTRAR_INSUMOS.

  Los controles se esconden según la matriz aprobada, pero el servidor vuelve a
  comprobar cada permiso. Esconder un botón no es seguridad: es comodidad.

  La cocina, que solo tiene VER_EXISTENCIAS, ve el historial y un aviso honesto
  de que no puede registrar. El almacén y la gerencia ven los botones de mover y
  administrar.

  Ningún dato se guarda en el cliente: después de cada acción se vuelve a pedir
  la lista al servidor.
*/

import {
  Boxes,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";

import { mensajeDeError } from "../api/errores";
import {
  crearInsumo,
  crearProveedor,
  editarInsumo,
  editarProveedor,
  listarInventario,
  listarMovimientos,
  listarProveedores,
  registrarMovimiento,
} from "../api/inventario";
import type {
  DatosDeInventario,
  EntradaDeMovimiento,
  Insumo,
  MovimientoDeInventario,
  Proveedor,
} from "../api/inventario";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Buscador } from "../componentes/Buscador";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { Pestanas } from "../componentes/Pestanas";
import type { OpcionDePestana } from "../componentes/Pestanas";
import { Selector } from "../componentes/Selector";
import { Tabla } from "../componentes/Tabla";
import type { Columna } from "../componentes/Tabla";
import { useSesion } from "../sesion/useSesion";
import { formatearFechaHora } from "../utilidades/fecha";
import {
  formatearCantidad,
  formatearCantidadConSigno,
} from "../utilidades/formato";
import { ModalInsumo } from "./inventario/ModalInsumo";
import type { DatosDelFormularioInsumo } from "./inventario/ModalInsumo";
import { ModalMovimiento } from "./inventario/ModalMovimiento";
import { ModalProveedor } from "./inventario/ModalProveedor";
import type { DatosDelFormularioProveedor } from "./inventario/ModalProveedor";

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function unidadDe(insumo: Insumo): string {
  return `${insumo.unidad} (${insumo.abreviatura})`;
}

function colorDeMovimiento(
  tipo: MovimientoDeInventario["tipo"],
): "verde" | "rojo" | "miel" {
  if (tipo === "Entrada de compra") return "verde";
  if (tipo === "Salida por consumo") return "rojo";
  return "miel";
}

export function Inventario() {
  const { puede } = useSesion();

  const puedeMover = puede("MOVER_INVENTARIO");
  const puedeAdministrar = puede("ADMINISTRAR_INSUMOS");
  const debeCargarProveedores = puedeMover || puedeAdministrar;

  const [datos, setDatos] = useState<DatosDeInventario | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoDeInventario[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [seccion, setSeccion] = useState("existencias");
  const [subseccion, setSubseccion] = useState("insumos");
  const [busqueda, setBusqueda] = useState("");
  const [puntoFiltro, setPuntoFiltro] = useState("todos");
  const [insumoDelHistorial, setInsumoDelHistorial] = useState("todos");

  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalInsumo, setModalInsumo] = useState<{
    insumo: Insumo | null;
  } | null>(null);
  const [modalProveedor, setModalProveedor] = useState<{
    proveedor: Proveedor | null;
  } | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar(): Promise<void> {
      try {
        const [inventario, historial, listaDeProveedores] = await Promise.all([
          listarInventario(),
          listarMovimientos(),
          debeCargarProveedores
            ? listarProveedores()
            : Promise.resolve({ proveedores: [] }),
        ]);

        if (!vigente) return;

        setDatos(inventario);
        setMovimientos(historial.movimientos);
        setProveedores(listaDeProveedores.proveedores);
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
  }, [debeCargarProveedores]);

  /*
    Las existencias cambian solas (el consumo de los pedidos las descuenta), así
    que se actualizan cada 30 segundos. Se detiene mientras hay una ventana
    abierta, para no pisar lo que se está escribiendo, y es silencioso: si
    falla, se sigue viendo lo anterior.
  */
  const hayVentanaAbierta =
    modalMovimiento || modalInsumo !== null || modalProveedor !== null;

  useEffect(() => {
    if (cargando || hayVentanaAbierta) return undefined;

    let vigente = true;

    const intervalo = window.setInterval(() => {
      void (async () => {
        try {
          const [inventario, historial, listaDeProveedores] =
            await Promise.all([
              listarInventario(),
              listarMovimientos(),
              debeCargarProveedores
                ? listarProveedores()
                : Promise.resolve({ proveedores: [] }),
            ]);
          if (!vigente) return;
          setDatos(inventario);
          setMovimientos(historial.movimientos);
          setProveedores(listaDeProveedores.proveedores);
        } catch {
          // Si el refresco falla, la pantalla sigue mostrando lo anterior.
        }
      })();
    }, 30000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [cargando, hayVentanaAbierta, debeCargarProveedores]);

  async function refrescar(): Promise<void> {
    setRefrescando(true);

    try {
      const [inventario, historial, listaDeProveedores] = await Promise.all([
        listarInventario(),
        listarMovimientos(),
        debeCargarProveedores
          ? listarProveedores()
          : Promise.resolve({ proveedores: [] }),
      ]);

      setDatos(inventario);
      setMovimientos(historial.movimientos);
      setProveedores(listaDeProveedores.proveedores);
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
        const [inventario, historial, listaDeProveedores] = await Promise.all([
          listarInventario(),
          listarMovimientos(),
          debeCargarProveedores
            ? listarProveedores()
            : Promise.resolve({ proveedores: [] }),
        ]);

        setDatos(inventario);
        setMovimientos(historial.movimientos);
        setProveedores(listaDeProveedores.proveedores);
      } catch (fallo) {
        setError(mensajeDeError(fallo));
      } finally {
        setCargando(false);
      }
    })();
  }

  async function guardarInsumo(
    entrada: DatosDelFormularioInsumo,
  ): Promise<void> {
    if (entrada.modo === "crear") {
      const creado = await crearInsumo(entrada.datos);
      setAviso(`Se creó el insumo "${creado.nombre}".`);
    } else {
      const enEdicion = modalInsumo?.insumo ?? null;

      if (enEdicion === null) {
        throw new Error("No se sabe qué insumo se está editando.");
      }

      const editado = await editarInsumo(enEdicion.id_insumo, entrada.datos);
      setAviso(`Se actualizó el insumo "${editado.nombre}".`);
    }

    setModalInsumo(null);
    await refrescar();
  }

  async function guardarProveedor(
    entrada: DatosDelFormularioProveedor,
  ): Promise<void> {
    if (entrada.modo === "crear") {
      const creado = await crearProveedor(entrada.datos);
      setAviso(`Se creó el proveedor "${creado.nombre}".`);
    } else {
      const enEdicion = modalProveedor?.proveedor ?? null;

      if (enEdicion === null) {
        throw new Error("No se sabe qué proveedor se está editando.");
      }

      const editado = await editarProveedor(
        enEdicion.id_proveedor,
        entrada.datos,
      );
      setAviso(`Se actualizó el proveedor "${editado.nombre}".`);
    }

    setModalProveedor(null);
    await refrescar();
  }

  async function guardarMovimiento(
    entrada: EntradaDeMovimiento,
  ): Promise<void> {
    const resultado = await registrarMovimiento(entrada);
    const movimiento = resultado.movimiento;
    const verbo =
      movimiento.tipo === "Entrada de compra"
        ? "Entrada registrada"
        : movimiento.tipo === "Salida por consumo"
          ? "Salida registrada"
          : "Ajuste registrado";

    setAviso(
      `${verbo}: ${formatearCantidadConSigno(movimiento.cantidad)} ` +
        `${movimiento.abreviatura} de "${movimiento.insumo}". ` +
        `Existencia en ${movimiento.punto}: ${formatearCantidad(
          resultado.existencia,
        )} ${movimiento.abreviatura}.`,
    );
    setModalMovimiento(false);
    await refrescar();
  }

  if (cargando) {
    return <Cargando texto="Cargando el inventario…" />;
  }

  if (datos === null) {
    return (
      <div>
        <EncabezadoPagina
          titulo="Inventario"
          subtitulo="Las existencias se cargan desde el servidor."
        />

        <Alerta tipo="error" titulo="No se pudo cargar el inventario">
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

  const { insumos, puntos, existencias, unidades } = datos;

  const insumosBajos = insumos.filter(
    (insumo) => insumo.activo && insumo.existencia_total < insumo.minimo,
  );

  const opcionesDeSeccion: OpcionDePestana[] = [
    { valor: "existencias", texto: "Existencias" },
    { valor: "movimientos", texto: "Movimientos" },
    ...(puedeAdministrar
      ? [{ valor: "administracion", texto: "Insumos y proveedores" }]
      : []),
  ];

  const seccionActiva = opcionesDeSeccion.some(
    (opcion) => opcion.valor === seccion,
  )
    ? seccion
    : "existencias";

  const opcionesDePunto: OpcionDePestana[] = [
    { valor: "todos", texto: "Todos" },
    ...puntos.map((punto) => ({
      valor: String(punto.id_punto),
      texto: punto.nombre,
    })),
  ];

  const puntoActivo = opcionesDePunto.some(
    (opcion) => opcion.valor === puntoFiltro,
  )
    ? puntoFiltro
    : "todos";

  const puntoElegido = puntos.find(
    (punto) => String(punto.id_punto) === puntoActivo,
  );

  function existenciaEnPunto(idInsumo: number): number {
    if (puntoElegido === undefined) return 0;

    return (
      existencias.find(
        (fila) =>
          fila.id_insumo === idInsumo &&
          fila.id_punto === puntoElegido.id_punto,
      )?.existencia ?? 0
    );
  }

  const textoBuscado = busqueda.trim().toLocaleLowerCase("es");

  const insumosVisibles = insumos.filter((insumo) => {
    if (textoBuscado === "") return true;

    return insumo.nombre.toLocaleLowerCase("es").includes(textoBuscado);
  });

  const columnasDeExistencias: readonly Columna<Insumo>[] = [
    {
      clave: "insumo",
      encabezado: "Insumo",
      render: (insumo) => (
        <span className="font-medium text-carbon">{insumo.nombre}</span>
      ),
    },
    {
      clave: "unidad",
      encabezado: "Unidad",
      render: (insumo) => unidadDe(insumo),
    },
    {
      clave: "minimo",
      encabezado: "Mínimo",
      alinear: "derecha",
      render: (insumo) => (
        <span className="tabular-nums">
          {formatearCantidad(insumo.minimo)}
        </span>
      ),
    },
    {
      clave: "existencia",
      encabezado: "Existencia",
      alinear: "derecha",
      render: (insumo) => {
        const cantidad =
          puntoElegido === undefined
            ? insumo.existencia_total
            : existenciaEnPunto(insumo.id_insumo);

        return (
          <span className="tabular-nums font-medium">
            {formatearCantidad(cantidad)} {insumo.abreviatura}
          </span>
        );
      },
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (insumo) => {
        if (!insumo.activo) {
          return <Insignia texto="Inactivo" color="gris" />;
        }

        const bajoMinimo = insumo.existencia_total < insumo.minimo;

        return (
          <Insignia
            texto={bajoMinimo ? "Bajo mínimo" : "Suficiente"}
            color={bajoMinimo ? "miel" : "verde"}
          />
        );
      },
    },
  ];

  const mensajeVacioDeExistencias =
    insumos.length === 0
      ? puedeAdministrar
        ? "Todavía no hay insumos. Crea el primero en «Insumos y proveedores»."
        : "Todavía no hay insumos registrados."
      : "No hay insumos que coincidan con la búsqueda.";

  const opcionesDelHistorial = [
    { valor: "todos", texto: "Todos" },
    ...insumos.map((insumo) => ({
      valor: String(insumo.id_insumo),
      texto: insumo.nombre,
    })),
  ];

  const insumoHistorialActivo = opcionesDelHistorial.some(
    (opcion) => opcion.valor === insumoDelHistorial,
  )
    ? insumoDelHistorial
    : "todos";

  const movimientosVisibles =
    insumoHistorialActivo === "todos"
      ? movimientos
      : movimientos.filter(
          (movimiento) =>
            String(movimiento.id_insumo) === insumoHistorialActivo,
        );

  const columnasDeMovimientos: readonly Columna<MovimientoDeInventario>[] = [
    {
      clave: "fecha",
      encabezado: "Fecha",
      render: (movimiento) => (
        <span className="whitespace-nowrap text-xs text-madera">
          {formatearFechaHora(movimiento.ocurrido_en)}
        </span>
      ),
    },
    {
      clave: "tipo",
      encabezado: "Tipo",
      render: (movimiento) => (
        <Insignia
          texto={movimiento.tipo}
          color={colorDeMovimiento(movimiento.tipo)}
        />
      ),
    },
    {
      clave: "insumo",
      encabezado: "Insumo",
      render: (movimiento) => (
        <span className="font-medium text-carbon">{movimiento.insumo}</span>
      ),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      render: (movimiento) => (
        <span
          className={`tabular-nums font-semibold ${
            movimiento.cantidad > 0 ? "text-hoja" : "text-ladrillo"
          }`}
        >
          {formatearCantidadConSigno(movimiento.cantidad)}{" "}
          {movimiento.abreviatura}
        </span>
      ),
    },
    {
      clave: "punto",
      encabezado: "Punto",
      render: (movimiento) => movimiento.punto,
    },
    {
      clave: "proveedor",
      encabezado: "Proveedor",
      render: (movimiento) => movimiento.proveedor ?? "—",
    },
    {
      clave: "empleado",
      encabezado: "Registrado por",
      render: (movimiento) => movimiento.empleado ?? "—",
    },
    {
      clave: "detalle",
      encabezado: "Detalle",
      render: (movimiento) => (
        <span className="text-sm">{movimiento.detalle}</span>
      ),
    },
  ];

  /*
    La tabla de administración no hereda el filtro por punto de Existencias:
    aquí siempre se muestra la suma de todos los puntos y se dice así en el
    encabezado. Si heredara el filtro, la misma columna cambiaría de significado
    sin avisar.
  */
  const columnasDeInsumos: readonly Columna<Insumo>[] = [
    {
      clave: "insumo",
      encabezado: "Insumo",
      render: (insumo) => (
        <span className="font-medium text-carbon">{insumo.nombre}</span>
      ),
    },
    {
      clave: "unidad",
      encabezado: "Unidad",
      render: (insumo) => unidadDe(insumo),
    },
    {
      clave: "minimo",
      encabezado: "Mínimo",
      alinear: "derecha",
      render: (insumo) => (
        <span className="tabular-nums">
          {formatearCantidad(insumo.minimo)}
        </span>
      ),
    },
    {
      clave: "existencia_total",
      encabezado: "Existencia total",
      alinear: "derecha",
      render: (insumo) => (
        <span className="tabular-nums font-medium">
          {formatearCantidad(insumo.existencia_total)} {insumo.abreviatura}
        </span>
      ),
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (insumo) => {
        if (!insumo.activo) {
          return <Insignia texto="Inactivo" color="gris" />;
        }

        const bajoMinimo = insumo.existencia_total < insumo.minimo;

        return (
          <Insignia
            texto={bajoMinimo ? "Bajo mínimo" : "Suficiente"}
            color={bajoMinimo ? "miel" : "verde"}
          />
        );
      },
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      render: (insumo) => (
        <Boton
          variante="texto"
          aria-label={`Editar insumo ${insumo.nombre}`}
          title={`Editar ${insumo.nombre}`}
          icono={<Pencil size={16} aria-hidden="true" />}
          onClick={() => {
            setAviso(null);
            setModalInsumo({ insumo });
          }}
        >
          <span className="sr-only">Editar</span>
        </Boton>
      ),
    },
  ];

  const columnasDeProveedores: readonly Columna<Proveedor>[] = [
    {
      clave: "proveedor",
      encabezado: "Proveedor",
      render: (proveedor) => (
        <span className="font-medium text-carbon">{proveedor.nombre}</span>
      ),
    },
    {
      clave: "telefono",
      encabezado: "Teléfono",
      render: (proveedor) => proveedor.telefono,
    },
    {
      clave: "compras",
      encabezado: "Compras",
      alinear: "derecha",
      render: (proveedor) => proveedor.compras,
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (proveedor) => (
        <Insignia
          texto={proveedor.estado}
          color={proveedor.estado === "Activo" ? "verde" : "gris"}
        />
      ),
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      render: (proveedor) => (
        <Boton
          variante="texto"
          aria-label={`Editar proveedor ${proveedor.nombre}`}
          title={`Editar ${proveedor.nombre}`}
          icono={<Pencil size={16} aria-hidden="true" />}
          onClick={() => {
            setAviso(null);
            setModalProveedor({ proveedor });
          }}
        >
          <span className="sr-only">Editar</span>
        </Boton>
      ),
    },
  ];

  const puedeCrearInsumo = unidades.length > 0;

  return (
    <div>
      <EncabezadoPagina
        titulo="Inventario"
        subtitulo={`${contar(insumos.length, "insumo", "insumos")} · ${
          insumosBajos.length === 0
            ? "todo por encima del mínimo"
            : `${insumosBajos.length} por debajo del mínimo`
        } · ${contar(puntos.length, "punto", "puntos")}.`}
        acciones={
          <>
            {puedeAdministrar && (
              <Boton
                variante="secundario"
                icono={<Settings2 size={16} aria-hidden="true" />}
                onClick={() => setSeccion("administracion")}
              >
                Administrar insumos y proveedores
              </Boton>
            )}

            {puedeMover && (
              <Boton
                icono={<Plus size={16} aria-hidden="true" />}
                onClick={() => {
                  setAviso(null);
                  setModalMovimiento(true);
                }}
              >
                Registrar movimiento
              </Boton>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}

        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar el inventario">
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

        {insumosBajos.length > 0 && (
          <Alerta tipo="aviso" titulo="Hay insumos bajo el mínimo">
            <p>Repón estos insumos para no quedarte sin ellos en el servicio:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {insumosBajos.slice(0, 5).map((insumo) => (
                <li key={insumo.id_insumo}>
                  <strong>{insumo.nombre}</strong>: quedan{" "}
                  {formatearCantidad(insumo.existencia_total)}{" "}
                  {insumo.abreviatura} y el mínimo es{" "}
                  {formatearCantidad(insumo.minimo)} {insumo.abreviatura}.
                </li>
              ))}
            </ul>
            {insumosBajos.length > 5 && (
              <p className="mt-1">
                Y {insumosBajos.length - 5} más en la tabla.
              </p>
            )}
          </Alerta>
        )}

        <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
          <Pestanas
            opciones={opcionesDeSeccion}
            activa={seccionActiva}
            alCambiar={setSeccion}
            etiqueta="Secciones del inventario"
          />
        </div>

        {seccionActiva === "existencias" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <Buscador
                valor={busqueda}
                alCambiar={setBusqueda}
                etiqueta="Buscar insumo"
                marcador="Buscar por nombre…"
              />

              <div className="mt-3">
                <Pestanas
                  opciones={opcionesDePunto}
                  activa={puntoActivo}
                  alCambiar={setPuntoFiltro}
                  etiqueta="Filtrar existencias por punto"
                />
              </div>

              <p className="mt-2 text-xs text-madera">
                {puntoElegido === undefined
                  ? "Mostrando la suma de todos los puntos de acceso."
                  : `Mostrando la existencia en ${puntoElegido.nombre}.`}
              </p>

              {refrescando && (
                <p role="status" className="mt-2 text-xs text-madera">
                  Actualizando el inventario…
                </p>
              )}
            </div>

            <Tabla
              titulo="Existencias de insumos"
              columnas={columnasDeExistencias}
              filas={insumosVisibles}
              claveDeFila={(insumo) => insumo.id_insumo}
              vacio={mensajeVacioDeExistencias}
            />
          </div>
        )}

        {seccionActiva === "movimientos" && (
          <div className="space-y-4">
            {!puedeMover && (
              <Alerta tipo="info" titulo="Solo lectura">
                Puedes consultar los movimientos. Registrar entradas, salidas y
                ajustes lo hace el almacén o la gerencia.
              </Alerta>
            )}

            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <Selector
                etiqueta="Filtrar por insumo"
                value={insumoHistorialActivo}
                opciones={opcionesDelHistorial}
                onChange={(evento) =>
                  setInsumoDelHistorial(evento.target.value)
                }
              />

              <p className="mt-2 text-xs text-madera">
                {movimientosVisibles.length === movimientos.length
                  ? `${contar(
                      movimientos.length,
                      "movimiento",
                      "movimientos",
                    )} en total.`
                  : `Mostrando ${movimientosVisibles.length} de ${movimientos.length} movimientos.`}
              </p>

              {refrescando && (
                <p role="status" className="mt-2 text-xs text-madera">
                  Actualizando el historial…
                </p>
              )}
            </div>

            <Tabla
              titulo="Historial de movimientos de inventario"
              columnas={columnasDeMovimientos}
              filas={movimientosVisibles}
              claveDeFila={(movimiento) => movimiento.id_movimiento}
              vacio={
                movimientos.length === 0
                  ? "Todavía no hay movimientos de inventario."
                  : "No hay movimientos de ese insumo."
              }
            />
          </div>
        )}

        {seccionActiva === "administracion" && puedeAdministrar && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
              <Pestanas
                opciones={[
                  { valor: "insumos", texto: "Insumos" },
                  { valor: "proveedores", texto: "Proveedores" },
                ]}
                activa={subseccion}
                alCambiar={setSubseccion}
                etiqueta="Administración del inventario"
              />
            </div>

            {subseccion === "insumos" ? (
              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-carbon">
                      <Boxes size={18} aria-hidden="true" />
                      Insumos
                    </h2>
                    <p className="mt-1 text-sm text-madera">
                      Lo que se compra y se consume. Un insumo no se borra: se
                      desactiva y conserva su historial.
                    </p>
                  </div>

                  <Boton
                    icono={<Plus size={16} aria-hidden="true" />}
                    disabled={!puedeCrearInsumo}
                    title={
                      puedeCrearInsumo
                        ? undefined
                        : "No hay unidades de medida configuradas."
                    }
                    onClick={() => {
                      setAviso(null);
                      setModalInsumo({ insumo: null });
                    }}
                  >
                    Nuevo insumo
                  </Boton>
                </div>

                {!puedeCrearInsumo && (
                  <Alerta tipo="aviso" titulo="Falta una unidad de medida">
                    No hay unidades configuradas, así que no se puede crear un
                    insumo todavía.
                  </Alerta>
                )}

                <Tabla
                  titulo="Insumos registrados"
                  columnas={columnasDeInsumos}
                  filas={insumos}
                  claveDeFila={(insumo) => insumo.id_insumo}
                  vacio="Todavía no hay insumos. Crea el primero con «Nuevo insumo»."
                />
              </section>
            ) : (
              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-carbon">
                      <Truck size={18} aria-hidden="true" />
                      Proveedores
                    </h2>
                    <p className="mt-1 text-sm text-madera">
                      De quién se compra. Un proveedor inactivo conserva sus
                      compras, pero no se puede usar en una entrada nueva.
                    </p>
                  </div>

                  <Boton
                    icono={<Plus size={16} aria-hidden="true" />}
                    onClick={() => {
                      setAviso(null);
                      setModalProveedor({ proveedor: null });
                    }}
                  >
                    Nuevo proveedor
                  </Boton>
                </div>

                <Tabla
                  titulo="Proveedores registrados"
                  columnas={columnasDeProveedores}
                  filas={proveedores}
                  claveDeFila={(proveedor) => proveedor.id_proveedor}
                  vacio="Todavía no hay proveedores. Crea el primero con «Nuevo proveedor»."
                />
              </section>
            )}
          </div>
        )}
      </div>

      {modalMovimiento && (
        <ModalMovimiento
          insumos={insumos}
          puntos={puntos}
          proveedores={proveedores}
          existencias={existencias}
          alCerrar={() => setModalMovimiento(false)}
          alGuardar={guardarMovimiento}
        />
      )}

      {modalInsumo !== null && (
        <ModalInsumo
          insumo={modalInsumo.insumo}
          unidades={unidades}
          alCerrar={() => setModalInsumo(null)}
          alGuardar={guardarInsumo}
        />
      )}

      {modalProveedor !== null && (
        <ModalProveedor
          proveedor={modalProveedor.proveedor}
          alCerrar={() => setModalProveedor(null)}
          alGuardar={guardarProveedor}
        />
      )}
    </div>
  );
}
