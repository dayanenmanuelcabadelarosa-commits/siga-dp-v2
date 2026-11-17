/*
  Reportes.tsx — reportes del gerente (Fase 7).
  --------------------------------------------
*/

import { useEffect, useState } from "react";

import {
  reporteAgotados,
  reporteInventario,
  reportePropinas,
  reporteVentas,
} from "../api/reportes";
import type {
  InsumoBajoMinimo,
  ProductoAgotado,
  PropinaReporte,
  VentaDelDia,
} from "../api/reportes";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { BotonExportarPdf } from "../componentes/BotonExportarPdf";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Tabla } from "../componentes/Tabla";
import { formatearDinero } from "../utilidades/formato";

export function Reportes() {
  const [ventas, setVentas] = useState<VentaDelDia[]>([]);
  const [propinas, setPropinas] = useState<PropinaReporte[]>([]);
  const [inventario, setInventario] = useState<InsumoBajoMinimo[]>([]);
  const [agotados, setAgotados] = useState<ProductoAgotado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errorDeFechas, setErrorDeFechas] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const [v, p, i, a] = await Promise.all([
          reporteVentas(),
          reportePropinas(),
          reporteInventario(),
          reporteAgotados(),
        ]);
        if (!vigente) return;
        setVentas(v);
        setPropinas(p);
        setInventario(i);
        setAgotados(a);
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

  /**
   * Vuelve a pedir los reportes con las fechas elegidas. Las fechas aplican a
   * ventas y propinas; inventario y agotados son siempre "lo de hoy".
   */
  async function consultar(nuevoDesde = desde, nuevoHasta = hasta) {
    if (nuevoDesde !== "" && nuevoHasta !== "" && nuevoHasta < nuevoDesde) {
      setErrorDeFechas("La fecha final no puede ser anterior a la inicial.");
      return;
    }

    setErrorDeFechas(null);
    setError(null);
    setConsultando(true);

    try {
      const [v, p, i, a] = await Promise.all([
        reporteVentas(nuevoDesde || undefined, nuevoHasta || undefined),
        reportePropinas(nuevoDesde || undefined, nuevoHasta || undefined),
        reporteInventario(),
        reporteAgotados(),
      ]);
      setVentas(v);
      setPropinas(p);
      setInventario(i);
      setAgotados(a);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setConsultando(false);
    }
  }

  if (cargando) {
    return <Cargando texto="Cargando los reportes…" />;
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo="Ventas, propinas, inventario y productos agotados. Las fechas aplican a ventas y propinas."
      />

      <div className="space-y-6">
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo cargar">
            {error}
          </Alerta>
        )}

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
          <div className="flex gap-2">
            <Boton onClick={() => void consultar()} cargando={consultando}>
              Aplicar
            </Boton>
            <Boton
              variante="secundario"
              disabled={consultando}
              onClick={() => {
                setDesde("");
                setHasta("");
                void consultar("", "");
              }}
            >
              Quitar fechas
            </Boton>
          </div>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-carbon">
              Ventas por día
            </h2>
            <BotonExportarPdf
              titulo="Ventas por día"
              subtitulo={desde !== "" && hasta !== "" ? `Del ${desde} al ${hasta}` : desde !== "" ? `Desde ${desde}` : hasta !== "" ? `Hasta ${hasta}` : "Todo el historial"}
              columnas={[
                { encabezado: "Fecha" },
                { encabezado: "Efectivo", alinear: "derecha" },
                { encabezado: "Tarjeta", alinear: "derecha" },
                { encabezado: "PayPal", alinear: "derecha" },
                { encabezado: "Crédito", alinear: "derecha" },
                { encabezado: "Total", alinear: "derecha" },
                { encabezado: "Descuentos", alinear: "derecha" },
                { encabezado: "Pagos", alinear: "derecha" },
              ]}
              filas={ventas.map((fila) => [
                fila.fecha,
                formatearDinero(fila.efectivo),
                formatearDinero(fila.tarjeta),
                formatearDinero(fila.paypal),
                formatearDinero(fila.credito),
                formatearDinero(fila.total),
                formatearDinero(fila.descuentos),
                fila.pagos,
              ])}
              nombreArchivo="ventas_por_dia"
            />
          </div>
          <Tabla
            titulo="Ventas por día"
            filas={ventas}
            claveDeFila={(fila) => fila.fecha}
            vacio="No hay ventas registradas."
            columnas={[
              {
                clave: "fecha",
                encabezado: "Fecha",
                render: (fila) => fila.fecha,
              },
              {
                clave: "efectivo",
                encabezado: "Efectivo",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.efectivo),
              },
              {
                clave: "tarjeta",
                encabezado: "Tarjeta",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.tarjeta),
              },
              {
                clave: "paypal",
                encabezado: "PayPal",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.paypal),
              },
              {
                clave: "credito",
                encabezado: "Crédito",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.credito),
              },
              {
                clave: "total",
                encabezado: "Total",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.total),
              },
              {
                clave: "descuentos",
                encabezado: "Descuentos",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.descuentos),
              },
              {
                clave: "pagos",
                encabezado: "Pagos",
                alinear: "derecha",
                render: (fila) => fila.pagos,
              },
            ]}
          />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-carbon">
              Propinas por empleado
            </h2>
            <BotonExportarPdf
              titulo="Propinas por empleado"
              subtitulo={desde !== "" && hasta !== "" ? `Del ${desde} al ${hasta}` : desde !== "" ? `Desde ${desde}` : hasta !== "" ? `Hasta ${hasta}` : "Todo el historial"}
              columnas={[
                { encabezado: "Empleado" },
                { encabezado: "Fecha" },
                { encabezado: "Cantidad", alinear: "derecha" },
                { encabezado: "Total", alinear: "derecha" },
              ]}
              filas={propinas.map((fila) => [
                fila.empleado,
                fila.fecha,
                fila.cantidad,
                formatearDinero(fila.total),
              ])}
              nombreArchivo="propinas_por_empleado"
            />
          </div>
          <Tabla
            titulo="Propinas por empleado"
            filas={propinas}
            claveDeFila={(fila) => `${fila.empleado}-${fila.fecha}`}
            vacio="No hay propinas registradas."
            columnas={[
              {
                clave: "empleado",
                encabezado: "Empleado",
                render: (fila) => fila.empleado,
              },
              {
                clave: "fecha",
                encabezado: "Fecha",
                render: (fila) => fila.fecha,
              },
              {
                clave: "cantidad",
                encabezado: "Cantidad",
                alinear: "derecha",
                render: (fila) => fila.cantidad,
              },
              {
                clave: "total",
                encabezado: "Total",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.total),
              },
            ]}
          />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-carbon">
              Insumos bajo mínimo
            </h2>
            <BotonExportarPdf
              titulo="Insumos bajo mínimo"
              subtitulo="Insumos por debajo del mínimo registrado"
              columnas={[
                { encabezado: "Insumo" },
                { encabezado: "Existencia", alinear: "derecha" },
                { encabezado: "Mínimo", alinear: "derecha" },
                { encabezado: "Faltante", alinear: "derecha" },
                { encabezado: "Punto" },
              ]}
              filas={inventario.map((fila) => [
                fila.nombre,
                fila.existencia,
                fila.minimo,
                fila.faltante,
                fila.punto,
              ])}
              nombreArchivo="insumos_bajo_minimo"
            />
          </div>
          <Tabla
            titulo="Insumos bajo mínimo"
            filas={inventario}
            claveDeFila={(fila) => fila.nombre}
            vacio="No hay insumos bajo mínimo."
            columnas={[
              {
                clave: "nombre",
                encabezado: "Insumo",
                render: (fila) => fila.nombre,
              },
              {
                clave: "existencia",
                encabezado: "Existencia",
                alinear: "derecha",
                render: (fila) => fila.existencia,
              },
              {
                clave: "minimo",
                encabezado: "Mínimo",
                alinear: "derecha",
                render: (fila) => fila.minimo,
              },
              {
                clave: "faltante",
                encabezado: "Faltante",
                alinear: "derecha",
                render: (fila) => fila.faltante,
              },
              {
                clave: "punto",
                encabezado: "Punto",
                render: (fila) => fila.punto,
              },
            ]}
          />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-carbon">
              Productos agotados
            </h2>
            <BotonExportarPdf
              titulo="Productos agotados"
              subtitulo="Productos no disponibles actualmente"
              columnas={[
                { encabezado: "Producto" },
                { encabezado: "Categoría" },
                { encabezado: "Estación" },
                { encabezado: "Precio", alinear: "derecha" },
                { encabezado: "Horas agotado", alinear: "derecha" },
              ]}
              filas={agotados.map((fila) => [
                fila.nombre,
                fila.categoria,
                fila.estacion,
                formatearDinero(fila.precio),
                fila.horas ?? "—",
              ])}
              nombreArchivo="productos_agotados"
            />
          </div>
          <Tabla
            titulo="Productos agotados"
            filas={agotados}
            claveDeFila={(fila) => fila.idProducto}
            vacio="No hay productos agotados."
            columnas={[
              {
                clave: "nombre",
                encabezado: "Producto",
                render: (fila) => fila.nombre,
              },
              {
                clave: "categoria",
                encabezado: "Categoría",
                render: (fila) => fila.categoria,
              },
              {
                clave: "estacion",
                encabezado: "Estación",
                render: (fila) => fila.estacion,
              },
              {
                clave: "precio",
                encabezado: "Precio",
                alinear: "derecha",
                render: (fila) => formatearDinero(fila.precio),
              },
              {
                clave: "horas",
                encabezado: "Horas agotado",
                alinear: "derecha",
                render: (fila) => fila.horas ?? "—",
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
