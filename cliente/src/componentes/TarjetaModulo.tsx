/*
  TarjetaModulo.tsx — un módulo en la pantalla de inicio.
  ------------------------------------------------------

  Es la tarjeta grande del prototipo: icono, nombre, para qué sirve y la fase
  en la que llega. Toda la tarjeta es el enlace, así que se puede abrir con el
  ratón o con el teclado.
*/

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { Modulo } from "../modulos";

export function TarjetaModulo({ modulo }: { modulo: Modulo }) {
  const Icono = modulo.icono;

  return (
    <Link
      to={modulo.ruta}
      className="group flex flex-col rounded-2xl border border-madera/10 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-brasa/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brasa"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brasa/10 text-brasa">
          <Icono size={24} aria-hidden="true" />
        </div>
      </div>

      <h3 className="mt-4 font-semibold">{modulo.nombre}</h3>
      <p className="mt-1 flex-1 text-sm text-madera">{modulo.descripcion}</p>

      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-brasa">
        Entrar
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="transition group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}
