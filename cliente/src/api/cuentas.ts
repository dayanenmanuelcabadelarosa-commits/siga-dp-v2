/*
  cuentas.ts — las llamadas del módulo Cuenta y detalle (Fase 6, módulo 1).
  ------------------------------------------------------------------------

  La pantalla no suma precios ni calcula el total: el total viene de
  `fn_total_cuenta` en PostgreSQL, dentro de la respuesta de la API. Aquí solo
  se declara la forma del dato y se llama a las rutas.
*/

import { pedir, pedirTexto } from "./cliente-http";

/** Una cuenta abierta tal como la lista la API. */
export interface CuentaAbierta {
  id: number;
  numero: string;
  mesa: number;
  zona: string;
  mesero: string;
  estado: "Abierta" | "Pagada";
  cortesia: boolean;
  /** Total calculado por `fn_total_cuenta` en PostgreSQL. */
  total: number;
  /**
   * El servicio del local (la propina legal del 10 % de los restaurantes).
   * Lo calcula `fn_servicio_de_la_cuenta`; es 0 si el dueño no lo activó.
   */
  servicio: number;
  /** Instante ISO que devuelve PostgreSQL. */
  abiertaEn: string;
  /** Hora local del negocio, en formato HH:MM. */
  hora: string;
}

/** Una línea copiada del pedido a la cuenta. */
export interface LineaDeCuenta {
  id: number;
  producto: string;
  cantidad: number;
  cantidadAsignada: number;
  precio: number;
  importe: number;
  /** Número del comensal, si el pedido lo indicó. */
  persona: number | null;
}

/** Un descuento o una cortesía aplicada a la cuenta. */
export interface DescuentoAplicado {
  id: number;
  concepto: string;
  monto: number;
  tipo: "Descuento" | "Cortesía";
  autorizadoPor: string;
  hora: string;
}

/** Una línea asignada a un comensal, con su monto. */
export interface AsignacionPorPersona {
  comensal: number;
  cantidad: number;
  total: number;
  /** El servicio (propina legal) que le toca a esta parte. */
  servicio: number;
  pagado: boolean;
}

/** Un cobro de la cuenta, con el comprobante que tiene (si lo tiene). */
export interface PagoDeCuenta {
  id: number;
  comensal: number | null;
  forma: "Efectivo" | "Tarjeta" | "PayPal" | "Crédito";
  referencia: string | null;
  total: number;
  comprobanteId: number | null;
  comprobanteNcf: string | null;
}

/** La cuenta abierta con su detalle. */
export interface CuentaDetalle extends CuentaAbierta {
  lineas: LineaDeCuenta[];
  descuentos: DescuentoAplicado[];
  asignaciones: AsignacionPorPersona[];
  pagos: PagoDeCuenta[];
}

/** Una mesa con pedido abierto que todavía no tiene cuenta. */
export interface MesaPorFacturar {
  idMesa: number;
  numero: number;
  zona: string;
  personas: number | null;
  mesero: string;
  idPedido: number;
  hora: string;
  /** Instante en que el mesero pidió la cuenta, o null si no la pidió. */
  cuentaPedidaEn: string | null;
  /** Hora local del aviso, en formato HH:MM. Null si no hay aviso. */
  horaPedida: string | null;
  /** Líneas guardadas que todavía no se enviaron a cocina. */
  lineasPendientes: number;
  /** Líneas enviadas y no anuladas que se copiarían a la cuenta. */
  lineasFacturables: number;
}

export interface ResumenDeCuentas {
  abiertas: CuentaAbierta[];
  /** Mesas cuyo mesero ya avisó que quieren la cuenta. */
  pedidas: MesaPorFacturar[];
  porGenerar: MesaPorFacturar[];
}

export function listarCuentas(): Promise<ResumenDeCuentas> {
  return pedir<ResumenDeCuentas>("/api/cuentas");
}

/** El detalle de la cuenta abierta de una mesa, o `null` si no hay ninguna. */
export function verCuenta(mesa: number): Promise<CuentaDetalle | null> {
  return pedir<CuentaDetalle | null>(`/api/cuentas/${mesa}`);
}

/** Un cobro que ya se hizo y que todavía no tiene comprobante fiscal. */
export interface ComprobantePendiente {
  id: number;
  numeroCuenta: string;
  mesa: number;
  comensal: number | null;
  forma: FormaDePago;
  referencia: string | null;
  total: number;
  fecha: string;
}

/** Los cobros que están esperando su comprobante fiscal. */
export function listarComprobantesPendientes(): Promise<ComprobantePendiente[]> {
  return pedir<ComprobantePendiente[]>("/api/cuentas/comprobantes-pendientes");
}

export function generarCuenta(mesa: number): Promise<{
  id: number;
  creada: boolean;
  cuenta: CuentaDetalle;
  mensaje: string;
}> {
  return pedir<{
    id: number;
    creada: boolean;
    cuenta: CuentaDetalle;
    mensaje: string;
  }>(`/api/cuentas/${mesa}/generar`, { metodo: "POST" });
}

export function aplicarDescuento(
  mesa: number,
  datos: { concepto: string; monto: string },
): Promise<{
  descuento: DescuentoAplicado;
  cuenta: CuentaDetalle;
  mensaje: string;
}> {
  return pedir<{
    descuento: DescuentoAplicado;
    cuenta: CuentaDetalle;
    mensaje: string;
  }>(`/api/cuentas/${mesa}/descuentos`, {
    metodo: "POST",
    cuerpo: datos,
  });
}

