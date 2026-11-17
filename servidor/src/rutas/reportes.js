/*
  reportes.js (rutas) — reportes del sistema (Fase 7 + catálogo ampliado).
  ---------------------------------------------------------------------------

  Endpoints:
    GET /api/reportes                 catálogo de reportes disponibles
    GET /api/reportes/:codigo?desde=&hasta=   ejecuta un reporte del catálogo

  Permiso: CONSULTAR_REPORTES (todos los roles operativos lo tienen).
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { asyncHandler } from "../errores.js";
import { exito } from "../respuesta.js";
import CATALOGO from "../servicios/catalogoReportes.js";

export function rutasDeReportes() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  /* Catálogo de reportes (consumo del cliente para tarjetas y botones). */
  rutas.get(
    "/",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (_req, res) => {
      exito(res, CATALOGO.map(({ codigo, titulo, descripcion, categoria, necesitaRango }) => ({
        codigo,
        titulo,
        descripcion,
        categoria,
        necesitaRango,
      })));
    }),
  );

  /* Ejecuta un reporte del catálogo y devuelve las filas ya formateadas. */
  rutas.get(
    "/:codigo",
    requierePermiso("CONSULTAR_REPORTES"),
    asyncHandler(async (req, res) => {
      const reporte = CATALOGO.find((item) => item.codigo === req.params.codigo);

      if (reporte === undefined) {
        res.status(404).json({
          ok: false,
          error: {
            codigo: "NO_ENCONTRADO",
            mensaje: `El reporte "${req.params.codigo}" no existe en el catálogo.`,
          },
        });
        return;
      }

      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      const resultado = await reporte.ejecutar(desde, hasta);

      exito(res, resultado);
    }),
  );

  return rutas;
}
