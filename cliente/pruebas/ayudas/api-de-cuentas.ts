/*
  api-de-cuentas.ts — un servidor de mentira para la pantalla de Cuentas.
  ----------------------------------------------------------------------

  Guarda las cuentas abiertas, las mesas por facturar y los detalles en memoria.
  Al generar una cuenta aplica la misma transición que el servidor: la mesa sale
  de "por facturar" y entra en "abiertas". No simula la base ni los permisos:
  eso lo prueban las pruebas de integración contra PostgreSQL.

  Lo que se comprueba aquí es el cable de la pantalla: qué pide, qué manda y qué
  hace con la respuesta del servidor.
*/

import type {
  CuentaAbierta,
  CuentaDetalle,
  DescuentoAplicado,
  MesaPorFacturar,
  ResumenDeCuentas,
} from "../../src/api/cuentas";
import { respuestaDeError, respuestaDeExito } from "./api-falsa";

export interface PeticionDeCuentas {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

export interface FalloDeCuentas {
  metodo: string;
  /** La dirección termina con este texto. */
  sufijo: string;
  codigo: string;
  mensaje: string;
  estado?: number;
}

export interface EstadoDeCuentas {
  abiertas: CuentaAbierta[];
  pedidas: MesaPorFacturar[];
  porGenerar: MesaPorFacturar[];
  /** El detalle de cada mesa, incluida la que todavía no tiene cuenta. */
  detalles: Record<number, CuentaDetalle>;
}

export interface ApiDeCuentas {
  manejador: (url: string, inicio?: RequestInit) => Response;
  peticiones: PeticionDeCuentas[];
  fallos: FalloDeCuentas[];
  resumen: () => ResumenDeCuentas;
  detalle: (mesa: number) => CuentaDetalle | null;
  /** Marca el pedido de PayPal como aprobado por el cliente. */
  aprobarPago: () => void;
  pedidoPaypal: () => { id: string; estado: string } | null;
}

function copia<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function cuerpoDe(
  inicio: RequestInit | undefined,
): Record<string, unknown> | null {
  if (typeof inicio?.body !== "string") return null;

  try {
    const leido: unknown = JSON.parse(inicio.body);
    return typeof leido === "object" && leido !== null
      ? (leido as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cuentaAbiertaDe(detalle: CuentaDetalle): CuentaAbierta {
  return {
    id: detalle.id,
    numero: detalle.numero,
    mesa: detalle.mesa,
    zona: detalle.zona,
    mesero: detalle.mesero,
    estado: detalle.estado,
    cortesia: detalle.cortesia,
    total: detalle.total,
    servicio: detalle.servicio,
    abiertaEn: detalle.abiertaEn,
    hora: detalle.hora,
  };
}

/** Un estado con una cuenta abierta y dos mesas por facturar. */
export function estadoDeCuentasDePrueba(): EstadoDeCuentas {
  const detalleMesaUno: CuentaDetalle = {
    id: 1,
    numero: "F-0001",
    mesa: 1,
    zona: "Salón",
    mesero: "Ana Pérez",
    estado: "Abierta",
    cortesia: false,
    total: 500,
    servicio: 0,
    abiertaEn: "2026-10-19T16:00:00.000Z",
    hora: "12:00",
    lineas: [
      {
        id: 1,
        producto: "Pollo a la brasa",
        cantidad: 2,
        cantidadAsignada: 0,
        precio: 200,
        importe: 400,
        persona: 1,
      },
      {
        id: 2,
        producto: "Jugo de chinola",
        cantidad: 1,
        cantidadAsignada: 0,
        precio: 100,
        importe: 100,
        persona: 2,
      },
    ],
    descuentos: [],
    asignaciones: [],
    pagos: [],
  };

  const detalleMesaDos: CuentaDetalle = {
    id: 2,
    numero: "F-0002",
    mesa: 2,
    zona: "Terraza",
    mesero: "Luis Gómez",
    estado: "Abierta",
    cortesia: false,
    total: 700,
    servicio: 0,
    abiertaEn: "2026-10-19T16:05:00.000Z",
    hora: "12:05",
    lineas: [
      {
        id: 3,
        producto: "Producto de desarrollo A",
        cantidad: 2,
        cantidadAsignada: 0,
        precio: 350,
        importe: 700,
        persona: 1,
      },
    ],
    descuentos: [],
    asignaciones: [],
    pagos: [],
  };

  return {
    abiertas: [cuentaAbiertaDe(detalleMesaUno)],
    porGenerar: [
      {
        idMesa: 2,
        numero: 2,
        zona: "Terraza",
        personas: 2,
        mesero: "Luis Gómez",
        idPedido: 20,
        hora: "12:05",
        cuentaPedidaEn: null,
        horaPedida: null,
        lineasPendientes: 0,
        lineasFacturables: 1,
      },
      {
        idMesa: 3,
        numero: 3,
        zona: "Barra",
        personas: 1,
        mesero: "Luis Gómez",
        idPedido: 21,
        hora: "12:10",
        cuentaPedidaEn: null,
        horaPedida: null,
        lineasPendientes: 1,
        lineasFacturables: 0,
      },
    ],
    pedidas: [],
    detalles: {
      1: detalleMesaUno,
      2: detalleMesaDos,
    },
  };
}

export function apiDeCuentas(iniciales: EstadoDeCuentas): ApiDeCuentas {
  let abiertas = copia(iniciales.abiertas);
  let porGenerar = copia(iniciales.porGenerar);
  let pedidas = copia(iniciales.pedidas);
  const detalles = copia(iniciales.detalles);

  let pedidoPaypal: {
    id: string;
    estado: string;
    aprobado: boolean;
    mesa: number;
  } | null = null;

  const peticiones: PeticionDeCuentas[] = [];
  const fallos: FalloDeCuentas[] = [];

  const resumen = (): ResumenDeCuentas => ({
    abiertas: copia(abiertas),
    pedidas: copia(pedidas),
    porGenerar: copia(porGenerar),
  });

  const detalle = (mesa: number): CuentaDetalle | null =>
    detalles[mesa] === undefined ? null : copia(detalles[mesa]);

  function falloPara(metodo: string, url: string): FalloDeCuentas | null {
    return (
      fallos.find(
        (fallo) => fallo.metodo === metodo && url.endsWith(fallo.sufijo),
      ) ?? null
    );
  }

  function manejador(url: string, inicio?: RequestInit): Response {
    const metodo = inicio?.method ?? "GET";
    const cuerpo = cuerpoDe(inicio);

    peticiones.push({ url, metodo, cuerpo });

    const fallo = falloPara(metodo, url);
    if (fallo !== null) {
      return respuestaDeError(
        fallo.codigo,
        fallo.mensaje,
        fallo.estado ?? 400,
      );
    }

    /* ------------------------------------------------------------- PayPal */
    if (url.includes("/api/paypal/pedidos")) {
      if (metodo === "POST" && url.endsWith("/api/paypal/pedidos")) {
        const mesa = Number(cuerpo?.mesa ?? 1);
        const cuenta = detalles[mesa];

        if (cuenta === undefined) {
          return respuestaDeError(
            "NO_ENCONTRADO",
            "Esa mesa no tiene una cuenta abierta.",
            404,
          );
        }

        pedidoPaypal = {
          id: "ORDER-PRUEBA-1",
          estado: "CREATED",
          aprobado: false,
          mesa,
        };

        return respuestaDeExito(
          {
            id: pedidoPaypal.id,
            estado: pedidoPaypal.estado,
            referencia: `CUENTA-${cuenta.id}`,
            monto: 8.27,
            moneda: "USD",
            montoEnPesos: cuenta.total,
            tasaCambio: 60,
            enlace: "https://paypal.test/aprobar",
            mensaje: "Pedido de PayPal creado. El cliente tiene que aprobarlo.",
          },
          201,
        );
      }

      if (metodo === "GET") {
        if (pedidoPaypal === null) {
          return respuestaDeError(
            "NO_ENCONTRADO",
            "Ese pedido de PayPal no existe.",
            404,
          );
        }

        return respuestaDeExito({
          id: pedidoPaypal.id,
          estado: pedidoPaypal.aprobado ? "APPROVED" : pedidoPaypal.estado,
          referencia: "CUENTA-1",
          monto: 8.27,
          moneda: "USD",
          montoEnPesos: 500,
          tasaCambio: 60,
          enlace: "https://paypal.test/aprobar",
        });
      }

      if (metodo === "POST" && url.endsWith("/capturar")) {
        if (pedidoPaypal === null) {
          return respuestaDeError(
            "NO_ENCONTRADO",
            "Ese pedido de PayPal no existe.",
            404,
          );
        }

        pedidoPaypal.estado = "COMPLETED";
        abiertas = abiertas.filter(
          (actual) => actual.mesa !== pedidoPaypal?.mesa,
        );

        return respuestaDeExito(
          {
            id: pedidoPaypal.id,
            estado: "COMPLETED",
            referencia: "CUENTA-1",
            monto: 8.27,
            moneda: "USD",
            mensaje: "Pago de PayPal confirmado y registrado en la base.",
          },
          201,
        );
      }
    }

    if (metodo === "GET" && url.endsWith("/api/cuentas")) {
      return respuestaDeExito(resumen());
    }

    if (metodo === "POST" && /\/api\/cuentas\/(\d+)\/(descuentos|cortesias)$/.test(url)) {
      const coincidencia = /\/api\/cuentas\/(\d+)\/(descuentos|cortesias)$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);
      const tipo =
        coincidencia?.[2] === "cortesias" ? "Cortesía" : "Descuento";

      const cuenta = mesa === null ? undefined : detalles[mesa];
      if (mesa === null || cuenta === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa mesa no tiene una cuenta abierta.",
          404,
        );
      }

      const monto = Number(cuerpo?.monto ?? 0);
      const conceptoRaw = cuerpo?.concepto;
      const concepto = (typeof conceptoRaw === "string" ? conceptoRaw : "").trim();
      const descuento: DescuentoAplicado = {
        id: Date.now(),
        concepto,
        monto,
        tipo,
        autorizadoPor: "Ana Pérez",
        hora: "12:30",
      };

      cuenta.descuentos = [...cuenta.descuentos, descuento];
      cuenta.total = Math.max(0, cuenta.total - monto);
      if (tipo === "Cortesía") cuenta.cortesia = true;

      const abierta = abiertas.find((actual) => actual.mesa === mesa);
      if (abierta !== undefined) {
        abierta.total = cuenta.total;
        abierta.cortesia = cuenta.cortesia;
      }

      return respuestaDeExito(
        {
          descuento,
          cuenta: copia(cuenta),
          mensaje:
            tipo === "Descuento"
              ? `Descuento de ${monto.toFixed(2)} aplicado.`
              : `Cortesía de ${monto.toFixed(2)} aplicada.`,
        },
        201,
      );
    }

    if (metodo === "POST" && /\/api\/cuentas\/(\d+)\/asignaciones$/.test(url)) {
      const coincidencia = /\/api\/cuentas\/(\d+)\/asignaciones$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);
      const cuenta = mesa === null ? undefined : detalles[mesa];

      if (mesa === null || cuenta === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa mesa no tiene una cuenta abierta.",
          404,
        );
      }

      const comensal = Number(cuerpo?.comensal ?? 0);
      const linea = cuenta.lineas.find(
        (actual) => actual.id === Number(cuerpo?.idLineaCuenta),
      );

      if (linea === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa línea no pertenece a la cuenta.",
          404,
        );
      }

      const cantidad = Number(cuerpo?.cantidad ?? linea.cantidad);
      const monto = linea.precio * cantidad;
      const asignacion = {
        comensal,
        cantidad,
        total: monto,
        servicio: 0,
        pagado: false,
      };
      linea.cantidadAsignada += cantidad;

      const existente = cuenta.asignaciones.find(
        (actual) => actual.comensal === comensal,
      );
      if (existente === undefined) {
        cuenta.asignaciones = [...cuenta.asignaciones, asignacion];
      } else {
        existente.total += monto;
      }

      return respuestaDeExito(
        {
          cuenta: copia(cuenta),
          mensaje: `Línea asignada al comensal ${comensal}.`,
        },
        201,
      );
    }

