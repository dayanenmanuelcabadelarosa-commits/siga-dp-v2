/*
  RutaProtegida.tsx — la guarda de las rutas.
  ------------------------------------------

  Envuelve una ruta y decide si se puede entrar. Tres casos:

    1. Todavía se está averiguando quién hay (al recargar): se muestra
       "comprobando tu sesión", no la pantalla de login. Si no, al recargar
       parpadearía el login aunque estuvieras dentro.
    2. No hay nadie: se va a `/entrar`, y se guarda a dónde quería llegar para
       volver ahí después de entrar.
    3. Hay alguien pero su rol no tiene el permiso: se va a la pantalla de
       "no tienes permiso".

  Esto es comodidad, no seguridad: el servidor vuelve a comprobar el permiso en
  cada petición. Que una ruta no se abra en el navegador no protege nada si el
  servidor no lo comprobara también.
*/

import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useSesion } from "../sesion/useSesion";
import { Cargando } from "./Cargando";

export interface RutaProtegidaProps {
  /** Código de permiso que exige la ruta. Sin esto, solo exige sesión. */
  permiso?: string;
  /** Lo que se dibuja si se puede entrar. Si no se da, se dibuja el `<Outlet />`. */
  children?: ReactNode;
}

export function RutaProtegida({ permiso, children }: RutaProtegidaProps) {
  const { estado, puede } = useSesion();
  const ubicacion = useLocation();

  if (estado === "cargando") {
    return <Cargando pantallaCompleta texto="Comprobando tu sesión…" />;
  }

  if (estado === "anonimo") {
    return (
      <Navigate
        to="/entrar"
        replace
        state={{ desde: `${ubicacion.pathname}${ubicacion.search}` }}
      />
    );
  }

  if (permiso !== undefined && !puede(permiso)) {
    return <Navigate to="/sin-permiso" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
