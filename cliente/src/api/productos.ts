/*
  productos.ts — las llamadas del módulo Productos y catálogo.
  ----------------------------------------------------------

  El servidor devuelve el precio como número (la base usa el dominio `dinero`,
  que es NUMERIC(12,2)); al escribir se manda como texto para no pasar por los
  redondeos de JavaScript. El formulario conserva ese mismo texto.
*/

import { pedir } from "./cliente-http";

/** Un producto tal como lo devuelve `GET /api/productos`. */
export interface Producto {
  id_producto: number;
  nombre: string;
  id_categoria: number;
  categoria: string;
  /** La categoría puede estar inactiva aunque el producto esté activo. */
  categoria_activa: boolean;
  id_estacion: number;
  estacion: string;
  /** Número, no texto. La pantalla lo formatea en RD$. */
  precio: number;
  /** Disponibilidad del día. Es distinta de `activo`. */
  disponible: boolean;
  /** Lo que la cocina podrá marcar en la Fase 5. */
  riesgo_agotarse: boolean;
  /** Si está en el catálogo. Un producto inactivo no se vende. */
  activo: boolean;
  /**
   * Minutos que se toma el plato. `null` = sin estimar. El asistente de IA
   * toma el tiempo de aquí, nunca de un número fijo.
   */
  tiempo_estimado_minutos: number | null;
  /** Fecha ISO que devuelve PostgreSQL. */
  creado_en: string;
  /** Fecha ISO que devuelve PostgreSQL. */
  modificado_en: string;
}

export interface Categoria {
  id_categoria: number;
  nombre: string;
  activo: boolean;
}

export interface Estacion {
  id_estacion: number;
  nombre: string;
}

/** Lo que devuelve la lista: el catálogo completo para la pantalla. */
export interface DatosDeProductos {
  productos: Producto[];
  categorias: Categoria[];
  estaciones: Estacion[];
}

/** Lo que se manda al crear o editar un producto. */
export interface DatosParaProducto {
  nombre: string;
  /** Texto con hasta dos decimales, por ejemplo "350.50". */
  precio: string;
  id_categoria: number;
  id_estacion: number;
  /** Minutos estimados. `null` o ausente = sin estimar. */
  tiempo_estimado_minutos?: number | null;
}

/** Cambios de una categoría: el nombre, el estado o los dos. */
export interface CambiosDeCategoria {
  nombre?: string;
  activo?: boolean;
}

/** Cambios de una estación. Por ahora, solo el nombre. */
export interface CambiosDeEstacion {
  nombre?: string;
}

export function listarProductos(): Promise<DatosDeProductos> {
  return pedir<DatosDeProductos>("/api/productos");
}

/**
 * Lo que se puede pedir hoy: activo y disponible.
 *
 * Es una ruta distinta de `listarProductos` a propósito. La lista completa es
 * de administración (`ADMINISTRAR_PRODUCTOS`); esta solo exige
 * `VER_DISPONIBILIDAD`, que es la operación que la matriz le da al mesero para
 * consultar qué hay. No devuelve agotados ni productos fuera del catálogo.
 */
export function listarProductosDisponibles(): Promise<{ productos: Producto[] }> {
  return pedir<{ productos: Producto[] }>("/api/productos/disponibles");
}

export function crearProducto(datos: DatosParaProducto): Promise<Producto> {
  return pedir<Producto>("/api/productos", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarProducto(
  idProducto: number,
  datos: DatosParaProducto,
): Promise<Producto> {
  return pedir<Producto>(`/api/productos/${idProducto}`, {
    metodo: "PATCH",
    cuerpo: datos,
  });
}

export function cambiarDisponibilidadDeProducto(
  idProducto: number,
  disponible: boolean,
): Promise<Producto> {
  return pedir<Producto>(`/api/productos/${idProducto}/disponibilidad`, {
    metodo: "PATCH",
    cuerpo: { disponible },
  });
}

export function darDeBajaProducto(idProducto: number): Promise<Producto> {
  return pedir<Producto>(`/api/productos/${idProducto}/baja`, {
    metodo: "POST",
  });
}

export function reactivarProducto(idProducto: number): Promise<Producto> {
  return pedir<Producto>(`/api/productos/${idProducto}/reactivar`, {
    metodo: "POST",
  });
}

export function crearCategoria(nombre: string): Promise<Categoria> {
  return pedir<Categoria>("/api/productos/categorias", {
    metodo: "POST",
    cuerpo: { nombre },
  });
}

export function editarCategoria(
  idCategoria: number,
  cambios: CambiosDeCategoria,
): Promise<Categoria> {
  return pedir<Categoria>(`/api/productos/categorias/${idCategoria}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function crearEstacion(nombre: string): Promise<Estacion> {
  return pedir<Estacion>("/api/productos/estaciones", {
    metodo: "POST",
    cuerpo: { nombre },
  });
}

export function editarEstacion(
  idEstacion: number,
  cambios: CambiosDeEstacion,
): Promise<Estacion> {
  return pedir<Estacion>(`/api/productos/estaciones/${idEstacion}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}
