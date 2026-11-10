/*
  Bitacora.tsx — consultar la bitácora de auditoría (Fase 7).
  -----------------------------------------------------------
*/

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { listarBitacora } from "../api/bitacora";
import type { RegistroDeBitacora } from "../api/bitacora";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Tabla } from "../componentes/Tabla";

export function Bitacora() {
  const [registros, setRegistros] = useState<RegistroDeBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [accion, setAccion] = useState("");
  const [tabla, setTabla] = useState("");

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const datos = await listarBitacora({ limite: 100 });
        if (vigente) setRegistros(datos);
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
    return <Cargando texto="Cargando la bitácora…" />;
  }

  async function aplicarFiltros() {
    setRefrescando(true);
    setError(null);

    try {
      setRegistros(
        await listarBitacora({
          desde: desde || undefined,
          hasta: hasta || undefined,
          accion: accion || undefined,
          tabla: tabla || undefined,
          limite: 200,
        }),
      );
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Bitácora"
        subtitulo="Quién hizo qué y cuándo. Solo lectura."
        acciones={
          <Boton
            variante="secundario"
            onClick={() => void aplicarFiltros()}
            cargando={refrescando}
            textoDeCarga="Refrescando…"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Aplicar filtros
          </Boton>
        }
      />

      <div className="space-y-5">
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo cargar">
            {error}
          </Alerta>
        )}

        <div className="grid gap-3 rounded-2xl border border-madera/10 bg-white p-4 shadow-sm sm:grid-cols-4">
          <Campo
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
          />
          <Campo
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
          />
          <Campo
            etiqueta="Acción"
            value={accion}
            onChange={(evento) => setAccion(evento.target.value)}
          />
          <Campo
            etiqueta="Tabla"
            value={tabla}
            onChange={(evento) => setTabla(evento.target.value)}
          />
        </div>

        <Tabla
          titulo="Registros de auditoría"
          filas={registros}
          claveDeFila={(registro) => registro.id}
          vacio="No hay registros para los filtros elegidos."
          columnas={[
            {
              clave: "cuando",
              encabezado: "Cuándo",
              render: (registro) => registro.cuando,
            },
            {
              clave: "usuario",
              encabezado: "Usuario",
              render: (registro) => registro.usuario ?? "—",
            },
            {
              clave: "accion",
              encabezado: "Acción",
              render: (registro) => registro.accion,
            },
            {
              clave: "detalle",
              encabezado: "Detalle",
              render: (registro) => registro.detalle,
            },
            {
              clave: "tabla",
              encabezado: "Tabla",
              render: (registro) => registro.tabla ?? "—",
            },
          ]}
        />
      </div>
    </div>
  );
}
