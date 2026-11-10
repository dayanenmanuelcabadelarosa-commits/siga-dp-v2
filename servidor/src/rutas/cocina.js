/*
  cocina.js (rutas) — Cocina y estaciones (Fase 5, módulo 2).
  ----------------------------------------------------------

  Endpoints:
    GET  /api/cocina/estaciones              estaciones con comandas pendientes
    GET  /api/cocina/comandas[?estacion=]    comandas activas con sus líneas
    POST /api/cocina/comandas/:id/iniciar    empezar a preparar una comanda
    POST /api/cocina/comandas/:id/preparar   avisar que la comanda está lista
    GET  /api/cocina/productos               productos activos y su disponibilidad
    PATCH /api/cocina/productos/:id/disponibilidad  marcar agotado o reponer

  Permisos: CONFIRMAR_PREPARACION para las comandas y REPORTAR_AGOTADO para la
  disponibilidad. Los dos son de dueño, gerente y cocina. Es exactamente lo que
  dice la matriz aprobada: la cocina avisa que el plato está listo, pero no lo
  entrega (MARCAR_ENTREGA es del mesero y del capitán).

  Reglas:
    · El avance es hacia adelante y no se puede saltar: Pendiente → En
      preparación → Preparado.
    · Cada cambio deja rastro en `historial_linea`, con el empleado que lo hizo.
    · La comanda se bloquea (FOR UPDATE) mientras se cambia, para que dos
      pantallas de cocina no la muevan a la vez.
    · "Reportar agotado" y "reposición" son la misma operación: marcar
      `disponible = false` y volver a ponerlo en `true`. El dueño aprobó la
      operación 28 el 19 de octubre de 2026 (migración 014).
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaDisponibilidad,
  esquemaListarComandas,
} from "../validaciones/cocina.js";
import { validar } from "../validaciones/validar.js";

/** Las líneas de una comanda, con el producto y lo que pidió el cliente. */
const SELECT_LINEAS_DE_COMANDA = `
  SELECT lc.id_linea_comanda  AS id,
         pr.nombre            AS producto,
         lc.cantidad,
         lp.comensal,
         COALESCE(lp.observacion, '') AS observacion,
         lc.estado,
         lc.hora_inicio,
         lc.hora_preparado
    FROM linea_comanda lc
    JOIN linea_pedido lp ON lp.id_linea_pedido = lc.id_linea_pedido
    JOIN producto pr     ON pr.id_producto     = lp.id_producto
   WHERE lc.id_comanda = $1
   ORDER BY lc.id_linea_comanda`;

/** Lee una comanda con su mesa, su mesero, su estación y sus líneas. */
async function comandaConLineas(consultarUno, consultar, idComanda) {
  const comanda = await consultarUno(
    `SELECT c.id_comanda,
            c.numero,
            c.estado,
            c.enviada_en,
            c.iniciada_en,
            c.cerrada_en,
            e.nombre  AS estacion,
            m.numero  AS mesa,
            emp.nombre AS mesero
       FROM comanda c
       JOIN estacion e  ON e.id_estacion  = c.id_estacion
       JOIN pedido p    ON p.id_pedido    = c.id_pedido
       JOIN mesa m      ON m.id_mesa      = p.id_mesa
       JOIN empleado emp ON emp.id_empleado = p.id_mesero
      WHERE c.id_comanda = $1`,
    [idComanda],
  );

  if (!comanda) return null;

  comanda.lineas = await consultar(SELECT_LINEAS_DE_COMANDA, [idComanda]);
  return comanda;
}

function idDeLaComanda(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El identificador de la comanda no es válido.",
    );
  }
  return id;
}

