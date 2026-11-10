/*
  pedidos.ts — las llamadas del módulo Pedidos (Fase 5, módulo 1).
*/

import { pedir } from "./cliente-http";

export interface LineaDePedido {
  id: number;
  productoId: number;
  nombre: string;
  precio: number;
  cantidad: number;
  observacion: string;
  persona: number;
  estado: string;
}

/** Una línea dentro de una comanda, tal como la ve el mesero. */
export interface LineaDeComandaSeguimiento {
  producto: string;
  cantidad: number;
  estado: string;
}

/**
 * Una comanda del pedido, para que el mesero sepa cómo va el plato.
 * La escribe la cocina; el mesero solo la lee con `CAPTURAR_PEDIDO`.
 */
export interface ComandaDeSeguimiento {
  id_comanda: number;
  numero: number;
  estado: string;
  estacion: string;
  /** Hora de envío, en formato HH:MM. */
  enviada: string;
  lineas: LineaDeComandaSeguimiento[];
}

export interface PedidoAbierto {
  id_pedido: number;
  mesa: number;
  mesero: string;
  estado: string;
  hora: string;
  /** El total del pedido, calculado en la base. */
  total: number;
  /** Instante en que el mesero pidió la cuenta, o null si no la pidió. */
  cuenta_pedida_en: string | null;
  lineas: LineaDePedido[];
  /** Vacío hasta que el pedido se envía a cocina. */
  comandas: ComandaDeSeguimiento[];
}

/** Los filtros opcionales de la lista de pedidos. */
export interface FiltrosDePedidos {
  estado?: string;
  fecha?: string;
}

export function obtenerPedidoDeMesa(mesa: number): Promise<PedidoAbierto | null> {
  return pedir<PedidoAbierto | null>(`/api/pedidos/${mesa}`);
}

/** Todos los pedidos, con filtros opcionales por estado y por fecha. */
export function listarPedidos(
  filtros: FiltrosDePedidos = {},
): Promise<PedidoAbierto[]> {
  const params = new URLSearchParams();

  if (filtros.estado !== undefined && filtros.estado !== "Todos") {
    params.set("estado", filtros.estado);
  }

  if (filtros.fecha !== undefined && filtros.fecha !== "") {
    params.set("fecha", filtros.fecha);
  }

  const consulta = params.toString();
  return pedir<PedidoAbierto[]>(`/api/pedidos${consulta ? `?${consulta}` : ""}`);
}

export function abrirPedido(
  mesa: number,
  comensales: number,
  mesero?: string,
): Promise<{ id: number; pedido: PedidoAbierto; mensaje: string }> {
  return pedir<{ id: number; pedido: PedidoAbierto; mensaje: string }>(
    `/api/pedidos/${mesa}/abrir`,
    {
      metodo: "POST",
      cuerpo: { comensales, ...(mesero ? { mesero } : {}) },
    },
  );
}

export function agregarLinea(
  mesa: number,
  productoId: number,
  cantidad: number,
  observacion: string,
  persona: number,
): Promise<{ id: number; pedido: PedidoAbierto }> {
  return pedir<{ id: number; pedido: PedidoAbierto }>(
    `/api/pedidos/${mesa}/lineas`,
    {
      metodo: "POST",
      cuerpo: { productoId, cantidad, observacion, persona },
    },
  );
}

export function editarLinea(
  idLinea: number,
  cambios: { cantidad?: number; observacion?: string },
): Promise<LineaDePedido> {
  return pedir<LineaDePedido>(`/api/pedidos/lineas/${idLinea}`, {
    metodo: "PATCH",
    cuerpo: cambios,
  });
}

export function anularLinea(
  idLinea: number,
  motivo?: string,
): Promise<{ mensaje: string }> {
  return pedir<{ mensaje: string }>(`/api/pedidos/lineas/${idLinea}`, {
    metodo: "DELETE",
    cuerpo: motivo ? { motivo } : undefined,
  });
}

export function enviarPedido(
  mesa: number,
): Promise<{ comandas: number[]; mensaje: string }> {
  return pedir<{ comandas: number[]; mensaje: string }>(
    `/api/pedidos/${mesa}/enviar`,
    { metodo: "POST" },
  );
}

/** Avisa al cajero que la mesa quiere la cuenta. No genera la cuenta. */
export function pedirLaCuenta(
  mesa: number,
): Promise<{ pedido: PedidoAbierto | null; mensaje: string }> {
  return pedir<{ pedido: PedidoAbierto | null; mensaje: string }>(
    `/api/pedidos/${mesa}/pedir-cuenta`,
    { metodo: "POST" },
  );
}

/** Retira el aviso de cuenta si el cliente se arrepintió o fue un error. */
export function quitarLaCuenta(
  mesa: number,
): Promise<{ pedido: PedidoAbierto | null; mensaje: string }> {
  return pedir<{ pedido: PedidoAbierto | null; mensaje: string }>(
    `/api/pedidos/${mesa}/pedir-cuenta`,
    { metodo: "DELETE" },
  );
}
