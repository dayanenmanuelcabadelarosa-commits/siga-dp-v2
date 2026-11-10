/*
  parametros.js (rutas) — los parámetros fiscales del local.
  --------------------------------------------------------

    GET /api/parametros   la tasa de impuesto, el RNC, la razón social...

  Es la ruta más pequeña que se puede proteger de verdad, y existe en la Fase 2
  por un motivo concreto: el criterio de salida de la fase pide demostrar que con
  un rol incorrecto se responde 403. Hacía falta al menos una operación real que
  exigiera un permiso, y esta lo es: la tasa de impuesto y los datos fiscales no
  los tiene que poder leer cualquiera.

  El módulo completo de parámetros (crearlos y editarlos) es la Fase 4.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";

export function rutasDeParametros() {
  const rutas = express.Router();

  rutas.get(
    "/",
    requiereSesion,
    requierePermiso("ADMINISTRAR_PARAMETROS"),
    asyncHandler(async (_req, res) => {
      const parametro = await consultarUno(
        `SELECT p.id_parametro, p.nombre_empresa, p.rnc, p.direccion, p.telefono,
                p.tasa_impuesto, p.cuenta_pagos, p.vigente_desde
           FROM parametro p
          ORDER BY p.vigente_desde DESC, p.id_parametro DESC
          LIMIT 1`,
      );

      if (!parametro) {
        throw new ErrorDeApi(
          404,
          "NO_ENCONTRADO",
          "Todavía no hay parámetros fiscales cargados en el sistema.",
        );
      }

      exito(res, parametro);
    }),
  );

  return rutas;
}
