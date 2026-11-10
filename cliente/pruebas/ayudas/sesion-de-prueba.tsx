/*
  sesion-de-prueba.tsx — montar una pantalla con una sesión ya resuelta.
  --------------------------------------------------------------------

  Las pruebas de pantallas no deberían tener que simular la red para comprobar
  que un botón se deshabilita. Con este ayudante se entrega el contexto de
  sesión directamente, con los permisos que pida cada prueba.

  Y no es una trampa: la sesión de verdad (que sí habla con la API) tiene sus
  propias pruebas en `sesion/ContextoSesion.test.tsx`, y el recorrido completo
  en `App.test.tsx`.
*/

import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import type { UsuarioDeSesion } from "../../src/api/tipos";
import { ContextoSesion } from "../../src/sesion/contexto";
import type { SesionContexto } from "../../src/sesion/contexto";

export const USUARIO_DE_PRUEBA: UsuarioDeSesion = {
  id_usuario: 1,
  usuario: "gerente",
  nombre: "Ana Pérez",
  id_empleado: 1,
  rol: "gerente",
  rol_nombre: "Gerente",
  nivel: 5,
};

export const PERMISOS_DEL_GERENTE: string[] = [
  "ADMINISTRAR_INSUMOS",
  "ADMINISTRAR_MESAS",
  "ADMINISTRAR_PERSONAL",
  "ADMINISTRAR_PRODUCTOS",
  "ADMINISTRAR_PROMOCIONES",
  "ADMINISTRAR_PARAMETROS",
  "ASIGNAR_MESA",
  "CAPTURAR_PEDIDO",
  "CERRAR_PROPINAS",
  "CONFIRMAR_PREPARACION",
  "CONSULTAR_BITACORA",
  "CONSULTAR_REPORTES",
  "EMITIR_COMPROBANTE",
  "GENERAR_CUENTA",
  "GESTIONAR_RESERVA",
  "MOVER_INVENTARIO",
  "REALIZAR_CORTE",
  "REGISTRAR_PAGO",
  "REGISTRAR_PROPINA",
  "REPORTAR_AGOTADO",
  "VER_DISPONIBILIDAD",
  "VER_EXISTENCIAS",
  "VER_MESAS",
];

export const PERMISOS_DEL_MESERO: string[] = [
  "ASIGNAR_MESA",
  "CAPTURAR_PEDIDO",
  "MARCAR_ENTREGA",
  "REGISTRAR_PROPINA",
  "VER_DISPONIBILIDAD",
  "VER_MESAS",
];

/**
 * Un contexto de sesión completo. Lo que no se pase queda con valores
 * razonables: alguien dentro, con los permisos que se indiquen.
 */
export function sesionFalsa(partes: Partial<SesionContexto> = {}): SesionContexto {
  const permisos = partes.permisos ?? [];

  return {
    estado: "autenticado",
    usuario: USUARIO_DE_PRUEBA,
    permisos,
    expiraEn: null,
    aviso: null,
    entrar: () => Promise.resolve(),
    salir: () => Promise.resolve(),
    puede: (codigo) => permisos.includes(codigo),
    descartarAviso: () => undefined,
    ...partes,
  };
}

export interface OpcionesDeMontaje {
  sesion?: SesionContexto;
  ruta?: string;
}

/** Monta una pantalla dentro del router y del contexto de sesión. */
export function montarConSesion(
  ui: ReactNode,
  { sesion = sesionFalsa(), ruta = "/" }: OpcionesDeMontaje = {},
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ContextoSesion.Provider value={sesion}>{ui}</ContextoSesion.Provider>
    </MemoryRouter>,
  );
}
