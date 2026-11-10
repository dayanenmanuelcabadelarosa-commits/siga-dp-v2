/*
  SinPermiso.tsx — 403, dicho en español.
  --------------------------------------

  Se llega aquí cuando hay sesión pero el rol no tiene el permiso de la ruta.
  Se explica con claridad y se ofrece una salida; no se deja a la persona en una
  pantalla en blanco (regla de oro 7).

  Y se recuerda lo importante: el servidor también lo revisa. Que esta pantalla
  exista no es la protección; la protección está en `rol_permiso`.
*/

import { Home, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Boton } from "../componentes/Boton";
import { useSesion } from "../sesion/useSesion";

export function SinPermiso() {
  const { estado, usuario } = useSesion();
  const navegar = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-crema p-6">
      <div className="w-full max-w-md rounded-2xl border border-madera/10 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ladrillo/10 text-ladrillo">
          <ShieldAlert size={32} aria-hidden="true" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-ladrillo">
          Acceso denegado
        </p>

        <h1 className="mt-1 text-2xl font-semibold">
          No tienes permiso para esta pantalla
        </h1>

        <p className="mt-2 text-sm text-madera">
          Tu rol no tiene asignada esta operación. Si crees que deberías poder
          entrar, habla con el administrador para que revise la matriz de
          permisos.
        </p>

        {estado === "autenticado" && usuario !== null && (
          <p className="mt-3 text-sm text-madera/80">
            Entraste como {usuario.nombre} ({usuario.rol_nombre}).
          </p>
        )}

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
