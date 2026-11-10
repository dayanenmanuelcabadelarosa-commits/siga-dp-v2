/*
  api-de-pedidos.ts — un servidor de mentira que se acuerda del pedido.
  --------------------------------------------------------------------

  Guarda el pedido de la mesa 1 en memoria y aplica las mismas reglas que el
  servidor para las acciones que usa la pantalla: abrir, agregar una línea,
  anularla y enviar a cocina. Después de cada acción, el siguiente GET devuelve
  el pedido actualizado, igual que en la API real.

  No sustituye a las pruebas de integración: aquí se simula el cable, no la
  base. La transacción, los permisos y las restricciones se prueban en el
  servidor.
*/

import type { Producto } from "../../src/api/productos";
import type {
  LineaDePedido,
  PedidoAbierto,
} from "../../src/api/pedidos";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDePedidos {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDePedidos {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface EstadoDePedidos {
  productos: Producto[];
  pedido: PedidoAbierto | null;
}

export interface ApiDePedidos {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDePedidos[];
  fallos: FalloDePedidos[];
  pedido: () => PedidoAbierto | null;
}

const AHORA = "2026-10-19T14:00:00.000Z";

function copia<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function cuerpoDe(inicio: RequestInit | undefined): Record<string, unknown> | null {
  if (typeof inicio?.body !== "string") return null;

  try {
    const leido: unknown = JSON.parse(inicio.body);
    return typeof leido === "object" && leido !== null
      ? (leido as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function producto(
  id: number,
  nombre: string,
  precio: number,
  categoria: string,
): Producto {
  return {
    id_producto: id,
    nombre,
    id_categoria: 1,
    categoria,
    categoria_activa: true,
    id_estacion: 1,
    estacion: "Parrilla",
    precio,
    disponible: true,
    riesgo_agotarse: false,
    tiempo_estimado_minutos: null,
    activo: true,
    creado_en: AHORA,
    modificado_en: AHORA,
  };
}

/** Dos productos disponibles y un pedido todavía sin abrir. */
export function estadoDePedidosDePrueba(): EstadoDePedidos {
  return {
    productos: [
      producto(1, "Pollo a la brasa", 350, "Carnes"),
      producto(2, "Jugo de chinola", 95, "Bebidas"),
    ],
    pedido: null,
  };
}

export function apiDePedidos(inicial: EstadoDePedidos): ApiDePedidos {
  const estado = copia(inicial);
  const peticiones: PeticionDePedidos[] = [];
  const fallos: FalloDePedidos[] = [];
  let contadorDeLineas = 100;

  function recalcularTotal(): void {
    if (estado.pedido === null) return;

    estado.pedido.total = estado.pedido.lineas.reduce(
      (suma, linea) => suma + linea.precio * linea.cantidad,
      0,
    );
  }

  function manejar(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo = cuerpoDe(inicio);
    peticiones.push({ url, metodo, cuerpo });

    const fallo = fallos.find(
      (candidato) =>
        candidato.metodo === metodo && url.endsWith(candidato.sufijo),
    );

    if (fallo !== undefined) {
      return respuestaDeError(
        fallo.codigo,
        fallo.mensaje,
        fallo.estado ?? 400,
      );
    }

    if (metodo === "GET" && url.endsWith("/api/productos/disponibles")) {
      return respuestaDeExito({ productos: copia(estado.productos) });
    }

    /* La lista de todos los pedidos, con filtros opcionales. */
    if (
      metodo === "GET" &&
      (url.endsWith("/api/pedidos") || url.includes("/api/pedidos?"))
    ) {
      const pedido = estado.pedido;
      const filtros = new URL(url).searchParams;
      const estadoPedido = filtros.get("estado");
      const fechaPedido = filtros.get("fecha");

      const cumple =
        pedido !== null &&
        (estadoPedido === null ||
          estadoPedido === "Todos" ||
          estadoPedido === pedido.estado) &&
        (fechaPedido === null || fechaPedido === "");

      return respuestaDeExito(cumple ? [copia(pedido)] : []);
    }

    if (metodo === "GET" && url.endsWith("/api/pedidos/1")) {
      return respuestaDeExito(
        estado.pedido === null ? null : copia(estado.pedido),
      );
    }

    if (metodo === "POST" && url.endsWith("/api/pedidos/1/abrir")) {
      const comensales =
        typeof cuerpo?.comensales === "number" ? cuerpo.comensales : 1;

      estado.pedido = {
        id_pedido: 1,
        mesa: 1,
        mesero: "Luis",
        estado: "Abierto",
        hora: "10:00",
        total: 0,
        cuenta_pedida_en: null,
        lineas: [],
        comandas: [],
      };

      return respuestaDeExito(
        {
          id: 1,
          pedido: copia(estado.pedido),
          mensaje: `Pedido abierto para ${comensales} comensal(es).`,
        },
        201,
      );
    }

    if (metodo === "POST" && url.endsWith("/api/pedidos/1/lineas")) {
      if (estado.pedido === null) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "La mesa no tiene un pedido abierto.",
          400,
        );
      }

      const idProducto =
        typeof cuerpo?.productoId === "number" ? cuerpo.productoId : 0;
      const encontrado = estado.productos.find(
        (actual) => actual.id_producto === idProducto,
      );

      if (encontrado === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      contadorDeLineas += 1;

      const linea: LineaDePedido = {
        id: contadorDeLineas,
        productoId: encontrado.id_producto,
        nombre: encontrado.nombre,
        precio: encontrado.precio,
        cantidad:
          typeof cuerpo?.cantidad === "number" ? cuerpo.cantidad : 1,
        observacion:
          typeof cuerpo?.observacion === "string" ? cuerpo.observacion : "",
        persona: typeof cuerpo?.persona === "number" ? cuerpo.persona : 1,
        estado: "Guardada",
      };

      estado.pedido.lineas.push(linea);
      recalcularTotal();

      return respuestaDeExito(
        { id: linea.id, pedido: copia(estado.pedido) },
        201,
      );
    }

    if (metodo === "DELETE" && url.includes("/api/pedidos/lineas/")) {
      if (estado.pedido === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa línea no existe.",
          404,
        );
      }

      const encontrado = /\/lineas\/(\d+)/.exec(url);
      const id = encontrado === null ? 0 : Number(encontrado[1]);

      estado.pedido.lineas = estado.pedido.lineas.filter(
        (linea) => linea.id !== id,
      );
      recalcularTotal();

      return respuestaDeExito({ mensaje: "Línea anulada." });
    }

    if (metodo === "POST" && url.endsWith("/api/pedidos/1/enviar")) {
      if (estado.pedido === null || estado.pedido.lineas.length === 0) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "No hay nada nuevo que enviar.",
          400,
        );
      }

      estado.pedido.comandas = [
        {
          id_comanda: 1,
          numero: 1041,
          estado: "Pendiente",
          estacion: "Parrilla",
          enviada: "10:00",
          lineas: estado.pedido.lineas.map((linea) => ({
            producto: linea.nombre,
            cantidad: linea.cantidad,
            estado: "Pendiente",
          })),
        },
      ];

      estado.pedido.lineas = estado.pedido.lineas.map((linea) => ({
        ...linea,
        estado: "Enviada",
      }));
      estado.pedido.estado = "Enviado";

      return respuestaDeExito({
        comandas: [1041],
        mensaje: "Comanda 1041 enviada(s).",
      });
    }

    if (metodo === "POST" && url.endsWith("/api/pedidos/1/pedir-cuenta")) {
      if (estado.pedido === null) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "La mesa no tiene un pedido abierto.",
          409,
        );
      }

      if (estado.pedido.lineas.some((linea) => linea.estado === "Guardada")) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "Envía primero a cocina todo el consumo pendiente.",
          409,
        );
      }

      if (
        !estado.pedido.lineas.some((linea) => linea.estado === "Enviada")
      ) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "La mesa no tiene consumo enviado.",
          409,
        );
      }

      estado.pedido.cuenta_pedida_en = AHORA;
      return respuestaDeExito(
        { pedido: copia(estado.pedido), mensaje: "La mesa pidió la cuenta. El cajero ya la ve en su lista." },
        200,
      );
    }

    if (metodo === "DELETE" && url.endsWith("/api/pedidos/1/pedir-cuenta")) {
      if (estado.pedido === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa línea no existe.",
          404,
        );
      }

      estado.pedido.cuenta_pedida_en = null;
      return respuestaDeExito(
        { pedido: copia(estado.pedido), mensaje: "El aviso de cuenta se retiró." },
        200,
      );
    }

    return respuestaDeError(
      "NO_ENCONTRADO",
      "Esa dirección no existe en pedidos.",
      404,
    );
  }

  return {
    manejador: manejar,
    peticiones,
    fallos,
    pedido: () => (estado.pedido === null ? null : copia(estado.pedido)),
  };
}
