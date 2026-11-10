/*
  webhooks.js (rutas) — lo que PayPal avisa (Fase 8).
  -------------------------------------------------------

  Endpoints:
    POST /api/webhooks/paypal   evento de PayPal (pago aprobado o completado)

  Esta ruta es PÚBLICA: la llama PayPal, no un empleado con sesión. Por eso lo
  primero que hace es VERIFICAR LA FIRMA con PayPal. Sin esa verificación,
  cualquiera podría mandar un "pago completado" falso y marcar una cuenta como
  pagada sin haber cobrado nada.

  Con la firma verificada:
    · `CHECKOUT.ORDER.APPROVED` o `PAYMENT.CAPTURE.COMPLETED` → se cobra la
      cuenta y se emite la factura electrónica sola.
    · Cualquier otro evento → se acknowledges y no se hace nada.

  Para que PayPal llegue hasta aquí, el servidor tiene que estar en una
  dirección pública (por ejemplo, con un túnel) y el webhook apuntando a
  `https://TU_DIRECCION/api/webhooks/paypal`.
*/

import express from "express";

import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import { registrarPagoPaypal } from "../servicios/pago-paypal.js";
import { verificarFirmaDeWebhook } from "../servicios/paypal.js";

const EVENTOS_QUE_INTERESAN = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
];

export function rutasDeWebhooks() {
  const rutas = express.Router();

  rutas.post(
    "/paypal",
    asyncHandler(async (req, res) => {
      const evento = req.body ?? {};
      const tipo = evento.event_type ?? "";

      const verificada = await verificarFirmaDeWebhook(req.headers, evento);

      if (!verificada) {
        throw new ErrorDeApi(
          401,
          "SIN_PERMISO",
          "La firma del webhook no es válida: no se procesa nada.",
        );
      }

      if (!EVENTOS_QUE_INTERESAN.includes(tipo)) {
        exito(res, {
          recibido: true,
          procesado: false,
          mensaje: `Evento recibido y verificado: ${tipo}. No hay nada que hacer.`,
        });
        return;
      }

      const idPedido =
        evento.resource?.id ??
        evento.resource?.supplementary_data?.related_ids?.order_id ??
        null;

      if (typeof idPedido !== "string" || idPedido === "") {
        throw new ErrorDeApi(
          400,
          "DATOS_INVALIDOS",
          "El evento no dice cuál es el pedido de PayPal.",
        );
      }

      const resultado = await registrarPagoPaypal(idPedido);

      exito(res, { recibido: true, procesado: true, ...resultado });
    }),
  );

  return rutas;
}