/**
 * Mueve una comanda de un estado al siguiente, dentro de una transacción.
 *
 * `desde` es el único estado del que se puede partir; `hacia` es el estado
 * nuevo. Las líneas que están en `desde` pasan a `hacia`, y cada una deja una
 * fila en el historial. Devuelve la comanda ya actualizada.
 *
 * `campoComanda` y `campoLinea` son las columnas de fecha que se sellan. La
 * comanda solo tiene `iniciada_en`; no hay una columna de "lista", así que al
 * terminar se sella la hora de cada línea (`hora_preparado`) y la comanda se
 * queda con `cerrada_en` para cuando se cierre de verdad.
 */
async function avanzarComanda(
  req,
  { desde, hacia, campoComanda = null, campoLinea, detalle },
) {
  const id = idDeLaComanda(req);

  await conTransaccion(
    async ({ consultarUno, consultar }) => {
      const comanda = await consultarUno(
        "SELECT id_comanda, estado FROM comanda WHERE id_comanda = $1 FOR UPDATE",
        [id],
      );

      if (!comanda) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa comanda no existe.");
      }

      if (comanda.estado !== desde) {
        throw new ErrorDeApi(
          409,
          "CONFLICTO_DE_ESTADO",
          desde === "Pendiente"
            ? "Esa comanda ya se empezó."
            : "Esa comanda todavía no está en preparación.",
        );
      }

      await consultarUno(
        `UPDATE comanda
            SET estado = $1${campoComanda ? `, ${campoComanda} = now()` : ""}
          WHERE id_comanda = $2`,
        [hacia, id],
      );

      const lineas = await consultar(
        `UPDATE linea_comanda
            SET estado = $1, ${campoLinea} = now()
          WHERE id_comanda = $2 AND estado = $3
          RETURNING id_linea_comanda`,
        [hacia, id, desde],
      );

      for (const linea of lineas) {
        await consultarUno(
          `INSERT INTO historial_linea (id_linea_comanda, etapa, id_empleado, detalle)
           VALUES ($1, $2, $3, $4)`,
          [linea.id_linea_comanda, hacia, req.sesion.idEmpleado, detalle],
        );
      }
    },
    { usuario: req.sesion.usuario },
  );

  return comandaConLineas(consultarUno, consultar, id);
}

