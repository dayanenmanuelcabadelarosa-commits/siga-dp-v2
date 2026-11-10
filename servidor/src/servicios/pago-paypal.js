/*
  servicios/pago-paypal.js — el pago de PayPal que llega solo (Fase 8).
  ---------------------------------------------------------------------------

  Cuando PayPal avisa que el cliente aprobó y pagó, esto hace tres cosas, en
  este orden:

    1. Captura el cobro en PayPal (si el pedido estaba aprobado y no capturado).
    2. Registra el pago en la base, EN PESOS: el total de la cuenta. La venta
       queda pagada.
    3. Emite la factura electrónica, para que el cliente tenga su comprobante
       sin que nadie tenga que hacer nada.

  Si la factura falla, el pago NO se pierde: queda registrado y el aviso dice
  que la factura hay que emitirla a mano. El dinero cobrado es lo primero.
*/

import { conTransaccion, consultarUno } from "../db/conexion.js";
import { ErrorDeApi } from "../errores.js";
import { emitirFacturaElectronica } from "./facturacion.js";
import { capturarPedido } from "./paypal.js";

/**
 * Procesa un pago de PayPal que ya fue aprobado.
 *
 * @param {string} idPedido  El id del pedido en PayPal.
 * @param {object} [opciones] Para las pruebas: `fetch` y `config`.
 */
export async function registrarPagoPaypal(idPedido, opciones = {}) {
  const fila = await consultarUno(
    `SELECT id_pago_paypal, id_cuenta, estado, id_cajero
       FROM pago_paypal
      WHERE id_paypal = $1`,
    [idPedido],
  );

  if (!fila) {
    throw new ErrorDeApi(
      404,
      "NO_ENCONTRADO",
      "Ese pedido de PayPal no existe en el sistema.",
    );
  }

  const cuenta = await consultarUno(
    "SELECT id_cuenta, estado FROM cuenta WHERE id_cuenta = $1",
    [fila.id_cuenta],
  );

  if (!cuenta) {
    throw new ErrorDeApi(404, "NO_ENCONTRADO", "La cuenta ya no existe.");
  }

  if (cuenta.estado === "Pagada") {
    return {
      cobrado: false,
      yaCobrado: true,
      mensaje: "La cuenta ya estaba pagada: no se cobra dos veces.",
    };
  }

  const cobro = await capturarPedido(idPedido, opciones.paypal ?? {});

  if (cobro.estado !== "COMPLETED") {
    throw new ErrorDeApi(
      409,
      "CONFLICTO_DE_ESTADO",
      `PayPal todavía no confirmó el pago (estado ${cobro.estado}).`,
    );
  }

  const referencia = cobro.identificadorPago ?? cobro.id;

  const totalFila = await consultarUno(
    "SELECT fn_total_cuenta($1)::FLOAT8 AS total FROM cuenta WHERE id_cuenta = $1",
    [fila.id_cuenta],
  );

  await conTransaccion(
    async ({ consultarUno: uno }) => {
      await uno(
        "SELECT fn_cobrar_cuenta($1, 'PayPal', $2, $3, 0, $4)",
        [fila.id_cuenta, Number(totalFila?.total ?? 0), fila.id_cajero, referencia],
      );

      await uno(
        `UPDATE pago_paypal
            SET estado = 'COMPLETED',
                correo_comprador = $1,
                actualizado_en = now()
          WHERE id_paypal = $2`,
        [cobro.correo, idPedido],
      );
    },
    { usuario: "PayPal (webhook)" },
  );

  /*
    La factura sale a nombre del comprador final: PayPal no da el RNC, así que
    es un comprobante de consumo (32), no de crédito fiscal (31).
  */
  let factura = null;
  let aviso = null;

  try {
    factura = await emitirFacturaElectronica({
      idCuenta: fila.id_cuenta,
      tipo: "B02",
      nombre: cobro.nombre || "Consumidor Final",
      rnc: null,
      forma: "PayPal",
      referencia,
      idEmpleado: fila.id_cajero,
      nombreEmisor: "PayPal (webhook)",
      opciones: opciones.imecf ?? {},
    });
  } catch (fallo) {
    aviso = `El pago quedó registrado, pero la factura no se pudo emitir: ${fallo.message}`;
  }

  return {
    cobrado: true,
    yaCobrado: false,
    referencia,
    correo: cobro.correo,
    factura,
    aviso,
    mensaje: "Pago de PayPal confirmado y registrado en la base.",
  };
}
