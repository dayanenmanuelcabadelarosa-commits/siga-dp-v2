/*
  Inicio.tsx — la pantalla con la que arranca el día.
  ------------------------------------------------

  Es el "menú principal" del prototipo: un saludo, el rol con el que se está
  trabajando y una tarjeta por cada pantalla que ese rol puede abrir.

  No tiene números inventados. Lo que muestra es real y sale de la sesión:

    · Cómo se llama la persona y qué rol tiene (lo leyó el servidor).
    · Hasta cuándo vale su sesión.
    · Las pantallas que su rol puede abrir, según la matriz de permisos.

  Las tarjetas no son un adorno: son la forma de comprobar de un vistazo que
  cada rol ve lo suyo. Un mesero ve una; el gerente, todas.
*/

import { Alerta } from "../componentes/Alerta";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { TarjetaModulo } from "../componentes/TarjetaModulo";
import { modulosPermitidos } from "../modulos";
import { useSesion } from "../sesion/useSesion";

/** Saludo según la hora del día. */
function saludo(): string {
  const hora = new Date().getHours();

  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** La fecha de vencimiento, escrita para una persona (no en ISO). */
function fechaLegible(iso: string | null): string | null {
  if (iso === null) return null;

  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;

  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);
}

export function Inicio() {
  const { usuario, permisos, expiraEn } = useSesion();

  const modulos = modulosPermitidos(permisos);
  const primerNombre = (usuario?.nombre ?? "").split(" ")[0] ?? "";
  const vence = fechaLegible(expiraEn);

  return (
    <div>
      <EncabezadoPagina
        codigo="Inicio"
        titulo={`${saludo()}, ${primerNombre}`}
        subtitulo={`Estás trabajando como ${usuario?.rol_nombre ?? ""}. Elige un módulo para comenzar.`}
      />

      {vence !== null && (
        <p className="-mt-3 mb-5 text-xs text-madera/70">
          Tu sesión vale hasta el {vence}
        </p>
      )}

      {modulos.length === 0 ? (
        <Alerta tipo="aviso" titulo="Sin pantallas asignadas">
          Tu rol no tiene ninguna pantalla en este momento. Si crees que es un
          error, habla con el administrador.
        </Alerta>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modulos.map((modulo) => (
            <TarjetaModulo key={modulo.ruta} modulo={modulo} />
          ))}
        </div>
      )}
    </div>
  );
}
