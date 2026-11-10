/*
  integraciones.js (rutas) — diagnóstico de las integraciones externas (Fase 8).
  ------------------------------------------------------------------------------

  Endpoints:
    GET /api/integraciones/estado   revisa cada API externa y dice qué falla

  Permiso: ADMINISTRAR_PARAMETROS (dueño y gerente).

  Esto no cobra ni consume tokens: solo comprueba las claves, la dirección y
  que la API conteste. Es lo primero que hay que mirar cuando una integración
  no funciona.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { asyncHandler } from "../errores.js";
import { exito } from "../respuesta.js";
import { diagnostico as diagnosticoDeAsistente } from "../servicios/asistente.js";
import { diagnostico as diagnosticoDeImecf } from "../servicios/imecf.js";
import { diagnostico as diagnosticoDePaypal } from "../servicios/paypal.js";

export function rutasDeIntegraciones() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  rutas.get(
    "/estado",
    requierePermiso("ADMINISTRAR_PARAMETROS"),
    asyncHandler(async (_req, res) => {
      const [paypal, asistente, imecf] = await Promise.all([
        diagnosticoDePaypal(),
        diagnosticoDeAsistente(),
        diagnosticoDeImecf(),
      ]);

      exito(res, [paypal, asistente, imecf]);
    }),
  );

  return rutas;
}
