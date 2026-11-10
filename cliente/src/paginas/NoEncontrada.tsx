/*
  NoEncontrada.tsx — 404.
  ----------------------

  Una dirección que no existe se dice con claridad y se ofrece la salida. Nunca
  una pantalla en blanco.
*/

import { Compass, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Boton } from "../componentes/Boton";

export function NoEncontrada() {
  const navegar = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-crema p-6">
      <div className="w-full max-w-md rounded-2xl border border-madera/10 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pizarra/10 text-pizarra">
          <Compass size={32} aria-hidden="true" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-pizarra">
          Error 404
        </p>

        <h1 className="mt-1 text-2xl font-semibold">Esta dirección no existe</h1>

        <p className="mt-2 text-sm text-madera">
          Puede que el enlace esté mal escrito o que la pantalla todavía no
          exista.
        </p>

        <div className="mt-6 flex justify-center">
          <Boton
            icono={<Home size={18} aria-hidden="true" />}
            onClick={() => {
              void navegar("/");
            }}
          >
            Volver al inicio
          </Boton>
        </div>
      </div>
    </div>
  );
}
