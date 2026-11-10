/*
  paypal.js (rutas) — cobro con PayPal (Fase 8).
  ----------------------------------------------

  Endpoints:
    POST /api/paypal/pedidos               crea el pedido de PayPal para una cuenta
    GET  /api/paypal/pedidos/:id           en qué estado está el pedido
    POST /api/paypal/pedidos/:id/capturar  captura el pago y lo registra en la base

  Permiso: REGISTRAR_PAGO (dueño, gerente y cajero).

  El flujo es el de PayPal: el cajero crea el pedido, el cliente lo aprueba en
  la página de PayPal y el local lo captura. Solo cuando PayPal confirma
  (COMPLETED) se registra el pago en PostgreSQL con `fn_cobrar_cuenta`.

  Aquí no hay simulador: si PayPal no está configurado o no responde, se dice
  y no se cobra nada.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  capturarPedido,
  convertirADolares,
  crearPedido,
  consultarPedido,
} from "../servicios/paypal.js";
import { esquemaPagoPaypal } from "../validaciones/paypal.js";
import { validar } from "../validaciones/validar.js";

export function rutasDePaypal() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // POST /api/paypal/pedidos
  rutas.post(
    "/pedidos",
    requierePermiso("REGISTRAR_PAGO"),
    validar(esquemaPagoPaypal),
    asyncHandler(async (req, res) => {
      const { mesa } = req.datos;

      const cuenta = await consultarUno(
        `SELECT c.id_cuenta, c.estado, c.id_mesero,
                fn_total_cuenta(c.id_cuenta)::FLOAT8 AS total
           FROM cuenta c
           JOIN mesa m ON m.id_mesa = c.id_mesa
          WHERE m.numero = $1
            AND c.estado = 'Abierta'`,
        [mesa],
      );

      if (!cuenta) {
        throw new ErrorDeApi(
          404,
          "NO_ENCONTRADO",
          "Esa mesa no tiene una cuenta abierta.",
        );
      }

      // La misma regla del cobro: el mesero no cobra su propia mesa.
      if (
        req.sesion.rol === "mesero" &&
        req.sesion.idEmpleado === cuenta.id_mesero
      ) {
        throw new ErrorDeApi(
          403,
          "SIN_PERMISO",
          "Un mesero no puede cobrar la cuenta de su propia mesa.",
        );
      }

      /*
        PayPal cobra en dólares. La cuenta del local está en pesos, así que el
        monto se convierte con la tasa que escribió el dueño
        (`parametro.tasa_cambio_usd`: cuántos pesos vale un dólar). La tasa
        queda congelada en este pedido: si mañana cambia, este cobro no cambia.
      */
      const parametros = await consultarUno(
        "SELECT tasa_cambio_usd::FLOAT8 AS tasa FROM parametro ORDER BY id_parametro DESC LIMIT 1",
      );

      if (!parametros?.tasa) {
        throw new ErrorDeApi(
          503,
          "INTEGRACION_NO_CONFIGURADA",
          "Falta la tasa de cambio para cobrar en PayPal. Escríbela en la configuración del sistema.",
        );
      }

      const tasa = Number(parametros.tasa);
      const totalEnPesos = Number(cuenta.total);
      const montoEnDolares = convertirADolares(totalEnPesos, tasa);

      const referencia = `CUENTA-${cuenta.id_cuenta}`;
      const pedido = await crearPedido(montoEnDolares, referencia);

      await consultarUno(
        `INSERT INTO pago_paypal (id_cuenta, id_paypal, referencia, monto, monto_rd, tasa_cambio, estado, enlace_aprobacion, id_cajero)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id_pago_paypal`,
        [
          cuenta.id_cuenta,
          pedido.id,
          pedido.referencia,
          pedido.monto,
          totalEnPesos,
          tasa,
          pedido.estado,
          pedido.enlace,
          req.sesion.idEmpleado,
        ],
      );

      exito(
        res,
        {
          id: pedido.id,
          estado: pedido.estado,
          referencia: pedido.referencia,
          monto: pedido.monto,
          moneda: pedido.moneda,
          montoEnPesos: totalEnPesos,
          tasaCambio: tasa,
          enlace: pedido.enlace,
          mensaje: "Pedido de PayPal creado. El cliente tiene que aprobarlo.",
        },
        201,
      );
    }),
  );

  // GET /api/paypal/pedidos/:id
  rutas.get(
    "/pedidos/:id",
    requierePermiso("REGISTRAR_PAGO"),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id || "").trim();

      const guardado = await consultarUno(
        "SELECT id_pago_paypal, id_cuenta, estado FROM pago_paypal WHERE id_paypal = $1",
        [id],
      );

      if (!guardado) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese pedido de PayPal no existe.");
      }

      const pedido = await consultarPedido(id);

      await consultar(
        "UPDATE pago_paypal SET estado = $1, actualizado_en = now() WHERE id_paypal = $2",
        [pedido.estado, id],
      );

      exito(res, pedido);
    }),
  );

  // POST /api/paypal/pedidos/:id/capturar
  rutas.post(
    "/pedidos/:id/capturar",
    requierePermiso("REGISTRAR_PAGO"),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id || "").trim();

      const guardado = await consultarUno(
        "SELECT id_pago_paypal, id_cuenta, estado FROM pago_paypal WHERE id_paypal = $1",
        [id],
      );

      if (!guardado) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese pedido de PayPal no existe.");
      }

      const cobro = await capturarPedido(id);

      if (cobro.estado !== "COMPLETED") {
        await consultar(
          "UPDATE pago_paypal SET estado = $1, actualizado_en = now() WHERE id_paypal = $2",
          [cobro.estado, id],
        );

        throw new ErrorDeApi(
          409,
          "CONFLICTO_DE_ESTADO",
          `PayPal todavía no confirmó el pago (estado ${cobro.estado}).`,
        );
      }

      const resultado = await conTransaccion(
        async ({ consultarUno: uno }) => {
          const cuenta = await uno(
            "SELECT id_cuenta, estado FROM cuenta WHERE id_cuenta = $1",
            [guardado.id_cuenta],
          );

          if (!cuenta) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "La cuenta ya no existe.");
          }

          if (cuenta.estado !== "Abierta") {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "Esa cuenta ya no está abierta: no se puede cobrar dos veces.",
            );
          }

          const referencia = cobro.identificadorPago ?? cobro.id;

          /*
            La venta se registra en la base en PESOS (el total de la cuenta), no
            en dólares: así el corte de caja y los comprobantes siguen hablando
            el idioma del local. Lo que se cobró en dólares quedó guardado en
            `pago_paypal`, con la tasa que se usó.
          */
          const totalFila = await uno(
            "SELECT fn_total_cuenta($1)::FLOAT8 AS total FROM cuenta WHERE id_cuenta = $1",
            [cuenta.id_cuenta],
          );
          const totalEnPesos = Number(totalFila?.total ?? 0);

          const pago = await uno(
            "SELECT * FROM fn_cobrar_cuenta($1, 'PayPal', $2, $3, 0, $4)",
            [cuenta.id_cuenta, totalEnPesos, req.sesion.idEmpleado, referencia],
          );

          await uno(
            `UPDATE pago_paypal
                SET estado = 'COMPLETED',
                    actualizado_en = now()
              WHERE id_paypal = $1`,
            [id],
          );

          return { pagoId: pago.pago_id, referencia };
        },
        { usuario: req.sesion.usuario },
      );

      exito(
        res,
        {
          id: cobro.id,
          estado: cobro.estado,
          referencia: resultado.referencia,
          pagoId: resultado.pagoId,
          monto: cobro.monto,
          moneda: cobro.moneda,
          mensaje: "Pago de PayPal confirmado y registrado en la base.",
        },
        201,
      );
    }),
  );

  return rutas;
}