export function aplicarCortesia(
  mesa: number,
  datos: { concepto: string; monto: string },
): Promise<{
  descuento: DescuentoAplicado;
  cuenta: CuentaDetalle;
  mensaje: string;
}> {
  return pedir<{
    descuento: DescuentoAplicado;
    cuenta: CuentaDetalle;
    mensaje: string;
  }>(`/api/cuentas/${mesa}/cortesias`, {
    metodo: "POST",
    cuerpo: datos,
  });
}

export type FormaDePago = "Efectivo" | "Tarjeta" | "PayPal" | "Crédito";

export function cobrarCuenta(
  mesa: number,
  datos: {
    forma: FormaDePago;
    /** Solo con efectivo: cuánto dio el cliente. Con el resto, lo pone el servidor. */
    recibido?: string;
    propina?: string;
    referencia?: string;
    comensal?: number;
  },
): Promise<{
  pagoId: number;
  cambio: number;
  mensaje: string;
  cuentaPagada: boolean;
  comensal: number | null;
}> {
  return pedir<{
    pagoId: number;
    cambio: number;
    mensaje: string;
    cuentaPagada: boolean;
    comensal: number | null;
  }>(
    `/api/cuentas/${mesa}/cobrar`,
    { metodo: "POST", cuerpo: datos },
  );
}

/** Lo que devuelve la plataforma cuando emite el comprobante. */
export interface ComprobanteEmitido {
  /** El eNCF que asignó la DGII (por ejemplo, E320000000015). */
  ncf: string;
  id: number;
  pagoId?: number | null;
  /** El identificador del comprobante en la plataforma. */
  idEcF: string | null;
  trackId: string | null;
  /** Enlace donde el cliente ve el timbre. */
  dgiiUrl: string | null;
  estado: string;
  base: number;
  impuesto: number;
  total: number;
  mensaje: string;
}

export function emitirComprobante(
  mesa: number,
  datos: {
    tipo: "B01" | "B02";
    cliente: string;
    rncCliente?: string;
    forma?: FormaDePago;
    referencia?: string;
    pagoId?: number;
  },
): Promise<ComprobanteEmitido> {
  return pedir<ComprobanteEmitido>(`/api/cuentas/${mesa}/comprobantes`, {
    metodo: "POST",
    cuerpo: datos,
  });
}

/** Cómo va el comprobante en la plataforma. */
export function estadoDelComprobante(
  id: number,
): Promise<{ estadoEcF: string } & Record<string, unknown>> {
  return pedir<{ estadoEcF: string } & Record<string, unknown>>(
    `/api/comprobantes/${id}/estado`,
  );
}

/** El estado del timbre en la DGII. */
export function trackDelComprobante(
  id: number,
): Promise<Record<string, unknown>> {
  return pedir<Record<string, unknown>>(`/api/comprobantes/${id}/track`);
}

/** El XML firmado, como texto. */
export function xmlDelComprobante(id: number): Promise<string> {
  return pedirTexto(`/api/comprobantes/${id}/xml`);
}

export function anularComprobante(ncf: string): Promise<{
  ncf: string;
  mensaje: string;
}> {
  return pedir<{ ncf: string; mensaje: string }>(
    `/api/comprobantes/${ncf}/anular`,
    { metodo: "POST" },
  );
}

export interface RegistroDeComprobante {
  id: number;
  ncf: string;
  tipo: "B01" | "B02";
  cliente: string;
  rncCliente: string | null;
  base: number;
  impuesto: number;
  total: number;
  formaPago: FormaDePago;
  estado: "Emitido" | "Anulado";
  estadoEcF: string | null;
  emitidoEn: string;
  anuladoEn: string | null;
  idEcF: string | null;
  trackId: string | null;
  dgiiUrl: string | null;
  pagoId: number | null;
  comensal: number | null;
  numeroCuenta: string | null;
  mesa: number | null;
  emisor: string;
}

export function listarComprobantes(filtros: {
  desde?: string;
  hasta?: string;
  estado?: "Emitido" | "Anulado";
  busqueda?: string;
} = {}): Promise<RegistroDeComprobante[]> {
  const consulta = new URLSearchParams();
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor) consulta.set(campo, valor);
  }
  const parametros = consulta.toString();
  const sufijo = parametros ? `?${parametros}` : "";
  return pedir<RegistroDeComprobante[]>(`/api/comprobantes/historial${sufijo}`);
}

/**
 * Aplica una oferta (un descuento de la gerencia) a la cuenta. El descuento
 * queda guardado en la base y la cuenta se recalcula sola.
 */
export function aplicarOfertaACuenta(
  mesa: number,
  idOferta: number,
): Promise<{ cuenta: CuentaDetalle; mensaje: string }> {
  return pedir<{ cuenta: CuentaDetalle; mensaje: string }>(
    `/api/cuentas/${mesa}/ofertas`,
    { metodo: "POST", cuerpo: { idOferta } },
  );
}

export function asignarLinea(
  mesa: number,
  datos: {
    idLineaCuenta: number;
    comensal: number;
    cantidad?: number;
  },
): Promise<{ cuenta: CuentaDetalle; mensaje: string }> {
  return pedir<{ cuenta: CuentaDetalle; mensaje: string }>(
    `/api/cuentas/${mesa}/asignaciones`,
    { metodo: "POST", cuerpo: datos },
  );
}
