/*
  EnConstruccion.tsx — una pantalla que todavía no existe.
  ------------------------------------------------------

  Es honesta a propósito: no muestra datos falsos, ni un formulario que finge
  guardar, ni un "próximamente" vacío. Dice qué pantalla es, para qué va a
  servir y en qué fase del plan llega.

  Cuando esa fase se construya, esta ruta se reemplaza por la pantalla de
  verdad. Mientras tanto, el menú ya es real: solo aparece si el rol tiene el
  permiso que esa pantalla va a exigir.
*/

import { Flame, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import type { Modulo } from "../modulos";

export function EnConstruccion({ modulo }: { modulo: Modulo }) {
  const navegar = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-miel/20 text-brasa">
        <Flame size={32} aria-hidden="true" />
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brasa">
        {modulo.nombre}
      </p>

      <h1 className="mt-1 text-2xl font-semibold">
        Esta pantalla se está cocinando
      </h1>

      <p className="mt-2 max-w-md text-sm text-madera">
        {modulo.descripcion}
      </p>

      <div className="mt-5 w-full max-w-md text-left">
        <Alerta tipo="info" titulo="Próximamente">
          Se construye en una fase posterior del plan, con su ruta en el servidor,
          su prueba y su conexión a la base de datos. Hasta entonces no se muestra
          nada aquí para no dar la impresión de que ya funciona.
        </Alerta>
      </div>

      <div className="mt-6">
        <Boton
          icono={<Home size={18} aria-hidden="true" />}
          onClick={() => {
            void navegar("/");
          }}
        >
          Volver al menú
        </Boton>
      </div>
    </div>
  );
}
