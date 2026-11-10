/*
  bitacora.js (rutas) — consulta de la bitácora de auditoría (Fase 7).
  --------------------------------------------------------------------

  Endpoints:
    GET /api/bitacora   registros de auditoría, filtrables por fecha, acción y tabla

  Permiso: CONSULTAR_BITACORA (dueño y gerente).

  La bitácora es de solo lectura (RN-26): aquí solo se consulta.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { consultar } from "../db/conexion.js";
import { asyncHandler } from "../errores.js";
import { exito } from "../respuesta.js";
import { validar } from "../validaciones/validar.js";
import { esquemaConsultaBitacora } from "../validaciones/bitacora.js";

export function rutasDeBitacora() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  rutas.get(
    "/",
    requierePermiso("CONSULTAR_BITACORA"),
    validar(esquemaConsultaBitacora, "consulta"),
    asyncHandler(async (req, res) => {
      const { desde, hasta, accion, tabla, limite } = req.datos;

      const condiciones = [];
      const valores = [];

      if (desde) {
        valores.push(desde);
        condiciones.push(`(b.ocurrido_en AT TIME ZONE 'America/Santo_Domingo')::date >= $${valores.length}::date`);
      }

      if (hasta) {
        valores.push(hasta);
        condiciones.push(`(b.ocurrido_en AT TIME ZONE 'America/Santo_Domingo')::date <= $${valores.length}::date`);
      }

      if (accion) {
        valores.push(accion);
        condiciones.push(`b.accion = $${valores.length}`);
      }

      if (tabla) {
        valores.push(tabla);
        condiciones.push(`b.tabla_afectada = $${valores.length}`);
      }

      const limiteFinal = Math.min(Math.max(limite ?? 100, 1), 500);
      valores.push(limiteFinal);

      const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

      const filas = await consultar(
        `SELECT b.id_bitacora AS id,
                b.ocurrido_en AS "ocurridoEn",
                to_char(b.ocurrido_en AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY HH24:MI') AS cuando,
                b.usuario_nombre AS usuario,
                b.accion,
                b.detalle,
                b.tabla_afectada AS tabla,
                b.registro_afectado AS registro
           FROM bitacora b
           ${where}
           ORDER BY b.ocurrido_en DESC, b.id_bitacora DESC
           LIMIT $${valores.length}`,
        valores,
      );

      exito(res, filas);
    }),
  );

  return rutas;
}