export function rutasDeCocina() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // GET /api/cocina/estaciones
  rutas.get(
    "/estaciones",
    requierePermiso("CONFIRMAR_PREPARACION"),
    asyncHandler(async (_req, res) => {
      const estaciones = await consultar(
        `SELECT e.id_estacion,
                e.nombre,
                COUNT(c.id_comanda) FILTER (
                  WHERE c.estado IN ('Pendiente', 'En preparación')
                ) AS pendientes
           FROM estacion e
           LEFT JOIN comanda c ON c.id_estacion = e.id_estacion
          GROUP BY e.id_estacion, e.nombre
          ORDER BY e.nombre`,
      );

      exito(
        res,
        estaciones.map((estacion) => ({
          ...estacion,
          pendientes: Number(estacion.pendientes),
        })),
      );
    }),
  );

  // GET /api/cocina/comandas
  rutas.get(
    "/comandas",
    requierePermiso("CONFIRMAR_PREPARACION"),
    validar(esquemaListarComandas, "consulta"),
    asyncHandler(async (req, res) => {
      const { estacion } = req.datos;

      const comandas = await consultar(
        `SELECT c.id_comanda,
                c.numero,
                c.estado,
                c.enviada_en,
                c.iniciada_en,
                c.cerrada_en,
                e.nombre  AS estacion,
                m.numero  AS mesa,
                emp.nombre AS mesero
           FROM comanda c
           JOIN estacion e   ON e.id_estacion   = c.id_estacion
           JOIN pedido p     ON p.id_pedido     = c.id_pedido
           JOIN mesa m       ON m.id_mesa       = p.id_mesa
           JOIN empleado emp ON emp.id_empleado = p.id_mesero
          WHERE c.estado IN ('Pendiente', 'En preparación', 'Preparado')
            AND ($1::INTEGER IS NULL OR c.id_estacion = $1)
          ORDER BY c.enviada_en, c.numero`,
        [estacion ?? null],
      );

      for (const comanda of comandas) {
        comanda.lineas = await consultar(SELECT_LINEAS_DE_COMANDA, [
          comanda.id_comanda,
        ]);
      }

      exito(res, comandas);
    }),
  );

  // POST /api/cocina/comandas/:id/iniciar
  rutas.post(
    "/comandas/:id/iniciar",
    requierePermiso("CONFIRMAR_PREPARACION"),
    asyncHandler(async (req, res) => {
      const comanda = await avanzarComanda(req, {
        desde: "Pendiente",
        hacia: "En preparación",
        campoComanda: "iniciada_en",
        campoLinea: "hora_inicio",
        detalle: "La cocina empezó a preparar la comanda.",
      });

      exito(res, {
        comanda,
        mensaje: `Comanda ${comanda.numero} en preparación.`,
      });
    }),
  );

  // POST /api/cocina/comandas/:id/preparar
  rutas.post(
    "/comandas/:id/preparar",
    requierePermiso("CONFIRMAR_PREPARACION"),
    asyncHandler(async (req, res) => {
      const comanda = await avanzarComanda(req, {
        desde: "En preparación",
        hacia: "Preparado",
        campoLinea: "hora_preparado",
        detalle: "La cocina avisó que la comanda está lista.",
      });

      exito(res, {
        comanda,
        mensaje: `Comanda ${comanda.numero} lista para servir.`,
      });
    }),
  );

  /* ------------------------------------------- agotado y reposición */

  // GET /api/cocina/productos
  rutas.get(
    "/productos",
    requierePermiso("REPORTAR_AGOTADO"),
    asyncHandler(async (_req, res) => {
      /*
        Se devuelven todos los activos, estén disponibles o agotados: la cocina
        necesita ver los agotados para poder reponerlos cuando llegue el insumo.
        Los inactivos no se venden, así que no se ofrecen.
      */
      const productos = await consultar(
        `SELECT p.id_producto,
                p.nombre,
                c.nombre AS categoria,
                e.nombre AS estacion,
                p.precio::FLOAT8 AS precio,
                p.disponible,
                CASE WHEN p.disponible THEN NULL
                     ELSE ROUND(EXTRACT(EPOCH FROM (now() - p.modificado_en)) / 3600, 2)
                END AS horas
           FROM producto p
           JOIN categoria c ON c.id_categoria = p.id_categoria
           JOIN estacion e  ON e.id_estacion  = p.id_estacion
          WHERE p.activo
          ORDER BY c.nombre, p.nombre`,
      );

      exito(res, productos);
    }),
  );

  // PATCH /api/cocina/productos/:id/disponibilidad
  rutas.patch(
    "/productos/:id/disponibilidad",
    requierePermiso("REPORTAR_AGOTADO"),
    validar(esquemaDisponibilidad, "cuerpo"),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ErrorDeApi(
          400,
          "DATOS_INVALIDOS",
          "El identificador del producto no es válido.",
        );
      }

      const { disponible } = req.datos;

      const producto = await conTransaccion(
        async ({ consultarUno }) => {
          const actual = await consultarUno(
            `SELECT id_producto, nombre, activo
               FROM producto
              WHERE id_producto = $1
              FOR UPDATE`,
            [id],
          );

          if (!actual) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese producto no existe.");
          }

          if (!actual.activo) {
            throw new ErrorDeApi(
              409,
              "PRODUCTO_INACTIVO",
              "Ese producto está fuera del catálogo. No se puede marcar agotado ni reponer.",
            );
          }

          return consultarUno(
            `UPDATE producto
                SET disponible = $1
              WHERE id_producto = $2
              RETURNING id_producto, nombre, disponible`,
            [disponible, id],
          );
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, {
        producto,
        mensaje: producto.disponible
          ? `${producto.nombre} vuelve a estar disponible.`
          : `${producto.nombre} quedó marcado como agotado.`,
      });
    }),
  );

  return rutas;
}
