/*
  Integraciones.tsx — el estado de las APIs externas (Fase 8).
  -----------------------------------------------------------
*/

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { obtenerEstadoDeIntegraciones } from "../api/integraciones";
import type { EstadoDeIntegracion } from "../api/integraciones";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { Tabla } from "../componentes/Tabla";

export function Integraciones() {
  const [integraciones, setIntegraciones] = useState<EstadoDeIntegracion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const datos = await obtenerEstadoDeIntegraciones();
        if (vigente) setIntegraciones(datos);
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
    return <Cargando texto="Revisando las integraciones…" />;
  }

  async function refrescar() {
    setRefrescando(true);
    setError(null);

    try {
      setIntegraciones(await obtenerEstadoDeIntegraciones());
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Integraciones"
        subtitulo="Revisa si las APIs externas están listas y qué les falta."
        acciones={
          <Boton
            variante="secundario"
            onClick={() => void refrescar()}
            cargando={refrescando}
            textoDeCarga="Revisando…"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Revisar de nuevo
          </Boton>
        }
      />

      <div className="space-y-5">
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo revisar">
            {error}
          </Alerta>
        )}

        <Alerta tipo="info">
          Las claves van en <strong>servidor/.env</strong>, nunca en la base de
          datos. Si algo falta, el sistema lo dice con claridad y no simula que
          la integración funciona.
        </Alerta>

        <Tabla
          titulo="Estado de las integraciones"
          filas={integraciones}
          claveDeFila={(integracion) => integracion.nombre}
          vacio="No hay integraciones que revisar."
          columnas={[
            {
              clave: "nombre",
              encabezado: "Integración",
              render: (integracion) => integracion.nombre,
            },
            {
              clave: "estado",
              encabezado: "Estado",
              render: (integracion) =>
                integracion.listo ? (
                  <Insignia texto="Lista" color="verde" />
                ) : (
                  <Insignia texto="Falta configuración" color="miel" />
                ),
            },
            {
              clave: "url",
              encabezado: "Dirección",
              render: (integracion) => integracion.url,
            },
            {
              clave: "mensaje",
              encabezado: "Qué pasa",
              render: (integracion) => integracion.mensaje,
            },
          ]}
        />
      </div>
    </div>
  );
}
