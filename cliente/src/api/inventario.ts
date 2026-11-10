/*
  inventario.ts — las llamadas del módulo Inventario.
  ---------------------------------------------------

  El servidor manda los números ya convertidos (NUMERIC → number). Al escribir,
  las cantidades viajan como texto para no perder los centavos, igual que el
  precio del catálogo.

  Un movimiento nunca manda el signo:
    · Entrada de compra → `cantidad` positiva.
    · Salida por consumo → `cantidad` positiva; el servidor la guarda negativa.
    · Ajuste por conteo → `conteo_fisico`; el servidor calcula la diferencia.
*/

import { pedir } from "./cliente-http";

export interface UnidadDeMedida {
  id_unidad: number;
  nombre: string;
  abreviatura: string;
}

export interface PuntoDeAcceso {
  id_punto: number;
  nombre: string;
  es_almacen: boolean;
}

export interface Insumo {
  id_insumo: number;
  nombre: string;
  id_unidad: number;
  unidad: string;
  abreviatura: string;
  /** La base lo devuelve como número. */
  minimo: number;
  activo: boolean;
  /** La suma de todos los puntos de acceso. */
  existencia_total: number;
}

export interface Existencia {
  id_insumo: number;
  id_punto: number;
  existencia: number;
  actualizado: string;
}

/** Lo que devuelve `GET /api/inventario`. */
export interface DatosDeInventario {
  insumos: Insumo[];
  puntos: PuntoDeAcceso[];
  existencias: Existencia[];
  unidades: UnidadDeMedida[];
}

export type TipoDeMovimiento =
  | "Entrada de compra"
  | "Salida por consumo"
  | "Ajuste por conteo";

export interface MovimientoDeInventario {
  id_movimiento: number;
  tipo: TipoDeMovimiento;
  id_insumo: number;
  insumo: string;
  abreviatura: string;
  id_punto: number;
  punto: string;
  /** Con signo: la entrada es positiva y la salida, negativa. */
  cantidad: number;
  detalle: string;
  id_proveedor: number | null;
  proveedor: string | null;
  id_empleado: number | null;
  empleado: string | null;
  ocurrido_en: string;
}

export type EstadoDeProveedor = "Activo" | "Inactivo";

export interface Proveedor {
  id_proveedor: number;
  nombre: string;
  telefono: string;
  estado: EstadoDeProveedor;
  /** Entradas de compra registradas con este proveedor. */
  compras: number;
}

/** Lo que se manda al crear un insumo. */
export interface DatosParaInsumo {
  nombre: string;
  id_unidad: number;
  /** Texto con hasta dos decimales. */
  minimo: string;
}

/** Cambios de un insumo: los cuatro campos son opcionales. */
export interface CambiosDeInsumo {
  nombre?: string;
  id_unidad?: number;
  minimo?: string;
  activo?: boolean;
}

/** Lo que se manda al crear un proveedor. */
export interface DatosParaProveedor {
  nombre: string;
  telefono: string;
}

/** Cambios de un proveedor. */
export interface CambiosDeProveedor {
  nombre?: string;
  telefono?: string;
  estado?: EstadoDeProveedor;
}

/** Los tres movimientos posibles, tal como los manda la pantalla. */
export type EntradaDeMovimiento =
  | {
      tipo: "Entrada de compra";
      id_insumo: number;
      id_punto: number;
      /** Texto positivo, por ejemplo "12.50". */
      cantidad: string;
      detalle: string;
      id_proveedor: number;
    }
  | {
      tipo: "Salida por consumo";
      id_insumo: number;
      id_punto: number;
      /** Texto positivo; el servidor la guarda con signo negativo. */
      cantidad: string;
      detalle: string;
    }
  | {
      tipo: "Ajuste por conteo";
      id_insumo: number;
      id_punto: number;
      /** Texto que puede ser "0". */
      conteo_fisico: string;
    };

/** Lo que devuelve registrar un movimiento. */
export interface ResultadoDeMovimiento {
  movimiento: MovimientoDeInventario;
  /** Existencia en el punto del movimiento, después de aplicarlo. */
  existencia: number;
  /** Suma de todos los puntos, después de aplicarlo. */
  existencia_total: number;
}

export function listarInventario(): Promise<DatosDeInventario> {
  return pedir<DatosDeInventario>("/api/inventario");
}

export function listarMovimientos(
  idInsumo?: number,
): Promise<{ movimientos: MovimientoDeInventario[] }> {
  const consulta =
    idInsumo === undefined ? "" : `?id_insumo=${encodeURIComponent(idInsumo)}`;

  return pedir<{ movimientos: MovimientoDeInventario[] }>(
    `/api/inventario/movimientos${consulta}`,
  );
}

export function listarProveedores(): Promise<{ proveedores: Proveedor[] }> {
  return pedir<{ proveedores: Proveedor[] }>("/api/inventario/proveedores");
}

export function crearInsumo(datos: DatosParaInsumo): Promise<Insumo> {
  return pedir<Insumo>("/api/inventario/insumos", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarInsumo(
  idInsumo: number,
  cambios: CambiosDeInsumo,
): Promise<Insumo> {
  return pedir<Insumo>(`/api/inventario/insumos/${idInsumo}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function crearProveedor(datos: DatosParaProveedor): Promise<Proveedor> {
  return pedir<Proveedor>("/api/inventario/proveedores", {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function editarProveedor(
  idProveedor: number,
  cambios: CambiosDeProveedor,
): Promise<Proveedor> {
  return pedir<Proveedor>(`/api/inventario/proveedores/${idProveedor}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function registrarMovimiento(
  datos: EntradaDeMovimiento,
): Promise<ResultadoDeMovimiento> {
  return pedir<ResultadoDeMovimiento>("/api/inventario/movimientos", {
    metodo: "POST",
    cuerpo: datos,
  });
}
