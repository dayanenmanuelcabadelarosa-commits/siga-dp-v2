/*
  api-de-productos.ts — un servidor de mentira que se acuerda del catálogo.
  ------------------------------------------------------------------------
  Las pruebas de la pantalla necesitan que, después de crear, editar, dar de baja
  o cambiar una categoría, el siguiente GET devuelva el estado nuevo. Este
  ayudante guarda el catálogo en memoria y refleja las mismas reglas que el
  servidor para las acciones que la pantalla usa.

  No sustituye a las pruebas de integración: aquí se simula el cable, no la
  base. Las restricciones de PostgreSQL se prueban en el servidor.
*/

import type {
  Categoria,
  DatosDeProductos,
  Estacion,
  Producto,
} from "../../src/api/productos";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDeProductos {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDeProductos {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface ApiDeProductos {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDeProductos[];
  fallos: FalloDeProductos[];
  datos: () => DatosDeProductos;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function numero(valor: unknown, porDefecto = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : porDefecto;
}

const PATRON_DE_ID = /\/(\d+)(?:\/|$)/;

function idDeLaUrl(url: string): number {
  const encontrado = PATRON_DE_ID.exec(url);
  return encontrado === null ? 0 : Number(encontrado[1]);
}

function cuerpoDe(inicio: RequestInit | undefined): Record<string, unknown> | null {
  return typeof inicio?.body === "string"
    ? (JSON.parse(inicio.body) as Record<string, unknown>)
    : null;
}

export function apiDeProductos(
  iniciales: DatosDeProductos,
): ApiDeProductos {
  let datos: DatosDeProductos = {
    productos: iniciales.productos.map((producto) => ({ ...producto })),
    categorias: iniciales.categorias.map((categoria) => ({ ...categoria })),
    estaciones: iniciales.estaciones.map((estacion) => ({ ...estacion })),
  };

  const peticiones: PeticionDeProductos[] = [];
  const fallos: FalloDeProductos[] = [];

  function categoriaDe(id: number): Categoria | null {
    return (
      datos.categorias.find((categoria) => categoria.id_categoria === id) ?? null
    );
  }

  function estacionDe(id: number): Estacion | null {
    return (
      datos.estaciones.find((estacion) => estacion.id_estacion === id) ?? null
    );
  }

  function productoDe(id: number): Producto | null {
    return (
      datos.productos.find((producto) => producto.id_producto === id) ?? null
    );
  }

  function guardarProducto(actualizado: Producto): Producto {
    datos = {
      ...datos,
      productos: datos.productos.map((producto) =>
        producto.id_producto === actualizado.id_producto
          ? actualizado
          : producto,
      ),
    };

    return actualizado;
  }

  function manejador(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo = cuerpoDe(inicio);

    peticiones.push({ url, metodo, cuerpo });

    const fallo = fallos.find(
      (posible) =>
        posible.metodo === metodo && url.endsWith(posible.sufijo),
    );

    if (fallo !== undefined) {
      return respuestaDeError(
        fallo.codigo,
        fallo.mensaje,
        fallo.estado ?? 409,
      );
    }

    if (url.endsWith("/api/productos") && metodo === "GET") {
      return respuestaDeExito(datos);
    }

    if (url.endsWith("/api/productos") && metodo === "POST") {
      const nombre = texto(cuerpo?.nombre);
      const idCategoria = numero(cuerpo?.id_categoria);
      const idEstacion = numero(cuerpo?.id_estacion);
      const categoria = categoriaDe(idCategoria);
      const estacion = estacionDe(idEstacion);

      if (categoria === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa categoría no existe.",
          400,
        );
      }

      if (estacion === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa estación no existe.",
          400,
        );
      }

      if (!categoria.activo) {
        return respuestaDeError(
          "CATEGORIA_INACTIVA",
          "La categoría está inactiva. Elige una activa.",
        );
      }

      const ahora = new Date().toISOString();
      const producto: Producto = {
        id_producto:
          Math.max(0, ...datos.productos.map((fila) => fila.id_producto)) + 1,
        nombre,
        id_categoria: categoria.id_categoria,
        categoria: categoria.nombre,
        categoria_activa: categoria.activo,
        id_estacion: estacion.id_estacion,
        estacion: estacion.nombre,
        precio: Number(cuerpo?.precio),
        disponible: true,
        riesgo_agotarse: false,
        tiempo_estimado_minutos: null,
        activo: true,
        creado_en: ahora,
        modificado_en: ahora,
      };

      datos = { ...datos, productos: [...datos.productos, producto] };

      return respuestaDeExito(producto, 201);
    }

    if (url.endsWith("/api/productos/categorias") && metodo === "POST") {
      const categoria: Categoria = {
        id_categoria:
          Math.max(0, ...datos.categorias.map((fila) => fila.id_categoria)) + 1,
        nombre: texto(cuerpo?.nombre),
        activo: true,
      };

      datos = { ...datos, categorias: [...datos.categorias, categoria] };

      return respuestaDeExito(categoria, 201);
    }

    if (url.includes("/api/productos/categorias/") && metodo === "PATCH") {
      const id = idDeLaUrl(url);
      const actual = categoriaDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa categoría no existe.", 404);
      }

      const nombre =
        cuerpo?.nombre === undefined ? actual.nombre : texto(cuerpo.nombre);
      const activo =
        typeof cuerpo?.activo === "boolean" ? cuerpo.activo : actual.activo;

      if (!activo && actual.activo) {
        const tieneActivos = datos.productos.some(
          (producto) =>
            producto.id_categoria === id && producto.activo,
        );

        if (tieneActivos) {
          return respuestaDeError(
            "CATEGORIA_CON_PRODUCTOS_ACTIVOS",
            "No puedes desactivar una categoría que todavía tiene productos activos.",
          );
        }
      }

      const actualizada: Categoria = { ...actual, nombre, activo };

      datos = {
        ...datos,
        categorias: datos.categorias.map((categoria) =>
          categoria.id_categoria === id ? actualizada : categoria,
        ),
        productos: datos.productos.map((producto) =>
          producto.id_categoria === id
            ? {
                ...producto,
                categoria: actualizada.nombre,
                categoria_activa: actualizada.activo,
              }
            : producto,
        ),
      };

      return respuestaDeExito(actualizada);
    }

    if (url.endsWith("/api/productos/estaciones") && metodo === "POST") {
      const estacion: Estacion = {
        id_estacion:
          Math.max(0, ...datos.estaciones.map((fila) => fila.id_estacion)) + 1,
        nombre: texto(cuerpo?.nombre),
      };

      datos = { ...datos, estaciones: [...datos.estaciones, estacion] };

      return respuestaDeExito(estacion, 201);
    }

    if (url.includes("/api/productos/estaciones/") && metodo === "PATCH") {
      const id = idDeLaUrl(url);
      const actual = estacionDe(id);

      if (actual === null) {
        return respuestaDeError("NO_ENCONTRADO", "Esa estación no existe.", 404);
      }

      const nombre =
        cuerpo?.nombre === undefined ? actual.nombre : texto(cuerpo.nombre);
      const actualizada: Estacion = { ...actual, nombre };

      datos = {
        ...datos,
        estaciones: datos.estaciones.map((estacion) =>
          estacion.id_estacion === id ? actualizada : estacion,
        ),
        productos: datos.productos.map((producto) =>
          producto.id_estacion === id
            ? { ...producto, estacion: actualizada.nombre }
            : producto,
        ),
      };

      return respuestaDeExito(actualizada);
    }

    if (url.endsWith("/disponibilidad") && metodo === "PATCH") {
      const actual = productoDe(idDeLaUrl(url));

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      if (!actual.activo) {
        return respuestaDeError(
          "PRODUCTO_INACTIVO",
          "Ese producto está fuera del catálogo.",
        );
      }

      return respuestaDeExito(
        guardarProducto({
          ...actual,
          disponible: cuerpo?.disponible === true,
          modificado_en: new Date().toISOString(),
        }),
      );
    }

    if (url.endsWith("/baja") && metodo === "POST") {
      const actual = productoDe(idDeLaUrl(url));

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      if (!actual.activo) {
        return respuestaDeError(
          "PRODUCTO_YA_INACTIVO",
          "Ese producto ya está fuera del catálogo.",
        );
      }

      return respuestaDeExito(
        guardarProducto({
          ...actual,
          activo: false,
          modificado_en: new Date().toISOString(),
        }),
      );
    }

    if (url.endsWith("/reactivar") && metodo === "POST") {
      const actual = productoDe(idDeLaUrl(url));

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      if (actual.activo) {
        return respuestaDeError(
          "PRODUCTO_YA_ACTIVO",
          "Ese producto ya está en el catálogo.",
        );
      }

      const categoria = categoriaDe(actual.id_categoria);

      if (!categoria?.activo) {
        return respuestaDeError(
          "CATEGORIA_INACTIVA",
          "La categoría de este producto está inactiva. Cámbiala antes de reactivarlo.",
        );
      }

      return respuestaDeExito(
        guardarProducto({
          ...actual,
          activo: true,
          modificado_en: new Date().toISOString(),
        }),
      );
    }

    if (/\/api\/productos\/\d+$/.test(url) && metodo === "PATCH") {
      const actual = productoDe(idDeLaUrl(url));

      if (actual === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese producto no existe.",
          404,
        );
      }

      const idCategoria =
        cuerpo?.id_categoria === undefined
          ? actual.id_categoria
          : numero(cuerpo.id_categoria);
      const idEstacion =
        cuerpo?.id_estacion === undefined
          ? actual.id_estacion
          : numero(cuerpo.id_estacion);
      const categoria = categoriaDe(idCategoria);
      const estacion = estacionDe(idEstacion);

      if (categoria === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa categoría no existe.",
          400,
        );
      }

      if (estacion === null) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa estación no existe.",
          400,
        );
      }

      if (!categoria.activo && idCategoria !== actual.id_categoria) {
        return respuestaDeError(
          "CATEGORIA_INACTIVA",
          "La categoría está inactiva. Elige una activa.",
        );
      }

      return respuestaDeExito(
        guardarProducto({
          ...actual,
          nombre:
            cuerpo?.nombre === undefined
              ? actual.nombre
              : texto(cuerpo.nombre),
          precio:
            cuerpo?.precio === undefined
              ? actual.precio
              : Number(cuerpo.precio),
          id_categoria: categoria.id_categoria,
          categoria: categoria.nombre,
          categoria_activa: categoria.activo,
          id_estacion: estacion.id_estacion,
          estacion: estacion.nombre,
          modificado_en: new Date().toISOString(),
        }),
      );
    }

    return respuestaDeError(
      "NO_ENCONTRADO",
      `La ruta de prueba ${metodo} ${url} no está preparada.`,
      404,
    );
  }

  return {
    manejador,
    peticiones,
    fallos,
    datos: () => datos,
  };
}
