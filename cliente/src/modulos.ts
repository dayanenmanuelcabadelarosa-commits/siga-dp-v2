/*
  modulos.ts — las pantallas del sistema y el permiso que pide cada una.
  ---------------------------------------------------------------------

  Esta lista es la navegación, no datos del negocio. Cada entrada dice:

    · qué pantalla es y con qué icono se reconoce,
    · qué permiso hace falta para verla, y
    · en qué fase se construye.

  El permiso no se decide aquí: es el **código** de una operación que existe en
  la base (tabla `permiso`, migración `008`) y que el servidor comprueba en
  `rol_permiso` en cada petición. Aquí solo se usa para dos cosas:

    1. No enseñar en el menú lo que el rol no puede hacer.
    2. Que una ruta escrita a mano en la barra de direcciones no se abra.

  Y no es la única defensa: el servidor vuelve a comprobar el permiso. Que el
  menú oculte algo no protege nada por sí solo; es comodidad, no seguridad.

  Las fases son las del plan (docs/plan-por-fases.md). Mientras una pantalla no
  exista, su ruta muestra un aviso honesto de en qué fase llega; no finge.
*/

import {
  BarChart3,
  Boxes,
  ChefHat,
  Coins,
  CookingPot,
  CreditCard,
  LayoutGrid,
  Plug,
  FileClock,
  ScrollText,
  Settings,
  Tag,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Secciones del menú, en el orden en que se muestran. */
export const GRUPOS = [
  "Salón",
  "Cocina",
  "Caja",
  "Catálogo",
  "Administración",
] as const;

export type Grupo = (typeof GRUPOS)[number];

export interface Modulo {
  /** Ruta en el navegador, siempre empezando por `/`. */
  ruta: string;
  /** Nombre corto, para el menú. */
  nombre: string;
  /** Una línea que explica para qué sirve, para la pantalla de inicio. */
  descripcion: string;
  /** Código de permiso que exige (de la tabla `permiso`). */
  permiso: string;
  /** Sección del menú donde aparece: se agrupa por tarea, no por tabla. */
  grupo: Grupo;
  /** Fase del plan que construye esta pantalla. */
  fase: number;
  /**
   * ¿La pantalla ya existe? Si es `false`, su ruta muestra el aviso honesto de
   * `EnConstruccion`. Cuando se construye, se cambia a `true` y el inicio deja
   * de decir "Fase N" en su tarjeta.
   */
  disponible: boolean;
  /** Icono del módulo, para el menú y las tarjetas del inicio. */
  icono: LucideIcon;
}

export const MODULOS: readonly Modulo[] = [
  {
    ruta: "/personal",
    grupo: "Administración",
    nombre: "Personal y usuarios",
    descripcion: "Altas, bajas, desbloqueo de cuentas y cambio de clave.",
    permiso: "ADMINISTRAR_PERSONAL",
    fase: 4,
    disponible: true,
    icono: Users,
  },
  {
    ruta: "/productos",
    grupo: "Catálogo",
    nombre: "Productos y catálogo",
    descripcion: "Los platos, sus precios y su disponibilidad.",
    permiso: "ADMINISTRAR_PRODUCTOS",
    fase: 4,
    disponible: true,
    icono: ChefHat,
  },
  {
    ruta: "/mesas",
    grupo: "Salón",
    nombre: "Mesas y reservas",
    descripcion: "El plano del salón y las reservas de los clientes.",
    permiso: "VER_MESAS",
    fase: 4,
    disponible: true,
    icono: LayoutGrid,
  },
  {
    ruta: "/inventario",
    grupo: "Catálogo",
    nombre: "Inventario",
    descripcion: "Insumos, proveedores y movimientos de almacén.",
    permiso: "VER_EXISTENCIAS",
    fase: 4,
    disponible: true,
    icono: Boxes,
  },
  {
    ruta: "/parametros",
    grupo: "Administración",
    nombre: "Parámetros del sistema",
    descripcion: "Datos de la empresa, impuesto y numeración fiscal.",
    permiso: "ADMINISTRAR_PARAMETROS",
    fase: 4,
    disponible: false,
    icono: Settings,
  },
  {
    ruta: "/pedidos",
    grupo: "Salón",
    nombre: "Pedidos",
    descripcion: "Tomar el pedido de una mesa y seguirlo hasta la cocina.",
    permiso: "CAPTURAR_PEDIDO",
    fase: 5,
    disponible: true,
    icono: UtensilsCrossed,
  },
  {
    ruta: "/cocina",
    grupo: "Cocina",
    nombre: "Cocina",
    descripcion: "Las comandas que van saliendo y los platos agotados.",
    permiso: "CONFIRMAR_PREPARACION",
    fase: 5,
    disponible: true,
    icono: CookingPot,
  },
  {
    ruta: "/propinas",
    grupo: "Caja",
    nombre: "Propinas",
    descripcion: "Registrar la propina de tus mesas y cerrar el día.",
    permiso: "REGISTRAR_PROPINA",
    fase: 5,
    disponible: true,
    icono: Coins,
  },
  {
    ruta: "/cuentas",
    grupo: "Caja",
    nombre: "Cuentas",
    descripcion: "Generar la cuenta de una mesa y revisar su detalle.",
    permiso: "GENERAR_CUENTA",
    fase: 6,
    disponible: true,
    icono: CreditCard,
  },
  {
    ruta: "/facturacion",
    grupo: "Caja",
    nombre: "Facturación",
    descripcion: "Historial de comprobantes fiscales, estados, XML y pagos vinculados.",
    permiso: "EMITIR_COMPROBANTE",
    fase: 8,
    disponible: true,
    icono: ScrollText,
  },
  {
    ruta: "/corte",
    grupo: "Caja",
    nombre: "Corte de caja",
    descripcion: "Cerrar el turno y cuadrar el dinero contra los pagos.",
    permiso: "REALIZAR_CORTE",
    fase: 6,
    disponible: true,
    icono: Wallet,
  },
  {
    ruta: "/reportes",
    grupo: "Administración",
    nombre: "Reportes",
    descripcion: "Ventas, propinas, inventario y horas trabajadas.",
    permiso: "CONSULTAR_REPORTES",
    fase: 7,
    disponible: true,
    icono: BarChart3,
  },
  {
    ruta: "/integraciones",
    grupo: "Administración",
    nombre: "Integraciones",
    descripcion: "El estado de PayPal y del asistente, y qué les falta.",
    permiso: "ADMINISTRAR_PARAMETROS",
    fase: 8,
    disponible: true,
    icono: Plug,
  },
  {
    ruta: "/ofertas",
    grupo: "Catálogo",
    nombre: "Descuentos y ofertas",
    descripcion: "Las ofertas del local: se crean, se activan y se aplican al cobrar.",
    permiso: "ADMINISTRAR_PROMOCIONES",
    fase: 8,
    disponible: true,
    icono: Tag,
  },
  {
    ruta: "/bitacora",
    grupo: "Administración",
    nombre: "Bitácora",
    descripcion: "Quién hizo qué y cuándo, para poder revisarlo.",
    permiso: "CONSULTAR_BITACORA",
    fase: 7,
    disponible: true,
    icono: FileClock,
  },
];

/**
 * Los módulos que este rol puede ver, en el orden del catálogo.
 * `permisos` son los códigos que devolvió `GET /api/acceso/yo`. Si la lista
 * viene vacía, el resultado también: se niega por defecto, igual que el
 * servidor.
 */
export function modulosPermitidos(permisos: readonly string[]): Modulo[] {
  /*
    Un módulo que todavía no existe no se ofrece en el menú ni en el inicio: un
    enlace que lleva a "Esta pantalla se está cocinando" solo estorba. Su ruta
    sigue en el catálogo y, escrita a mano, muestra el aviso honesto.
  */
  return MODULOS.filter(
    (modulo) => modulo.disponible && permisos.includes(modulo.permiso),
  );
}


/**
 * Los módulos permitidos, separados por sección y en el orden del menú. Una
 * sección sin módulos no se devuelve.
 */
export function modulosPorGrupo(
  permisos: readonly string[],
): { grupo: Grupo; modulos: Modulo[] }[] {
  const permitidos = modulosPermitidos(permisos);

  return GRUPOS.map((grupo) => ({
    grupo,
    modulos: permitidos.filter((modulo) => modulo.grupo === grupo),
  })).filter((seccion) => seccion.modulos.length > 0);
}
