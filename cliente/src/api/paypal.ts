/*
  paypal.ts — las llamadas de la integración con PayPal (Fase 8).
  -----------------------------------------------------------------

  El flujo es el de PayPal: se crea el pedido, el cliente lo aprueba en la
  página de PayPal y el local lo captura. Solo cuando PayPal confirma queda el
  pago escrito en la base.
*/

import { pedir } from "./cliente-http";

export interface PedidoDePaypal {
  id: string;
  estado: string;
  referencia: string;
  /** Lo que se cobra en PayPal (dólares). */
  monto: number;
  moneda: string;
  /** El total de la cuenta en pesos, antes de convertir. */
  montoEnPesos?: number;
  /** Cuántos pesos valía un dólar cuando se creó el pedido. */
  tasaCambio?: number;
  /** Enlace de aprobación. `null` si PayPal no lo devolvió. */
  enlace: string | null;
  mensaje?: string;
  pagoId?: number;
}

export function crearPedidoDePaypal(mesa: number): Promise<PedidoDePaypal> {
  return pedir<PedidoDePaypal>("/api/paypal/pedidos", {
    metodo: "POST",
    cuerpo: { mesa },
  });
}

export function consultarPedidoDePaypal(id: string): Promise<PedidoDePaypal> {
  return pedir<PedidoDePaypal>(`/api/paypal/pedidos/${id}`);
}

export function capturarPedidoDePaypal(id: string): Promise<PedidoDePaypal> {
  return pedir<PedidoDePaypal>(`/api/paypal/pedidos/${id}/capturar`, {
    metodo: "POST",
  });
}
