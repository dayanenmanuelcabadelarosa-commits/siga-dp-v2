/*
  asistente.js (rutas) — sugerencias del asistente para una mesa (Fase 8).
  ---------------------------------------------------------------------------

  Endpoints:
    GET /api/asistente/sugerencias/:mesa   qué platos encajan con lo pedido

  Permiso: VER_ASISTENTE (dueño y gerente).

  El precio y el tiempo de preparación de cada sugerencia salen del catálogo de
  PostgreSQL. El modelo solo elige qué platos y por qué.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { puede } from "../acceso/autenticacion.js";
import { consultar } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import { esquemaPregunta } from "../validaciones/asistente.js";
import { validar } from "../validaciones/validar.js";
import {
  menuDelLocal,
  responder,
  ventasDeHoy,
} from "../servicios/chat.js";
import { sugerir } from "../servicios/asistente.js";

export function rutasDeAsistente() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // POST /api/asistente/chat
  /*
    El chat de Doña Pula. Solo consulta: aquí no se escribe nada. Las ventas
    solo se le enseñan a quien tiene CONSULTAR_REPORTES.
  */
  rutas.post(
    "/chat",
    validar(esquemaPregunta),
    asyncHandler(async (req, res) => {
      const { pregunta } = req.datos;

      const menu = await menuDelLocal();
      const puedeVerVentas = await puede(
        req.sesion.idUsuario,
        "CONSULTAR_REPORTES",
      );
      const ventas = puedeVerVentas ? await ventasDeHoy() : null;

      const resultado = await responder(pregunta, menu, ventas);

      exito(res, {
        respuesta: resultado.respuesta,
        origen: resultado.origen,
        puedeVerVentas,
      });
    }),
  );

  rutas.get(
    "/sugerencias/:mesa",
    requierePermiso("VER_ASISTENTE"),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);

      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(
          400,
          "DATOS_INVALIDOS",
          "El número de mesa no es válido.",
        );
      }

      const catalogo = await consultar(
        `SELECT p.id_producto AS id,
                p.nombre,
                c.nombre AS categoria,
                e.nombre AS estacion,
                p.precio::FLOAT8 AS precio,
                p.disponible,
                p.tiempo_estimado_minutos AS "minutosEstimados",
                COALESCE((SELECT SUM(lc.cantidad)
                            FROM linea_cuenta lc
                           WHERE lc.id_producto = p.id_producto), 0)::FLOAT8 AS vendidos
           FROM producto p
           JOIN categoria c ON c.id_categoria = p.id_categoria
           JOIN estacion e  ON e.id_estacion  = p.id_estacion
          WHERE p.activo
          ORDER BY c.nombre, p.nombre`,
      );

      const pedido = await consultar(
        `SELECT pr.nombre, SUM(lp.cantidad)::FLOAT8 AS cantidad
           FROM linea_pedido lp
           JOIN producto pr ON pr.id_producto = lp.id_producto
           JOIN pedido p ON p.id_pedido = lp.id_pedido
           JOIN mesa m ON m.id_mesa = p.id_mesa
          WHERE m.numero = $1
            AND p.estado IN ('Abierto', 'Enviado')
            AND lp.estado <> 'Anulada'
          GROUP BY pr.nombre
          ORDER BY pr.nombre`,
        [mesa],
      );

      const resultado = await sugerir({
        catalogo,
        pedido,
        promociones: [],
      });

      exito(res, { mesa, ...resultado });
    }),
  );

  return rutas;
}