    if (metodo === "POST" && /\/api\/cuentas\/(\d+)\/cobrar$/.test(url)) {
      const coincidencia = /\/api\/cuentas\/(\d+)\/cobrar$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);
      const cuenta = mesa === null ? undefined : detalles[mesa];

      if (mesa === null || cuenta === undefined) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa mesa no tiene una cuenta abierta.",
          404,
        );
      }

      abiertas = abiertas.filter((actual) => actual.mesa !== mesa);

      /*
        Como en la base: al cobrar, la cuenta queda pagada y le queda un cobro
        sin comprobante. Así la pantalla puede ofrecerlo.
      */
      cuenta.estado = "Pagada";
      cuenta.pagos = [
        ...cuenta.pagos,
        {
          id: cuenta.pagos.length + 1,
          comensal: null,
          forma: "Efectivo",
          referencia: null,
          total: cuenta.total,
          comprobanteId: null,
          comprobanteNcf: null,
        },
      ];

      return respuestaDeExito(
        {
          pagoId: 1,
          cambio: 0,
          mensaje: "Cuenta cobrada. Cambio: 0.00.",
          cuentaPagada: true,
          comensal: null,
        },
        201,
      );
    }

    if (metodo === "POST" && /\/api\/cuentas\/(\d+)\/comprobantes$/.test(url)) {
      const coincidencia = /\/api\/cuentas\/(\d+)\/comprobantes$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);
      const cuenta = mesa === null ? undefined : detalles[mesa];

      // Una cuenta que sigue abierta no se puede facturar: hay que cobrarla.
      if (cuenta?.estado === "Abierta") {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          "Primero hay que cobrar la cuenta para emitir su comprobante.",
          409,
        );
      }

      return respuestaDeExito(
        {
          id: 1,
          ncf: "E320000000001",
          idEcF: "ECF-PRUEBA-1",
          trackId: "TRACK-PRUEBA-1",
          dgiiUrl: null,
          estado: "Enviado",
          base: 423.73,
          impuesto: 76.27,
          total: 500,
          mensaje: "Comprobante E320000000001 emitido y enviado a la DGII.",
        },
        201,
      );
    }

    if (metodo === "POST") {
      const coincidencia = /\/api\/cuentas\/(\d+)\/generar$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);

      if (mesa === null) {
        return respuestaDeError(
          "NO_ENCONTRADO",
          "Esa ruta no existe.",
          404,
        );
      }

      const yaAbierta = abiertas.find((cuenta) => cuenta.mesa === mesa);
      if (yaAbierta !== undefined) {
        const cuenta = detalles[mesa];
        if (cuenta === undefined) {
          return respuestaDeError(
            "ERROR_INTERNO",
            "La cuenta no se pudo leer.",
            500,
          );
        }

        return respuestaDeExito({
          id: cuenta.id,
          creada: false,
          cuenta: copia(cuenta),
          mensaje: `La mesa ${mesa} ya tenía la cuenta ${cuenta.numero} abierta.`,
        });
      }

      const pendiente = porGenerar.find((actual) => actual.numero === mesa);
      const cuenta = detalles[mesa];

      if (pendiente === undefined || cuenta === undefined) {
        return respuestaDeError(
          "CONFLICTO_DE_ESTADO",
          `La mesa ${mesa} no tiene un pedido abierto para facturar.`,
          409,
        );
      }

      abiertas = [...abiertas, cuentaAbiertaDe(cuenta)];
      porGenerar = porGenerar.filter((actual) => actual.numero !== mesa);
      pedidas = pedidas.filter((actual) => actual.numero !== mesa);

      return respuestaDeExito(
        {
          id: cuenta.id,
          creada: true,
          cuenta: copia(cuenta),
          mensaje: `Cuenta ${cuenta.numero} generada para la mesa ${mesa}.`,
        },
        201,
      );
    }

    if (metodo === "GET") {
      const coincidencia = /\/api\/cuentas\/(\d+)$/.exec(url);
      const mesa = coincidencia === null ? null : Number(coincidencia[1]);

      if (mesa !== null) {
        return respuestaDeExito(detalle(mesa));
      }
    }

    return respuestaDeError("NO_ENCONTRADO", "Esa ruta no existe.", 404);
  }

  return {
    manejador,
    peticiones,
    fallos,
    resumen,
    detalle,
    aprobarPago: () => {
      if (pedidoPaypal !== null) pedidoPaypal.aprobado = true;
    },
    pedidoPaypal: () =>
      pedidoPaypal === null
        ? null
        : { id: pedidoPaypal.id, estado: pedidoPaypal.estado },
  };
}
