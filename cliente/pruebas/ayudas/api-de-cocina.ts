/*
  api-de-cocina.ts — un servidor de mentira que mueve comandas.
  ------------------------------------------------------------

  Guarda las comandas en memoria y aplica las mismas reglas que el servidor para
  las acciones que usa la pantalla: Pendiente → En preparación → Preparado, sin
  saltos ni repeticiones. Así una prueba puede comprobar que después de pulsar
  "Empezar", el siguiente GET ya trae el estado nuevo.

  No sustituye a las pruebas de integración: aquí se simula el cable, no la
  base. La transacción, el bloqueo y los permisos se prueban en el servidor.
*/

import type {
  Comanda,
  EstacionConPendientes,
  ProductoDeCocina,
} from "../../src/api/cocina";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDeCocina {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDeCocina {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface EstadoDeCocina {
  estaciones: EstacionConPendientes[];
  comandas: Comanda[];
  productos: ProductoDeCocina[];
}

export interface ApiDeCocina {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDeCocina[];
  fallos: FalloDeCocina[];
  comandas: () => Comanda[];
  productos: () => ProductoDeCocina[];
}

function copia<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function cuerpoDe(
  inicio: RequestInit | undefined,
): Record<string, unknown> | null {
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

function idDeLaUrl(url: string): number {
  const encontrado = /\/comandas\/(\d+)\//.exec(url);
  return encontrado === null ? 0 : Number(encontrado[1]);
}

function estacionPedida(url: string): number | null {
  const consulta = url.split("?")[1];
  if (consulta === undefined) return null;

  const valor = new URLSearchParams(consulta).get("estacion");
  if (valor === null) return null;

  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

/** Dos comandas de ejemplo: una recién enviada y otra ya en el fuego. */
export function estadoDeCocinaDePrueba(): EstadoDeCocina {
  const haceDiezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const haceCincoMinutos = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  return {
    estaciones: [
      { id_estacion: 1, nombre: "Parrilla", pendientes: 1 },
      { id_estacion: 2, nombre: "Barra", pendientes: 1 },
    ],
    productos: [
      {
        id_producto: 1,
        nombre: "Pollo a la brasa",
        categoria: "Carnes",
        estacion: "Parrilla",
        precio: 350,
        disponible: true,
      },
      {
        id_producto: 2,
        nombre: "Jugo de chinola",
        categoria: "Bebidas",
        estacion: "Barra",
        precio: 95,
        disponible: false,
      },
    ],
    comandas: [
      {
        id_comanda: 1,
        numero: 1041,
        estado: "Pendiente",
        enviada_en: haceDiezMinutos,
        iniciada_en: null,
        cerrada_en: null,
        estacion: "Parrilla",
        mesa: 1,
        mesero: "Luis",
        lineas: [
          {
            id: 1,
            producto: "Pollo a la brasa",
            cantidad: 2,
            comensal: 1,
            observacion: "sin cebolla",
            estado: "Pendiente",
            hora_inicio: null,
            hora_preparado: null,
          },
        ],
      },
      {
        id_comanda: 2,
        numero: 1042,
        estado: "En preparación",
        enviada_en: haceCincoMinutos,
        iniciada_en: haceCincoMinutos,
        cerrada_en: null,
        estacion: "Barra",
        mesa: 2,
        mesero: "Ana",
        lineas: [
          {
            id: 2,
            producto: "Jugo de chinola",
            cantidad: 1,
            comensal: 2,
            observacion: "",
            estado: "En preparación",
            hora_inicio: haceCincoMinutos,
            hora_preparado: null,
          },
        ],
      },
    ],
  };
}

export function apiDeCocina(inicial: EstadoDeCocina): ApiDeCocina {
  const estado = copia(inicial);
  const peticiones: PeticionDeCocina[] = [];
  const fallos: FalloDeCocina[] = [];

  function contarPendientes(): void {
    for (const estacion of estado.estaciones) {
      estacion.pendientes = estado.comandas.filter(
        (comanda) =>
          comanda.estacion === estacion.nombre &&
          (comanda.estado === "Pendiente" ||
            comanda.estado === "En preparación"),
      ).length;
    }
  }

  function mover(id: number, hacia: "En preparación" | "Preparado"): Response {
    const comanda = estado.comandas.find((actual) => actual.id_comanda === id);

    if (comanda === undefined) {
      return respuestaDeError(
        "NO_ENCONTRADO",
        "Esa comanda no existe.",
        404,
      );
    }

    const desde = hacia === "En preparación" ? "Pendiente" : "En preparación";
    if (comanda.estado !== desde) {
      return respuestaDeError(
        "CONFLICTO_DE_ESTADO",
        desde === "Pendiente"
          ? "Esa comanda ya se empezó."
          : "Esa comanda todavía no está en preparación.",
        409,
      );
    }

    const ahora = new Date().toISOString();
    comanda.estado = hacia;
    if (hacia === "En preparación") comanda.iniciada_en = ahora;

    for (const linea of comanda.lineas) {
      linea.estado = hacia;
      if (hacia === "En preparación") linea.hora_inicio = ahora;
      else linea.hora_preparado = ahora;
    }

    contarPendientes();

    return respuestaDeExito({
      comanda: copia(comanda),
      mensaje:
        hacia === "En preparación"
          ? `Comanda ${comanda.numero} en preparación.`
          : `Comanda ${comanda.numero} lista para servir.`,
    });
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

    if (metodo === "GET" && url.endsWith("/api/cocina/estaciones")) {
      contarPendientes();
      return respuestaDeExito(copia(estado.estaciones));
    }

    if (metodo === "GET" && url.endsWith("/api/cocina/productos")) {
      return respuestaDeExito(copia(estado.productos));
    }

    if (
      metodo === "PATCH" &&
      url.includes("/api/cocina/productos/") &&
      url.endsWith("/disponibilidad")
    ) {
      const encontrado = /\/productos\/(\d+)\/disponibilidad/.exec(url);
      const id = encontrado === null ? 0 : Number(encontrado[1]);
      const producto = estado.productos.find(
        (actual) => actual.id_producto === id,
      );

      if (producto === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      if (typeof cuerpo?.disponible !== "boolean") {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Hay que decir si el producto queda disponible o agotado.",
          400,
        );
      }

      producto.disponible = cuerpo.disponible;

      return respuestaDeExito({
        producto: {
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          disponible: producto.disponible,
        },
        mensaje: producto.disponible
          ? `${producto.nombre} vuelve a estar disponible.`
          : `${producto.nombre} quedó marcado como agotado.`,
      });
    }

    if (metodo === "GET" && url.includes("/api/cocina/comandas")) {
      const idEstacion = estacionPedida(url);

      if (idEstacion === null) {
        return respuestaDeExito(copia(estado.comandas));
      }

      const estacion = estado.estaciones.find(
        (actual) => actual.id_estacion === idEstacion,
      );
      const filtradas =
        estacion === undefined
          ? []
          : estado.comandas.filter(
              (comanda) => comanda.estacion === estacion.nombre,
            );

      return respuestaDeExito(copia(filtradas));
    }

    if (metodo === "POST" && url.endsWith("/iniciar")) {
      return mover(idDeLaUrl(url), "En preparación");
    }

    if (metodo === "POST" && url.endsWith("/preparar")) {
      return mover(idDeLaUrl(url), "Preparado");
    }

    return respuestaDeError(
      "NO_ENCONTRADO",
      "Esa dirección no existe en la cocina.",
      404,
    );
  }

  return {
    manejador: manejar,
    peticiones,
    fallos,
    comandas: () => copia(estado.comandas),
    productos: () => copia(estado.productos),
  };
}
