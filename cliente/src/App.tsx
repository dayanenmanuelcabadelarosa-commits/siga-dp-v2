/*
  App.tsx — el mapa de pantallas.
  ------------------------------

  Tres zonas:

    · `/entrar`          pública. Si ya hay sesión, ella misma redirige.
    · el resto           detrás de `RutaProtegida` (sesión) y del
                         `LayoutPrincipal` (menú y cabecera).
    · `/sin-permiso` y   públicas, para poder explicar qué pasó sin depender
      la que no existe    de que la guarda deje entrar.

  Las rutas de los módulos no están escritas a mano una por una: salen del
  catálogo `modulos.ts`. Así, cuando en la Fase 4 se cambie una pantalla "en
  construcción" por la de verdad, no hay dos listas que se puedan desincronizar.

  Cada ruta de módulo exige su permiso en la guarda. Escribir la dirección a
  mano no la abre.
*/

import { Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";

import { LayoutPrincipal } from "./componentes/LayoutPrincipal";
import { RutaProtegida } from "./componentes/RutaProtegida";
import { MODULOS } from "./modulos";
import type { Modulo } from "./modulos";
import { EnConstruccion } from "./paginas/EnConstruccion";
import { Facturacion } from "./paginas/Facturacion";
import { Inicio } from "./paginas/Inicio";
import { Bitacora } from "./paginas/Bitacora";
import { Cocina } from "./paginas/Cocina";
import { Corte } from "./paginas/Corte";
import { Cuentas } from "./paginas/Cuentas";
import { Inventario } from "./paginas/Inventario";
import { Integraciones } from "./paginas/Integraciones";
import { Pedidos } from "./paginas/Pedidos";
import { Mesas } from "./paginas/Mesas";
import { NoEncontrada } from "./paginas/NoEncontrada";
import { Ofertas } from "./paginas/Ofertas";
import { PantallaLogin } from "./paginas/PantallaLogin";
import { Personal } from "./paginas/Personal";
import { Productos } from "./paginas/Productos";
import { Propinas } from "./paginas/Propinas";
import { Reportes } from "./paginas/Reportes";
import { SinPermiso } from "./paginas/SinPermiso";

/*
  Las pantallas que ya existen. Las demás siguen mostrando el aviso de la fase
  en que llegan. Cuando se construye una, se agrega aquí y se marca
  `disponible: true` en el catálogo.
*/
const PANTALLAS: Record<string, ComponentType> = {
  "/personal": Personal,
  "/productos": Productos,
  "/mesas": Mesas,
  "/inventario": Inventario,
  "/integraciones": Integraciones,
  "/ofertas": Ofertas,
  "/pedidos": Pedidos,
  "/bitacora": Bitacora,
  "/cocina": Cocina,
  "/propinas": Propinas,
  "/reportes": Reportes,
  "/corte": Corte,
  "/cuentas": Cuentas,
  "/facturacion": Facturacion,
};

function PantallaDelModulo({ modulo }: { modulo: Modulo }) {
  const Pantalla = PANTALLAS[modulo.ruta];

  if (Pantalla === undefined) {
    return <EnConstruccion modulo={modulo} />;
  }

  return <Pantalla />;
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<PantallaLogin />} />

      <Route element={<RutaProtegida />}>
        <Route element={<LayoutPrincipal />}>
          <Route index element={<Inicio />} />

          {MODULOS.map((modulo) => (
            <Route
              key={modulo.ruta}
              element={<RutaProtegida permiso={modulo.permiso} />}
            >
              <Route
                path={modulo.ruta}
                element={<PantallaDelModulo modulo={modulo} />}
              />
            </Route>
          ))}
        </Route>
      </Route>

      <Route path="/sin-permiso" element={<SinPermiso />} />
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
