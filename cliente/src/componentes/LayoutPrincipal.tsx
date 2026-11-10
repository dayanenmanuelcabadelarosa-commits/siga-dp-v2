/*
  LayoutPrincipal.tsx — el marco de todas las pantallas de dentro.
  ---------------------------------------------------------------

  Es el mismo esqueleto del prototipo: barra lateral oscura con el logo y las
  pantallas del rol, barra superior con la persona y la salida, y el contenido
  al centro.

  El menú se arma con `modulosPermitidos`, que filtra el catálogo por los
  permisos que devolvió el servidor. Si un rol no tiene ninguno, el menú se
  queda con "Menú principal" y la pantalla de inicio lo explica; no se inventa
  una pantalla que no le toca.

  En celular y tablet la barra se abre con el botón de arriba y se cierra al
  elegir una pantalla o al tocar el fondo oscuro.

  "Salir" se deshabilita mientras cierra, para que nadie lo pulse dos veces y se
  quede a medias.
*/

import { Home, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { Logo } from "./Logo";
import { Boton } from "./Boton";
import { ChatDonaPula } from "./ChatDonaPula";
import { modulosPorGrupo } from "../modulos";
import { useSesion } from "../sesion/useSesion";

function clasesDeEnlace(activo: boolean): string {
  const base =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition pointer-coarse:py-3.5 pointer-coarse:text-base";

  return activo
    ? `${base} bg-brasa text-white`
    : `${base} text-crema/75 hover:bg-white/10 hover:text-white`;
}

/** "María Rodríguez" → "MR" para el círculo del usuario. */
function inicialesDe(nombre: string): string {
  return nombre
    .split(" ")
    .filter((palabra) => palabra !== "")
    .map((palabra) => palabra[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function LayoutPrincipal() {
  const { usuario, permisos, salir } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const nombre = usuario?.nombre ?? "";
  const iniciales = inicialesDe(nombre);

  async function manejarSalida(): Promise<void> {
    setSaliendo(true);
    try {
      await salir();
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-carbon text-crema transition-transform lg:static lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo tamano={44} />

          <div className="min-w-0 leading-tight">
            <p className="font-semibold">Doña Pula</p>
            <p className="text-xs text-miel">SIGA-DP</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setMenuAbierto(false);
            }}
            className="ml-auto rounded-lg p-1 hover:bg-white/10 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label="Pantallas"
          className="flex-1 space-y-1 overflow-y-auto px-3 pb-6"
        >
          <NavLink
            to="/"
            end
            onClick={() => {
              setMenuAbierto(false);
            }}
            className={({ isActive }) => clasesDeEnlace(isActive)}
          >
            <Home size={18} aria-hidden="true" />
            Menú principal
          </NavLink>

          {modulosPorGrupo(permisos).map(({ grupo, modulos: delGrupo }) => (
            <div key={grupo}>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-crema/40">
                {grupo}
              </p>

              {delGrupo.map((modulo) => {
                const Icono = modulo.icono;

                return (
                  <NavLink
                    key={modulo.ruta}
                    to={modulo.ruta}
                    onClick={() => {
                      setMenuAbierto(false);
                    }}
                    className={({ isActive }) => clasesDeEnlace(isActive)}
                  >
                    <Icono size={18} aria-hidden="true" />
                    <span className="flex-1">{modulo.nombre}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <p className="px-5 py-4 text-xs text-crema/40">A pura leña · Santiago</p>
      </aside>

      {/* Fondo oscuro detrás del menú cuando está abierto en pantallas pequeñas */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-carbon/50 lg:hidden"
          onClick={() => {
            setMenuAbierto(false);
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-madera/10 bg-crema/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => {
              setMenuAbierto(true);
            }}
            className="rounded-lg p-2 hover:bg-madera/10 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu size={22} aria-hidden="true" />
          </button>

          <p className="hidden text-sm text-madera sm:block">
            Sistema Integrado de Gestión y Atención
          </p>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-[12rem] truncate text-sm font-semibold">{nombre}</p>
              <p className="text-xs text-madera">{usuario?.rol_nombre ?? ""}</p>
            </div>

            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-miel font-semibold text-carbon"
              aria-hidden="true"
            >
              {iniciales}
            </div>

            <Boton
              variante="secundario"
              cargando={saliendo}
              textoDeCarga="Saliendo…"
              icono={<LogOut size={18} aria-hidden="true" />}
              onClick={() => {
                void manejarSalida();
              }}
            >
              Salir
            </Boton>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* El muñequito de Doña Pula: el chat está en todas las pantallas. */}
      <ChatDonaPula />
    </div>
  );
}
