/*
  api-de-inventario.ts — un servidor de mentira que se acuerda del almacén.
  -------------------------------------------------------------------------
  Las pruebas de la pantalla necesitan que, después de crear un insumo, editar
  un proveedor o registrar un movimiento, el siguiente GET devuelva el estado
  nuevo. Este ayudante guarda todo en memoria y aplica las mismas reglas que el
  servidor para las acciones que la pantalla usa.

  No sustituye a las pruebas de integración: aquí se simula el cable, no la
  base. Las restricciones de PostgreSQL, los permisos y la concurrencia se
  prueban en el servidor.
*/

import type {
  DatosDeInventario,
  Existencia,
  Insumo,
  MovimientoDeInventario,
  Proveedor,
  PuntoDeAcceso,
  UnidadDeMedida,
} from "../../src/api/inventario";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDeInventario {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDeInventario {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface EstadoDeInventario {
  insumos: Insumo[];
  puntos: PuntoDeAcceso[];
  existencias: Existencia[];
  unidades: UnidadDeMedida[];
  movimientos: MovimientoDeInventario[];
  proveedores: Proveedor[];
}

export interface ApiDeInventario {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDeInventario[];
  fallos: FalloDeInventario[];
  datos: () => DatosDeInventario;
  movimientos: () => MovimientoDeInventario[];
  proveedores: () => Proveedor[];
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function numero(valor: unknown, porDefecto = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : porDefecto;
}

function idDeLaUrl(url: string): number {
  const encontrado = /\/(\d+)(?:\?|$)/.exec(url);
  return encontrado === null ? 0 : Number(encontrado[1]);
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

/** Un almacén pequeño y variado, para no repetirlo en cada prueba. */
export function estadoDeInventarioDePrueba(): EstadoDeInventario {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const haceDiezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  return {
    unidades: [
      { id_unidad: 1, nombre: "Unidad", abreviatura: "und" },
      { id_unidad: 2, nombre: "Libra", abreviatura: "lb" },
    ],
    puntos: [
      { id_punto: 1, nombre: "Almacén", es_almacen: true },
      { id_punto: 2, nombre: "Cocina", es_almacen: false },
    ],
    insumos: [
      {
        id_insumo: 1,
        nombre: "Pollo",
        id_unidad: 1,
        unidad: "Unidad",
        abreviatura: "und",
        minimo: 5,
        activo: true,
        existencia_total: 3,
      },
      {
        id_insumo: 2,
        nombre: "Aceite",
        id_unidad: 2,
        unidad: "Libra",
        abreviatura: "lb",
        minimo: 2,
        activo: true,
        existencia_total: 10,
      },
      {
        id_insumo: 3,
        nombre: "Carbón viejo",
        id_unidad: 1,
        unidad: "Unidad",
        abreviatura: "und",
        minimo: 1,
        activo: false,
        existencia_total: 0,
      },
    ],
    existencias: [
      {
        id_insumo: 1,
        id_punto: 1,
        existencia: 2,
        actualizado: haceUnaHora,
      },
      {
        id_insumo: 1,
        id_punto: 2,
        existencia: 1,
        actualizado: haceUnaHora,
      },
      {
        id_insumo: 2,
        id_punto: 1,
        existencia: 10,
        actualizado: haceUnaHora,
      },
    ],
    movimientos: [
      {
        id_movimiento: 1,
        tipo: "Entrada de compra",
        id_insumo: 1,
        insumo: "Pollo",
        abreviatura: "und",
        id_punto: 1,
        punto: "Almacén",
        cantidad: 2,
        detalle: "Factura A-1",
        id_proveedor: 1,
        proveedor: "Avícola del Cibao",
        id_empleado: 1,
        empleado: "Ana Pérez",
        ocurrido_en: haceUnaHora,
      },
      {
        id_movimiento: 2,
        tipo: "Salida por consumo",
        id_insumo: 1,
        insumo: "Pollo",
        abreviatura: "und",
        id_punto: 1,
        punto: "Almacén",
        cantidad: -1,
        detalle: "Consumo del almuerzo",
        id_proveedor: null,
        proveedor: null,
        id_empleado: 1,
        empleado: "Ana Pérez",
        ocurrido_en: haceDiezMinutos,
      },
      {
        id_movimiento: 3,
        tipo: "Entrada de compra",
        id_insumo: 2,
        insumo: "Aceite",
        abreviatura: "lb",
        id_punto: 1,
        punto: "Almacén",
        cantidad: 10,
        detalle: "Factura A-2",
        id_proveedor: 1,
        proveedor: "Avícola del Cibao",
        id_empleado: 1,
        empleado: "Ana Pérez",
        ocurrido_en: haceUnaHora,
      },
    ],
    proveedores: [
      {
        id_proveedor: 1,
        nombre: "Avícola del Cibao",
        telefono: "809-555-0101",
        estado: "Activo",
        compras: 2,
      },
      {
        id_proveedor: 2,
        nombre: "Suplidor inactivo",
        telefono: "829-555-0202",
        estado: "Inactivo",
        compras: 0,
      },
    ],
  };
}

export function apiDeInventario(inicial: EstadoDeInventario): ApiDeInventario {
  const estado = inicial;
  const peticiones: PeticionDeInventario[] = [];
  const fallos: FalloDeInventario[] = [];

  function siguienteId(lista: readonly unknown[], clave: string): number {
    return (
      Math.max(
        0,
        ...lista.map((fila) =>
          numero((fila as Record<string, unknown>)[clave]),
        ),
      ) + 1
    );
  }

  function totalDe(idInsumo: number): number {
    return estado.existencias
      .filter((fila) => fila.id_insumo === idInsumo)
      .reduce((suma, fila) => suma + fila.existencia, 0);
  }

  function recalcularTotal(idInsumo: number): void {
    const insumo = estado.insumos.find((fila) => fila.id_insumo === idInsumo);
    if (insumo !== undefined) insumo.existencia_total = totalDe(idInsumo);
  }

  function cambiarNombreEnMovimientos(
    idInsumo: number,
    nombre: string,
    abreviatura: string,
  ): void {
    for (const movimiento of estado.movimientos) {
      if (movimiento.id_insumo === idInsumo) {
        movimiento.insumo = nombre;
        movimiento.abreviatura = abreviatura;
      }
    }
  }

  function cambiarProveedorEnMovimientos(
    idProveedor: number,
    nombre: string,
  ): void {
    for (const movimiento of estado.movimientos) {
      if (movimiento.id_proveedor === idProveedor) {
        movimiento.proveedor = nombre;
      }
    }
  }

  function manejar(url: string, inicio?: RequestInit): Response {
    const metodo = (inicio?.method ?? "GET").toUpperCase();
    const cuerpo = cuerpoDe(inicio);

    peticiones.push({ url, metodo, cuerpo });

    const fallo = fallos.find(
      (candidato) =>
        candidato.metodo === metodo && url.endsWith(candidato.sufijo),
    );

    if (fallo !== undefined) {
      return respuestaDeError(fallo.codigo, fallo.mensaje, fallo.estado ?? 400);
    }

    if (metodo === "GET" && url.endsWith("/api/inventario")) {
      return respuestaDeExito<DatosDeInventario>({
        insumos: estado.insumos,
        puntos: estado.puntos,
        existencias: estado.existencias,
        unidades: estado.unidades,
      });
    }

    if (metodo === "GET" && url.endsWith("/api/inventario/movimientos")) {
      return respuestaDeExito({ movimientos: estado.movimientos });
    }

    if (metodo === "GET" && url.endsWith("/api/inventario/proveedores")) {
      return respuestaDeExito({ proveedores: estado.proveedores });
    }

    if (metodo === "POST" && url.endsWith("/api/inventario/insumos")) {
      const nombre = texto(cuerpo?.nombre).trim();
      const idUnidad = numero(cuerpo?.id_unidad);

      if (nombre === "") {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Escribe el nombre del insumo.",
        );
      }

      if (estado.insumos.some((insumo) => insumo.nombre === nombre)) {
        return respuestaDeError(
          "NOMBRE_DUPLICADO",
          "Ya hay un insumo con ese nombre.",
          409,
        );
      }

      const unidad = estado.unidades.find(
        (candidata) => candidata.id_unidad === idUnidad,
      );

      if (unidad === undefined) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa unidad de medida no existe.",
        );
      }

      const creado: Insumo = {
        id_insumo: siguienteId(estado.insumos, "id_insumo"),
        nombre,
        id_unidad: unidad.id_unidad,
        unidad: unidad.nombre,
        abreviatura: unidad.abreviatura,
        minimo: Number(cuerpo?.minimo ?? 0),
        activo: true,
        existencia_total: 0,
      };

      estado.insumos.push(creado);
      return respuestaDeExito(creado, 201);
    }

    if (metodo === "PATCH" && url.includes("/api/inventario/insumos/")) {
      const id = idDeLaUrl(url);
      const insumo = estado.insumos.find((fila) => fila.id_insumo === id);

      if (insumo === undefined) {
        return respuestaDeError("NO_ENCONTRADO", "Ese insumo no existe.", 404);
      }

      const nombre = cuerpo?.nombre === undefined ? insumo.nombre : texto(cuerpo.nombre).trim();

      if (nombre === "") {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Escribe el nombre del insumo.",
        );
      }

      if (
        estado.insumos.some(
          (otro) => otro.id_insumo !== id && otro.nombre === nombre,
        )
      ) {
        return respuestaDeError(
          "NOMBRE_DUPLICADO",
          "Ya hay un insumo con ese nombre.",
          409,
        );
      }

      let idUnidad = insumo.id_unidad;

      if (cuerpo?.id_unidad !== undefined) {
        idUnidad = numero(cuerpo.id_unidad);

        if (
          idUnidad !== insumo.id_unidad &&
          estado.movimientos.some(
            (movimiento) => movimiento.id_insumo === id,
          )
        ) {
          return respuestaDeError(
            "UNIDAD_CON_MOVIMIENTOS",
            "Ese insumo ya tiene movimientos. La unidad no se puede cambiar porque las cantidades anteriores quedarían con otro significado.",
            409,
          );
        }
      }

      const unidad = estado.unidades.find(
        (candidata) => candidata.id_unidad === idUnidad,
      );

      if (unidad === undefined) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Esa unidad de medida no existe.",
        );
      }

      insumo.nombre = nombre;
      insumo.id_unidad = unidad.id_unidad;
      insumo.unidad = unidad.nombre;
      insumo.abreviatura = unidad.abreviatura;
      insumo.minimo =
        cuerpo?.minimo === undefined
          ? insumo.minimo
          : Number(cuerpo.minimo);
      insumo.activo =
        typeof cuerpo?.activo === "boolean" ? cuerpo.activo : insumo.activo;

      cambiarNombreEnMovimientos(id, insumo.nombre, insumo.abreviatura);

      return respuestaDeExito(insumo);
    }

    if (metodo === "POST" && url.endsWith("/api/inventario/proveedores")) {
      const nombre = texto(cuerpo?.nombre).trim();

      if (nombre === "") {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Escribe el nombre del proveedor.",
        );
      }

      if (estado.proveedores.some((proveedor) => proveedor.nombre === nombre)) {
        return respuestaDeError(
          "NOMBRE_DUPLICADO",
          "Ya hay un proveedor con ese nombre.",
          409,
        );
      }

      const creado: Proveedor = {
        id_proveedor: siguienteId(estado.proveedores, "id_proveedor"),
        nombre,
        telefono: texto(cuerpo?.telefono).trim(),
        estado: "Activo",
        compras: 0,
      };

      estado.proveedores.push(creado);
      return respuestaDeExito(creado, 201);
    }

    if (metodo === "PATCH" && url.includes("/api/inventario/proveedores/")) {
      const id = idDeLaUrl(url);
      const proveedor = estado.proveedores.find(
        (fila) => fila.id_proveedor === id,
      );

      if (proveedor === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Ese proveedor no existe.",
          404,
        );
      }

      proveedor.nombre =
        cuerpo?.nombre === undefined
          ? proveedor.nombre
          : texto(cuerpo.nombre).trim();
      proveedor.telefono =
        cuerpo?.telefono === undefined
          ? proveedor.telefono
          : texto(cuerpo.telefono).trim();
      proveedor.estado =
        cuerpo?.estado === "Inactivo" ? "Inactivo" : cuerpo?.estado === "Activo" ? "Activo" : proveedor.estado;

      cambiarProveedorEnMovimientos(id, proveedor.nombre);

      return respuestaDeExito(proveedor);
    }

    if (metodo === "POST" && url.endsWith("/api/inventario/movimientos")) {
      const tipo = texto(cuerpo?.tipo);
      const idInsumo = numero(cuerpo?.id_insumo);
      const idPunto = numero(cuerpo?.id_punto);
      const insumo = estado.insumos.find((fila) => fila.id_insumo === idInsumo);
      const punto = estado.puntos.find((fila) => fila.id_punto === idPunto);

      if (insumo === undefined) {
        return respuestaDeError("DATOS_INVALIDOS", "Ese insumo no existe.");
      }

      if (!insumo.activo) {
        return respuestaDeError(
          "INSUMO_INACTIVO",
          `El insumo "${insumo.nombre}" está inactivo. Actívalo antes de moverlo.`,
          409,
        );
      }

      if (punto === undefined) {
        return respuestaDeError(
          "DATOS_INVALIDOS",
          "Ese punto de acceso no existe.",
        );
      }

      let existencia = estado.existencias.find(
        (fila) => fila.id_insumo === idInsumo && fila.id_punto === idPunto,
      );

      if (existencia === undefined) {
        existencia = {
          id_insumo: idInsumo,
          id_punto: idPunto,
          existencia: 0,
          actualizado: new Date().toISOString(),
        };
        estado.existencias.push(existencia);
      }

      const actual = existencia.existencia;
      let cantidad: number;
      let detalle: string;
      let idProveedor: number | null = null;

      if (tipo === "Ajuste por conteo") {
        const conteo = Number(cuerpo?.conteo_fisico ?? 0);
        cantidad = Math.round((conteo - actual) * 100) / 100;

        if (cantidad === 0) {
          return respuestaDeError(
            "SIN_DIFERENCIA",
            "El conteo coincide con la existencia actual. No hay nada que ajustar.",
            409,
          );
        }

        detalle = `Ajuste por conteo: había ${actual}, se contaron ${conteo}.`;
      } else {
        const cantidadPositiva = Number(cuerpo?.cantidad ?? 0);
        detalle = texto(cuerpo?.detalle).trim();

        if (tipo === "Entrada de compra") {
          idProveedor = numero(cuerpo?.id_proveedor);
          const proveedor = estado.proveedores.find(
            (fila) => fila.id_proveedor === idProveedor,
          );

          if (proveedor?.estado !== "Activo") {
            return respuestaDeError(
              "PROVEEDOR_INACTIVO",
              "Ese proveedor está inactivo. Elige uno activo.",
              409,
            );
          }

          cantidad = cantidadPositiva;
        } else {
          cantidad = -cantidadPositiva;
        }

        if (actual + cantidad < 0) {
          return respuestaDeError(
            "EXISTENCIA_INSUFICIENTE",
            `Solo hay ${actual} en ese punto. No puedes sacar ${cantidadPositiva}.`,
            409,
          );
        }
      }

      existencia.existencia = Math.round((actual + cantidad) * 100) / 100;
      existencia.actualizado = new Date().toISOString();
      recalcularTotal(idInsumo);

      const proveedor =
        idProveedor === null
          ? null
          : (estado.proveedores.find(
              (fila) => fila.id_proveedor === idProveedor,
            ) ?? null);

      if (proveedor !== null) proveedor.compras += 1;

      const movimiento: MovimientoDeInventario = {
        id_movimiento: siguienteId(estado.movimientos, "id_movimiento"),
        tipo:
          tipo === "Entrada de compra"
            ? "Entrada de compra"
            : tipo === "Ajuste por conteo"
              ? "Ajuste por conteo"
              : "Salida por consumo",
        id_insumo: idInsumo,
        insumo: insumo.nombre,
        abreviatura: insumo.abreviatura,
        id_punto: idPunto,
        punto: punto.nombre,
        cantidad,
        detalle,
        id_proveedor: idProveedor,
        proveedor: proveedor?.nombre ?? null,
        id_empleado: 1,
        empleado: "Ana Pérez",
        ocurrido_en: new Date().toISOString(),
      };

      estado.movimientos.unshift(movimiento);

      return respuestaDeExito(
        {
          movimiento,
          existencia: existencia.existencia,
          existencia_total: totalDe(idInsumo),
        },
        201,
      );
    }

    return respuestaDeError("NO_ENCONTRADO", "Esa ruta no existe.", 404);
  }

  return {
    manejador: manejar,
    peticiones,
    fallos,
    datos: () => ({
      insumos: estado.insumos,
      puntos: estado.puntos,
      existencias: estado.existencias,
      unidades: estado.unidades,
    }),
    movimientos: () => estado.movimientos,
    proveedores: () => estado.proveedores,
  };
}
