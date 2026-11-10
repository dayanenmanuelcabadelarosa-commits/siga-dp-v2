/*
  Cuentas.tsx — generar y revisar la cuenta de una mesa (Fase 6, módulo 1).
  -------------------------------------------------------------------------

  Esta pantalla hace dos cosas y nada más:

    · Generar la cuenta de una mesa cuyo consumo ya se envió a cocina.
    · Mostrar el detalle que copió PostgreSQL, con el total que calcula
      `fn_total_cuenta`.

  El cobro se confirma antes de ofrecer el comprobante fiscal. Las opciones
  secundarias de descuentos y división no deben estorbar el cobro habitual.

  Los conteos de "sin enviar" y "por cobrar" y el total salen del servidor.
  La pantalla no suma importes por su cuenta.
*/

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  aplicarCortesia,
  aplicarDescuento,
  aplicarOfertaACuenta,
  asignarLinea,
  cobrarCuenta,
  emitirComprobante,
  estadoDelComprobante,
  generarCuenta,
  listarComprobantesPendientes,
  listarCuentas,
  verCuenta,
} from "../api/cuentas";
import type { ComprobanteEmitido } from "../api/cuentas";
import { listarOfertasActivas } from "../api/ofertas";
import type { Oferta } from "../api/ofertas";
import {
  capturarPedidoDePaypal,
  consultarPedidoDePaypal,
  crearPedidoDePaypal,
} from "../api/paypal";
import type { PedidoDePaypal } from "../api/paypal";
import type {
  ComprobantePendiente,
  CuentaDetalle,
  FormaDePago,
  MesaPorFacturar,
  ResumenDeCuentas,
} from "../api/cuentas";
import { mensajeDeError } from "../api/errores";
import { Alerta } from "../componentes/Alerta";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Cargando";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina";
import { Insignia } from "../componentes/Insignia";
import { Selector } from "../componentes/Selector";
import { Tabla } from "../componentes/Tabla";
import { useSesion } from "../sesion/useSesion";
import { formatearDinero } from "../utilidades/formato";

const MONTO_VALIDO = /^\d{1,10}(\.\d{1,2})?$/;

/** Muestra un monto con la moneda en la que está. */
function dineroDe(moneda: string, monto: number): string {
  if (moneda === "USD") return `US$ ${monto.toFixed(2)}`;
  return formatearDinero(monto);
}

/** ¿La mesa ya se puede facturar? El servidor lo vuelve a comprobar. */
function listaParaGenerar(mesa: MesaPorFacturar): boolean {
  return mesa.lineasPendientes === 0 && mesa.lineasFacturables > 0;
}

function estadoDeLaMesa(mesa: MesaPorFacturar) {
  if (mesa.lineasPendientes > 0) {
    const texto =
      mesa.lineasPendientes === 1
        ? "1 línea sin enviar"
        : `${mesa.lineasPendientes} líneas sin enviar`;
    return <Insignia texto={texto} color="miel" />;
  }

  if (mesa.lineasFacturables === 0) {
    return <Insignia texto="Sin consumo enviado" color="gris" />;
  }

  return <Insignia texto="Lista para generar" color="verde" />;
}

export function Cuentas() {
  const { puede } = useSesion();

  const [datos, setDatos] = useState<ResumenDeCuentas | null>(null);
  const [detalle, setDetalle] = useState<CuentaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [generandoMesa, setGenerandoMesa] = useState<number | null>(null);
  const [abriendoMesa, setAbriendoMesa] = useState<number | null>(null);
  const [conceptoDescuento, setConceptoDescuento] = useState("");
  const [montoDescuento, setMontoDescuento] = useState("");
  const [conceptoCortesia, setConceptoCortesia] = useState("");
  const [montoCortesia, setMontoCortesia] = useState("");
  const [aplicandoDescuento, setAplicandoDescuento] = useState(false);
  const [aplicandoCortesia, setAplicandoCortesia] = useState(false);
  const [errorDescuento, setErrorDescuento] = useState<string | null>(null);
  const [errorCortesia, setErrorCortesia] = useState<string | null>(null);
  const [lineaAAsignar, setLineaAAsignar] = useState("");
  const [comensalAsignar, setComensalAsignar] = useState("");
  const [cantidadAsignar, setCantidadAsignar] = useState("1");
  const [comensalCobro, setComensalCobro] = useState("");
  const [asignando, setAsignando] = useState(false);
  const [asignandoTodas, setAsignandoTodas] = useState(false);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [tipoComprobante, setTipoComprobante] = useState<"B01" | "B02">("B02");
  const [clienteComprobante, setClienteComprobante] = useState("");
  const [rncComprobante, setRncComprobante] = useState("");
  const [emitiendoComprobante, setEmitiendoComprobante] = useState(false);
  const [errorComprobante, setErrorComprobante] = useState<string | null>(null);
  const [comprobanteEmitido, setComprobanteEmitido] =
    useState<ComprobanteEmitido | null>(null);
  const [consultandoComprobante, setConsultandoComprobante] = useState(false);
  /*
    El flujo es: se cobra, se pregunta si quiere comprobante y, si lo quiere,
    se emite. Al emitirlo sale el visto verde y, a los cinco segundos, la
    pantalla vuelve a la lista de cuentas.
  */
  const [preguntandoComprobante, setPreguntandoComprobante] = useState(false);
  const [comprobanteAprobado, setComprobanteAprobado] = useState<{
    ncf: string;
    mensaje: string;
  } | null>(null);
  const [pagoCompletado, setPagoCompletado] = useState<{
    mesa: number;
    numero: string;
    forma: FormaDePago;
    referencia: string | null;
    pagoId: number;
    comensal: number | null;
  } | null>(null);

  // Las ofertas activas que se pueden aplicar al cobrar.
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [ofertaElegida, setOfertaElegida] = useState("");
  const [aplicandoOferta, setAplicandoOferta] = useState(false);
  const [pedidoPaypal, setPedidoPaypal] = useState<PedidoDePaypal | null>(null);
  const [moviendoPaypal, setMoviendoPaypal] = useState(false);

  /*
    La ventana de PayPal y el reloj que la vigila se guardan en referencias, no
    en estado: así el temporizador no se reinicia en cada render y la ventana no
    se vuelve a abrir sola.
  */
  const ventanaPaypal = useRef<Window | null>(null);
  const temporizadorPaypal = useRef<number | null>(null);
  const idPedidoPaypal = useRef<string | null>(null);
  const capturaPaypalEnCurso = useRef(false);
  const recibidoEditado = useRef(false);
  /* El reloj del visto verde del comprobante emitido. */
  const temporizadorAprobado = useRef<number | null>(null);
  const [formaCobro, setFormaCobro] = useState<FormaDePago>("Efectivo");
  const [recibidoCobro, setRecibidoCobro] = useState("");
  const [propinaCobro, setPropinaCobro] = useState("");
  const [referenciaCobro, setReferenciaCobro] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /*
    Los cobros que ya se hicieron y que todavía no tienen comprobante. Si la
    emisión falla, el comprobante se emite desde aquí, sin volver a cobrar.
  */
  const [pendientes, setPendientes] = useState<ComprobantePendiente[]>([]);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const cargadas = await listarCuentas();
        if (vigente) setDatos(cargadas);
      } catch (fallo) {
        if (vigente) setError(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargando(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, []);

  /*
    Cuando se abre una cuenta, el campo "Recibido" se deja con el total: es lo
    que el cliente da cuando no hay que dar cambio. Si el cajero escribe otra
    cosa, se respeta.
  */
  useEffect(() => {
    if (detalle === null) return;

    setRecibidoCobro(detalle.total.toFixed(2));
    setComensalCobro("");
    recibidoEditado.current = false;
    setPropinaCobro("");
    setReferenciaCobro("");
  }, [detalle]);

  /* Al salir de la pantalla se cierra la ventana de PayPal y se para el reloj. */
  useEffect(() => {
    return () => {
      if (temporizadorPaypal.current !== null) {
        window.clearInterval(temporizadorPaypal.current);
      }
      if (temporizadorAprobado.current !== null) {
        window.clearTimeout(temporizadorAprobado.current);
      }
      ventanaPaypal.current?.close();
    };
  }, []);

  /* Los cobros que están esperando su comprobante fiscal. */
  useEffect(() => {
    if (!puede("EMITIR_COMPROBANTE")) return;

    let vigente = true;

    async function cargar() {
      try {
        const lista = await listarComprobantesPendientes();
        if (vigente) setPendientes(lista);
      } catch {
        // Si no se pueden leer, la pantalla sigue sirviendo para lo demás.
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, []);

  /*
    La cola del cajero se refresca sola: cuando un mesero avisa que quiere la
    cuenta, tiene que aparecer en unos segundos sin tocar Refrescar. Se hace en
    silencio: si falla, no se estorba al cajero mientras trabaja.
  */
  useEffect(() => {
    let vigente = true;

    const intervalo = window.setInterval(() => {
      void (async () => {
        try {
          const cargadas = await listarCuentas();
          if (vigente) setDatos(cargadas);
        } catch {
          // Si el refresco falla, la pantalla sigue mostrando lo anterior.
        }
      })();
    }, 15000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, []);

  /* Cuando hay una cuenta abierta, se cargan las ofertas activas. */
  useEffect(() => {
    if (detalle === null || !puede("REGISTRAR_PAGO")) return;

    let vigente = true;

    async function cargar() {
      try {
        const lista = await listarOfertasActivas();
        if (vigente) setOfertas(lista);
      } catch {
        // Si no se pueden ver las ofertas, el cobro sigue funcionando.
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [detalle, puede]);

  if (cargando) {
    return <Cargando texto="Cargando las cuentas…" />;
  }

  const abiertas = datos?.abiertas ?? [];

  /*
    Lo que hay que cobrar es el total de la cuenta más la propina. Con efectivo,
    el cajero escribe cuánto dio el cliente y de ahí sale el cambio; con tarjeta
    o crédito, el sistema cobra ese total y no hace falta escribir nada.
  */
  const propinaNumero =
    formaCobro === "PayPal" ? 0 : Number(propinaCobro.trim()) || 0;
  const asignacionElegida = detalle?.asignaciones.find(
    (asignacion) => asignacion.comensal === Number(comensalCobro),
  );
  const totalBaseCobro =
    (detalle?.asignaciones.length ?? 0) > 0
      ? (asignacionElegida?.total ?? 0)
      : (detalle?.total ?? 0);
  /*
    El servicio del local (la propina legal del 10 % de los restaurantes) se
    cobra con la cuenta. Es 0 si el dueño no lo activó en los parámetros.
  */
  const servicioNumero =
    (detalle?.asignaciones.length ?? 0) > 0
      ? (asignacionElegida?.servicio ?? 0)
      : (detalle?.servicio ?? 0);
  const totalACobrar = totalBaseCobro + servicioNumero + propinaNumero;
  const tieneDivision = (detalle?.asignaciones.length ?? 0) > 0;
  const divisionCompleta =
    detalle?.lineas.every(
      (linea) => linea.cantidadAsignada === linea.cantidad,
    ) ?? false;
  const cambioCalculado =
    formaCobro === "Efectivo" &&
    MONTO_VALIDO.test(recibidoCobro.trim()) &&
    Number(recibidoCobro) >= totalACobrar
      ? Number(recibidoCobro.trim()) - totalACobrar
      : null;
  const porGenerar = datos?.porGenerar ?? [];
  const pedidas = datos?.pedidas ?? [];

  async function refrescar() {
    setRefrescando(true);
    setError(null);
    setAviso(null);

    try {
      const cargadas = await listarCuentas();
      setDatos(cargadas);

      if (detalle !== null) {
        const actualizada = await verCuenta(detalle.mesa);
        setDetalle(actualizada);
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setRefrescando(false);
    }
  }

  async function abrirDetalle(mesa: number) {
    setError(null);
    setAviso(null);
    setAbriendoMesa(mesa);

    try {
      const cuenta = await verCuenta(mesa);

      if (cuenta === null) {
        setDetalle(null);
        setError(`La mesa ${mesa} ya no tiene una cuenta abierta.`);
      } else {
        setDetalle(cuenta);
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setAbriendoMesa(null);
    }
  }

  async function generar(mesa: number) {
    setError(null);
    setAviso(null);
    setGenerandoMesa(mesa);

    try {
      const resultado = await generarCuenta(mesa);
      setDetalle(resultado.cuenta);
      setAviso(resultado.mensaje);

      /*
        La cuenta ya quedó creada. Si la recarga de la lista falla, no se puede
        presentar eso como si no se hubiera guardado: se avisa aparte y se deja
        el detalle que devolvió el servidor.
      */
      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "La cuenta se generó, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGenerandoMesa(null);
    }
  }

  async function aplicarDescuentoForm(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (detalle === null) return;

    setErrorDescuento(null);
    setError(null);
    setAviso(null);

    const concepto = conceptoDescuento.trim();
    const monto = montoDescuento.trim();

    if (concepto === "") {
      setErrorDescuento("Escribe el concepto del descuento.");
      return;
    }

    if (!MONTO_VALIDO.test(monto)) {
      setErrorDescuento("Escribe un monto mayor que cero, con hasta dos decimales.");
      return;
    }

    setAplicandoDescuento(true);

    try {
      const resultado = await aplicarDescuento(detalle.mesa, { concepto, monto });
      setDetalle(resultado.cuenta);
      setAviso(resultado.mensaje);
      setConceptoDescuento("");
      setMontoDescuento("");

      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "El descuento se aplicó, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorDescuento(mensajeDeError(fallo));
    } finally {
      setAplicandoDescuento(false);
    }
  }

  async function aplicarCortesiaForm(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (detalle === null) return;

    setErrorCortesia(null);
    setError(null);
    setAviso(null);

    const concepto = conceptoCortesia.trim();
    const monto = montoCortesia.trim();

    if (concepto === "") {
      setErrorCortesia("Escribe el concepto de la cortesía.");
      return;
    }

    if (!MONTO_VALIDO.test(monto)) {
      setErrorCortesia("Escribe un monto mayor que cero, con hasta dos decimales.");
      return;
    }

    setAplicandoCortesia(true);

    try {
      const resultado = await aplicarCortesia(detalle.mesa, { concepto, monto });
      setDetalle(resultado.cuenta);
      setAviso(resultado.mensaje);
      setConceptoCortesia("");
      setMontoCortesia("");

      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "La cortesía se aplicó, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorCortesia(mensajeDeError(fallo));
    } finally {
      setAplicandoCortesia(false);
    }
  }

  async function asignarLineaForm(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (detalle === null) return;

    setErrorAsignacion(null);
    setError(null);
    setAviso(null);

    const idLineaCuenta = Number(lineaAAsignar);
    const comensal = Number(comensalAsignar);
    const cantidad = Number(cantidadAsignar);

    if (!Number.isInteger(idLineaCuenta) || idLineaCuenta <= 0) {
      setErrorAsignacion("Elige una línea de la cuenta.");
      return;
    }

    if (!Number.isInteger(comensal) || comensal <= 0) {
      setErrorAsignacion("El comensal debe ser un número mayor que cero.");
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setErrorAsignacion("La cantidad debe ser un entero mayor que cero.");
      return;
    }

    setAsignando(true);

    try {
      const resultado = await asignarLinea(detalle.mesa, {
        idLineaCuenta,
        comensal,
        cantidad,
      });
      setDetalle(resultado.cuenta);
      setAviso(resultado.mensaje);
      setLineaAAsignar("");
      setComensalAsignar("");
      setCantidadAsignar("1");

      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "La línea se asignó, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorAsignacion(mensajeDeError(fallo));
    } finally {
      setAsignando(false);
    }
  }

  async function asignarTodasLasLineas() {
    if (detalle === null) return;

    setErrorAsignacion(null);
    setError(null);
    setAviso(null);
    setAsignandoTodas(true);

    try {
      let cuentaActual = detalle;
      for (const linea of detalle.lineas.filter(
        (elemento) => elemento.cantidad > elemento.cantidadAsignada,
      )) {
        const comensal = linea.persona ?? 1;
        const resultado = await asignarLinea(detalle.mesa, {
          idLineaCuenta: linea.id,
          comensal,
          cantidad: linea.cantidad - linea.cantidadAsignada,
        });
        cuentaActual = resultado.cuenta;
      }
      setDetalle(cuentaActual);
      setAviso("Todas las líneas quedaron asignadas a sus comensales.");
      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "Las líneas se asignaron, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorAsignacion(mensajeDeError(fallo));
    } finally {
      setAsignandoTodas(false);
    }
  }

  async function aplicarOferta() {
    if (detalle === null || ofertaElegida === "") return;

    setAplicandoOferta(true);
    setErrorCobro(null);
    setAviso(null);

    try {
      const resultado = await aplicarOfertaACuenta(
        detalle.mesa,
        Number(ofertaElegida),
      );
      setDetalle(resultado.cuenta);
      setAviso(resultado.mensaje);
      setOfertaElegida("");
      setDatos(await listarCuentas());
    } catch (fallo) {
      setErrorCobro(mensajeDeError(fallo));
    } finally {
      setAplicandoOferta(false);
    }
  }

  async function cobrarForm(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (detalle === null) return;

    setErrorCobro(null);
    setError(null);
    setAviso(null);

    const esDividida = detalle.asignaciones.length > 0;
    const comensalSeleccionado = esDividida ? Number(comensalCobro) : null;

    if (esDividida && (!asignacionElegida || asignacionElegida.pagado)) {
      setErrorCobro("Selecciona un comensal que todavía no haya pagado.");
      return;
    }

    if (esDividida && formaCobro === "PayPal") {
      setErrorCobro(
        "PayPal todavía no permite cobrar una parte de una cuenta dividida. Usa efectivo, tarjeta o crédito.",
      );
      return;
    }

    if (
      propinaCobro.trim() !== "" &&
      !MONTO_VALIDO.test(propinaCobro.trim())
    ) {
      setErrorCobro("Escribe una propina válida, con hasta dos decimales.");
      return;
    }

    if (formaCobro === "Efectivo") {
      if (!MONTO_VALIDO.test(recibidoCobro.trim())) {
        setErrorCobro("Escribe cuánto dinero recibiste, con hasta dos decimales.");
        return;
      }

      if (Number(recibidoCobro) < totalACobrar) {
        setErrorCobro(
          `El efectivo recibido debe cubrir ${formatearDinero(totalACobrar)}.`,
        );
        return;
      }
    }

    if (formaCobro === "Tarjeta" && referenciaCobro.trim() === "") {
      setErrorCobro("Escribe el número de aprobación de la tarjeta.");
      return;
    }

    setCobrando(true);

    try {
      /*
        Con PayPal el cobro tiene dos pasos: se crea el pedido, el cliente lo
        aprueba en la página de PayPal y después el local lo captura. Por eso
        aquí no se llama a `/cobrar`: el pago solo se registra cuando PayPal
        confirma.
      */
      if (formaCobro === "PayPal") {
        const pedido = await crearPedidoDePaypal(detalle.mesa);
        setPedidoPaypal(pedido);
        idPedidoPaypal.current = pedido.id;
        abrirVentanaDePaypal(pedido);
        setAviso(
          pedido.mensaje ??
            "Se abrió la ventana de PayPal. Cuando el cliente apruebe, la cuenta se marca como pagada sola.",
        );
        return;
      }

      const resultado = await cobrarCuenta(detalle.mesa, {
        forma: formaCobro,
        ...(comensalSeleccionado !== null
          ? { comensal: comensalSeleccionado }
          : {}),
        ...(formaCobro === "Efectivo"
          ? { recibido: recibidoCobro.trim() || "0" }
          : {}),
        ...(propinaCobro.trim() !== "" ? { propina: propinaCobro.trim() } : {}),
        ...(referenciaCobro.trim() !== ""
          ? { referencia: referenciaCobro.trim() }
          : {}),
      });
      const pago = {
        mesa: detalle.mesa,
        numero: detalle.numero,
        forma: formaCobro,
        pagoId: resultado.pagoId,
        comensal: comensalSeleccionado,
        referencia:
          formaCobro === "Tarjeta" && referenciaCobro.trim() !== ""
            ? referenciaCobro.trim()
            : null,
      };
      setPagoCompletado(puede("EMITIR_COMPROBANTE") ? pago : null);
      setErrorComprobante(null);
      setComprobanteEmitido(null);
      setAviso(resultado.mensaje);
      if (resultado.cuentaPagada) {
        setDetalle(null);
      } else {
        try {
          setDetalle(await verCuenta(detalle.mesa));
        } catch {
          setError(
            "El pago parcial se registró, pero no se pudo actualizar el detalle. Usa Refrescar.",
          );
        }
      }
      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "La cuenta se cobró, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorCobro(mensajeDeError(fallo));
    } finally {
      setCobrando(false);
    }
  }

  /** Deja de vigilar el pedido de PayPal. */
  function detenerVigilaDePaypal() {
    if (temporizadorPaypal.current !== null) {
      window.clearInterval(temporizadorPaypal.current);
      temporizadorPaypal.current = null;
    }
  }

  /** Cierra la ventana de PayPal, si sigue abierta. */
  function cerrarVentanaDePaypal() {
    if (ventanaPaypal.current !== null) {
      ventanaPaypal.current.close();
      ventanaPaypal.current = null;
    }
  }

  /*
    Abre la ventana de PayPal encima de la pantalla y empieza a mirar el
    pedido. Cuando el cliente aprueba, el sistema cobra solo: no hace falta
    que nadie pulse un botón.
  */
  function abrirVentanaDePaypal(pedido: PedidoDePaypal) {
    if (pedido.enlace !== null) {
      ventanaPaypal.current = window.open(
        pedido.enlace,
        "paypal",
        "width=1100,height=780,noopener,noreferrer",
      );
    }

    detenerVigilaDePaypal();
    temporizadorPaypal.current = window.setInterval(() => {
      void vigilarPagoDePaypal();
    }, 3000);
  }

  /** Mira cómo va el pedido: si ya está aprobado, lo captura y cobra. */
  async function vigilarPagoDePaypal() {
    const id = idPedidoPaypal.current;
    if (id === null) return;

    try {
      const estado = await consultarPedidoDePaypal(id);
      setPedidoPaypal(estado);

      if (estado.estado === "APPROVED" || estado.estado === "COMPLETED") {
        await capturarPaypal(id);
      }
    } catch {
      // Si la consulta falla, se sigue mirando en el siguiente intento.
    }
  }

  async function capturarPaypal(id = idPedidoPaypal.current) {
    if (id === null || capturaPaypalEnCurso.current) return;

    capturaPaypalEnCurso.current = true;
    setMoviendoPaypal(true);
    setErrorCobro(null);
    setAviso(null);

    try {
      const resultado = await capturarPedidoDePaypal(id);
      setPedidoPaypal(resultado);
      setAviso(resultado.mensaje ?? "Pago de PayPal confirmado.");
      if (puede("EMITIR_COMPROBANTE")) {
        const cuenta = detalle;
        // El comprobante va atado a un cobro: si PayPal todavía no dejó el
        // pago escrito en la base, no hay `pagoId` y no se ofrece la factura.
        if (cuenta !== null && resultado.pagoId !== undefined) {
          setPagoCompletado({
            mesa: cuenta.mesa,
            numero: cuenta.numero,
            forma: "PayPal",
            referencia: resultado.referencia,
            pagoId: resultado.pagoId,
            comensal: null,
          });
          setErrorComprobante(null);
          setComprobanteEmitido(null);
        }
      }
      setDetalle(null);
      detenerVigilaDePaypal();
      cerrarVentanaDePaypal();
      idPedidoPaypal.current = null;
      setPedidoPaypal(null);

      try {
        setDatos(await listarCuentas());
      } catch {
        setError(
          "El pago se confirmó, pero no se pudo actualizar la lista. Usa Refrescar.",
        );
      }
    } catch (fallo) {
      setErrorCobro(mensajeDeError(fallo));
    } finally {
      capturaPaypalEnCurso.current = false;
      setMoviendoPaypal(false);
    }
  }

  async function consultarEstadoDelComprobante() {
    if (comprobanteEmitido === null) return;

    setConsultandoComprobante(true);
    setErrorComprobante(null);

    try {
      const estado = await estadoDelComprobante(comprobanteEmitido.id);
      setComprobanteEmitido({ ...comprobanteEmitido, estado: estado.estadoEcF });
      setAviso(`El comprobante está en estado ${estado.estadoEcF}.`);
    } catch (fallo) {
      setErrorComprobante(mensajeDeError(fallo));
    } finally {
      setConsultandoComprobante(false);
    }
  }

  async function emitirComprobanteForm(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pagoCompletado === null) return;

    setErrorComprobante(null);
    setError(null);
    setAviso(null);

    if (clienteComprobante.trim() === "") {
      setErrorComprobante("Escribe el nombre del cliente.");
      return;
    }

    const rncNormalizado = rncComprobante.replace(/\D/g, "");
    if (rncNormalizado !== "" && rncNormalizado.length !== 9 && rncNormalizado.length !== 11) {
      setErrorComprobante("El RNC del cliente debe tener 9 u 11 dígitos.");
      return;
    }

    setEmitiendoComprobante(true);

    try {
      const resultado = await emitirComprobante(pagoCompletado.mesa, {
        tipo: tipoComprobante,
        cliente: clienteComprobante.trim(),
        pagoId: pagoCompletado.pagoId,
        ...(rncComprobante.replace(/\\D/g, "") !== ""
          ? { rncCliente: rncComprobante.replace(/\\D/g, "") }
          : {}),
        forma: pagoCompletado.forma,
        ...(pagoCompletado.referencia !== null
          ? { referencia: pagoCompletado.referencia }
          : {}),
      });
      setComprobanteEmitido(resultado);
      setAviso(resultado.mensaje);
      setClienteComprobante("");
      setRncComprobante("");

      /*
        El visto verde: sale arriba de todo y, a los cinco segundos, la
        pantalla vuelve a la lista de cuentas. El comprobante ya no aparece
        entre los que están esperando.
      */
      setComprobanteAprobado({ ncf: resultado.ncf, mensaje: resultado.mensaje });

      if (temporizadorAprobado.current !== null) {
        window.clearTimeout(temporizadorAprobado.current);
      }

      temporizadorAprobado.current = window.setTimeout(() => {
        temporizadorAprobado.current = null;
        setComprobanteAprobado(null);
        setComprobanteEmitido(null);
        setPagoCompletado(null);
        setPreguntandoComprobante(false);
        setDetalle(null);
      }, 5000);

      // El cobro ya tiene comprobante: sale de la lista de los que lo esperan.
      try {
        setPendientes(await listarComprobantesPendientes());
      } catch {
        // Si la lista no se puede leer, no pasa nada: el comprobante ya salió.
      }
    } catch (fallo) {
      setErrorComprobante(mensajeDeError(fallo));
    } finally {
      setEmitiendoComprobante(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Cuentas"
        subtitulo="Genera y revisa la cuenta de una mesa. El total lo calcula PostgreSQL."
        acciones={
          <Boton
            variante="secundario"
            onClick={() => void refrescar()}
            cargando={refrescando}
            textoDeCarga="Refrescando…"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refrescar
          </Boton>
        }
      />

      <div className="space-y-5">
        <div className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-madera">
            Pasos
          </p>
          <ol className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-carbon">
            <li>1. Elige la mesa</li>
            <li>2. Genera la cuenta</li>
            <li>3. Cobra y emite el comprobante</li>
          </ol>
        </div>

        {aviso !== null && <Alerta tipo="exito">{aviso}</Alerta>}
        {error !== null && (
          <Alerta tipo="error" titulo="No se pudo actualizar">
            {error}
          </Alerta>
        )}

        {/*
          El visto verde del comprobante emitido. Sale sobre la pantalla y se
          va solo a los cinco segundos, cuando la pantalla vuelve a la lista
          de cuentas.
        */}
        {comprobanteAprobado !== null && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-hoja px-4 py-3 text-white shadow-xl"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Check aria-hidden="true" className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Comprobante aprobado
              </span>
              <span className="block text-xs text-white/85">
                {comprobanteAprobado.ncf} · Enviado a la DGII
              </span>
            </span>
          </div>
        )}

        {pagoCompletado !== null && puede("EMITIR_COMPROBANTE") && (
          <section
            aria-labelledby="comprobante-despues-del-cobro"
            className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
          >
            <h2
              id="comprobante-despues-del-cobro"
              className="text-base font-semibold text-carbon"
            >
              Cobro confirmado · Cuenta {pagoCompletado.numero}
              {pagoCompletado.comensal !== null &&
                ` · Comensal ${pagoCompletado.comensal}`}
            </h2>
            {comprobanteEmitido === null ? (
              <>
                {!preguntandoComprobante ? (
                  <div className="mt-3 rounded-xl border border-madera/10 bg-crema/40 p-3">
                    <p className="text-sm font-semibold text-carbon">
                      ¿Quiere comprobante fiscal?
                    </p>
                    <p className="mt-1 text-xs text-madera">
                      La cuenta ya quedó cobrada. Si el cliente lo necesita,
                      emítelo ahora; si no, puedes seguir.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Boton onClick={() => setPreguntandoComprobante(true)}>
                        Sí, emitir comprobante
                      </Boton>
                      <Boton
                        variante="secundario"
                        onClick={() => {
                          setPagoCompletado(null);
                          setPreguntandoComprobante(false);
                        }}
                      >
                        No, gracias
                      </Boton>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(evento) => void emitirComprobanteForm(evento)}
                    className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3"
                  >
                  {errorComprobante !== null && (
                    <Alerta tipo="error">{errorComprobante}</Alerta>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Selector
                      etiqueta="Tipo"
                      value={tipoComprobante}
                      onChange={(evento) =>
                        setTipoComprobante(evento.target.value as "B01" | "B02")
                      }
                      opciones={[
                        { valor: "B01", texto: "B01 (factura)" },
                        { valor: "B02", texto: "B02 (consumidor final)" },
                      ]}
                    />
                    <Campo
                      etiqueta="Cliente"
                      value={clienteComprobante}
                      onChange={(evento) =>
                        setClienteComprobante(evento.target.value)
                      }
                      required
                    />
                    <Campo
                      etiqueta="RNC del cliente"
                      value={rncComprobante}
                      onChange={(evento) =>
                        setRncComprobante(evento.target.value)
                      }
                    />
                    <p className="self-center text-sm text-madera">
                      Forma de pago:{" "}
                      <strong className="text-carbon">
                        {pagoCompletado.forma}
                      </strong>
                    </p>
                    {pagoCompletado.referencia !== null && (
                      <p className="self-center text-sm text-madera">
                        Referencia:{" "}
                        <strong className="text-carbon">
                          {pagoCompletado.referencia}
                        </strong>
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Boton
                      tipo="submit"
                      cargando={emitiendoComprobante}
                      textoDeCarga="Emitiendo…"
                    >
                      Emitir comprobante
                    </Boton>
                    <Boton
                      variante="secundario"
                      disabled={emitiendoComprobante}
                      onClick={() => {
                        setPreguntandoComprobante(false);
                        setErrorComprobante(null);
                      }}
                    >
                      Volver
                    </Boton>
                  </div>
                  </form>
                )}
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-madera/10 bg-crema/40 p-3">
                <p className="text-sm text-madera">
                  Comprobante fiscal:{" "}
                  <strong className="text-carbon">{comprobanteEmitido.ncf}</strong>
                  {" · Estado: "}
                  <strong className="text-carbon">
                    {comprobanteEmitido.estado}
                  </strong>
                </p>
                <p className="mt-1 text-xs text-madera/70">
                  Gravado {formatearDinero(comprobanteEmitido.base)} · ITBIS{" "}
                  {formatearDinero(comprobanteEmitido.impuesto)} · Total{" "}
                  {formatearDinero(comprobanteEmitido.total)}
                </p>
                {comprobanteEmitido.dgiiUrl !== null && (
                  <p className="mt-2 text-sm text-madera">
                    <a
                      href={comprobanteEmitido.dgiiUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-brasa underline"
                    >
                      Abrir comprobante en la DGII
                    </a>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Boton
                    variante="secundario"
                    cargando={consultandoComprobante}
                    textoDeCarga="Consultando…"
                    onClick={() => void consultarEstadoDelComprobante()}
                  >
                    Consultar el estado
                  </Boton>
                  <Boton
                    variante="texto"
                    onClick={() => {
                      setPagoCompletado(null);
                      setComprobanteEmitido(null);
                    }}
                  >
                    Continuar
                  </Boton>
                </div>
              </div>
            )}
          </section>
        )}

        {datos === null ? (
          <Alerta tipo="info">
            No se pudieron cargar las cuentas. Usa Refrescar para intentarlo
            otra vez.
          </Alerta>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Mesas que pidieron la cuenta
              </h2>
              <p className="mb-3 text-xs text-madera">
                El mesero avisó que estas mesas quieren la cuenta. Genera la
                cuenta aquí cuando el consumo ya esté en cocina.
              </p>
              <Tabla
                titulo="Mesas que pidieron la cuenta"
                filas={pedidas}
                claveDeFila={(mesa) => mesa.idMesa}
                vacio="Ninguna mesa ha pedido la cuenta todavía."
                columnas={[
                  { clave: "mesa", encabezado: "Mesa", render: (mesa) => mesa.numero },
                  { clave: "zona", encabezado: "Zona", render: (mesa) => mesa.zona },
                  {
                    clave: "mesero",
                    encabezado: "Mesero",
                    render: (mesa) => mesa.mesero,
                  },
                  {
                    clave: "estado",
                    encabezado: "Consumo",
                    render: (mesa) => estadoDeLaMesa(mesa),
                  },
                  {
                    clave: "hora",
                    encabezado: "Pedida",
                    render: (mesa) => mesa.horaPedida ?? mesa.hora,
                  },
                  {
                    clave: "acciones",
                    encabezado: "Acciones",
                    alinear: "derecha",
                    render: (mesa) => (
                      <Boton
                        variante="secundario"
                        disabled={generandoMesa !== null || !listaParaGenerar(mesa)}
                        cargando={generandoMesa === mesa.numero}
                        textoDeCarga="Generando..."
                        aria-label={`Generar la cuenta de la mesa ${mesa.numero}`}
                        title={
                          mesa.lineasPendientes > 0
                            ? "Envía primero todo el consumo a cocina."
                            : !listaParaGenerar(mesa)
                              ? "La mesa no tiene consumo enviado."
                              : undefined
                        }
                        onClick={() => void generar(mesa.numero)}
                      >
                        Generar cuenta
                      </Boton>
                    ),
                  },
                ]}
              />
            </section>

          <section>
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Mesas por facturar
              </h2>
              <Tabla
                titulo="Mesas por facturar"
                filas={porGenerar}
                claveDeFila={(mesa) => mesa.idMesa}
                vacio="No hay mesas con pedido pendientes de cuenta."
                columnas={[
                  {
                    clave: "mesa",
                    encabezado: "Mesa",
                    render: (mesa) => mesa.numero,
                  },
                  {
                    clave: "zona",
                    encabezado: "Zona",
                    render: (mesa) => mesa.zona,
                  },
                  {
                    clave: "mesero",
                    encabezado: "Mesero",
                    render: (mesa) => mesa.mesero,
                  },
                  {
                    clave: "estado",
                    encabezado: "Consumo",
                    render: (mesa) => estadoDeLaMesa(mesa),
                  },
                  {
                    clave: "hora",
                    encabezado: "Abierto",
                    render: (mesa) => mesa.hora,
                  },
                  {
                    clave: "acciones",
                    encabezado: "Acciones",
                    alinear: "derecha",
                    render: (mesa) => (
                      <Boton
                        variante="secundario"
                        disabled={generandoMesa !== null || !listaParaGenerar(mesa)}
                        cargando={generandoMesa === mesa.numero}
                        textoDeCarga="Generando…"
                        aria-label={`Generar la cuenta de la mesa ${mesa.numero}`}
                        title={
                          mesa.lineasPendientes > 0
                            ? "Envía primero todo el consumo a cocina."
                            : !listaParaGenerar(mesa)
                              ? "La mesa no tiene consumo enviado."
                              : undefined
                        }
                        onClick={() => void generar(mesa.numero)}
                      >
                        Generar cuenta
                      </Boton>
                    ),
                  },
                ]}
              />
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-carbon">
                Cuentas abiertas
              </h2>
              <Tabla
                titulo="Cuentas abiertas"
                filas={abiertas}
                claveDeFila={(cuenta) => cuenta.id}
                vacio="Todavía no hay cuentas abiertas."
                columnas={[
                  {
                    clave: "mesa",
                    encabezado: "Mesa",
                    render: (cuenta) => cuenta.mesa,
                  },
                  {
                    clave: "numero",
                    encabezado: "Cuenta",
                    render: (cuenta) => cuenta.numero,
                  },
                  {
                    clave: "zona",
                    encabezado: "Zona",
                    render: (cuenta) => cuenta.zona,
                  },
                  {
                    clave: "mesero",
                    encabezado: "Mesero",
                    render: (cuenta) => cuenta.mesero,
                  },
                  {
                    clave: "hora",
                    encabezado: "Abierta",
                    render: (cuenta) => cuenta.hora,
                  },
                  {
                    clave: "total",
                    encabezado: "Total",
                    alinear: "derecha",
                    render: (cuenta) => formatearDinero(cuenta.total),
                  },
                  {
                    clave: "acciones",
                    encabezado: "Acciones",
                    alinear: "derecha",
                    render: (cuenta) => (
                      <Boton
                        variante="secundario"
                        cargando={abriendoMesa === cuenta.mesa}
                        textoDeCarga="Abriendo…"
                        aria-label={`Ver el detalle de la cuenta de la mesa ${cuenta.mesa}`}
                        onClick={() => void abrirDetalle(cuenta.mesa)}
                      >
                        Ver detalle
                      </Boton>
                    ),
                  },
                ]}
              />
            </section>

            {detalle !== null && (
              <section
                aria-labelledby="detalle-de-la-cuenta"
                className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2
                      id="detalle-de-la-cuenta"
                      className="text-base font-semibold text-carbon"
                    >
                      Cuenta {detalle.numero} · Mesa {detalle.mesa}
                    </h2>
                    <p className="mt-1 text-sm text-madera">
                      {detalle.zona} · {detalle.mesero} · Abierta a las{" "}
                      {detalle.hora}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Insignia
                      texto={detalle.estado}
                      color={detalle.estado === "Pagada" ? "verde" : "miel"}
                    />
                    <Boton
                      variante="texto"
                      aria-label="Cerrar el detalle de la cuenta"
                      onClick={() => setDetalle(null)}
                    >
                      Cerrar detalle
                    </Boton>
                  </div>
                </div>

                <Tabla
                  titulo={`Líneas de la cuenta ${detalle.numero}`}
                  filas={detalle.lineas}
                  claveDeFila={(linea) => linea.id}
                  vacio="Esta cuenta no tiene líneas."
                  columnas={[
                    {
                      clave: "producto",
                      encabezado: "Producto",
                      render: (linea) => linea.producto,
                    },
                    {
                      clave: "persona",
                      encabezado: "Persona",
                      render: (linea) => linea.persona ?? "—",
                    },
                    {
                      clave: "cantidad",
                      encabezado: "Cantidad",
                      alinear: "derecha",
                      render: (linea) => linea.cantidad,
                    },
                    {
                      clave: "precio",
                      encabezado: "Precio",
                      alinear: "derecha",
                      render: (linea) => formatearDinero(linea.precio),
                    },
                    {
                      clave: "importe",
                      encabezado: "Importe",
                      alinear: "derecha",
                      render: (linea) => formatearDinero(linea.importe),
                    },
                  ]}
                />

                <div className="mt-3 flex items-center justify-end gap-3 border-t border-madera/10 pt-3">
                  <span className="text-sm font-medium text-madera">Total</span>
                  <span className="text-lg font-semibold text-carbon">
                    {formatearDinero(detalle.total)}
                  </span>
                </div>
                <p className="mt-1 text-right text-xs text-madera/70">
                  Total calculado por PostgreSQL con fn_total_cuenta; la pantalla
                  no lo recalcula.
                </p>

                {detalle.pagos.length > 0 && (
                  <div className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3">
                    <h3 className="text-sm font-semibold text-carbon">
                      Cobros de la cuenta
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {detalle.pagos.map((pago) => (
                        <li
                          key={pago.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-madera">
                            {pago.comensal !== null
                              ? `Comensal ${pago.comensal} · `
                              : ""}
                            {pago.forma} · {formatearDinero(pago.total)}
                          </span>

                          {pago.comprobanteNcf !== null ? (
                            <span className="text-madera/70">
                              Comprobante{" "}
                              <strong className="text-carbon">
                                {pago.comprobanteNcf}
                              </strong>
                            </span>
                          ) : puede("EMITIR_COMPROBANTE") ? (
                            <Boton
                              variante="secundario"
                              aria-label={`Emitir el comprobante del cobro ${pago.id} de la cuenta ${detalle.numero}`}
                              onClick={() => {
                                setPagoCompletado({
                                  mesa: detalle.mesa,
                                  numero: detalle.numero,
                                  forma: pago.forma,
                                  referencia: pago.referencia,
                                  pagoId: pago.id,
                                  comensal: pago.comensal,
                                });
                                setPreguntandoComprobante(true);
                                setErrorComprobante(null);
                                setComprobanteEmitido(null);
                              }}
                            >
                              Emitir comprobante
                            </Boton>
                          ) : (
                            <span className="text-madera/70">
                              Todavía sin comprobante
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <details className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-carbon">
                    Descuentos y cortesías (opcional)
                  </summary>

                {detalle.descuentos.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-semibold text-carbon">
                      Descuentos y cortesías
                    </h3>
                    <Tabla
                      titulo={`Descuentos de la cuenta ${detalle.numero}`}
                      filas={detalle.descuentos}
                      claveDeFila={(descuento) => descuento.id}
                      vacio="Sin descuentos ni cortesías."
                      columnas={[
                        {
                          clave: "tipo",
                          encabezado: "Tipo",
                          render: (descuento) => descuento.tipo,
                        },
                        {
                          clave: "concepto",
                          encabezado: "Concepto",
                          render: (descuento) => descuento.concepto,
                        },
                        {
                          clave: "monto",
                          encabezado: "Monto",
                          alinear: "derecha",
                          render: (descuento) =>
                            formatearDinero(descuento.monto),
                        },
                        {
                          clave: "autorizado",
                          encabezado: "Autorizado por",
                          render: (descuento) => descuento.autorizadoPor,
                        },
                        {
                          clave: "hora",
                          encabezado: "Hora",
                          render: (descuento) => descuento.hora,
                        },
                      ]}
                    />
                  </div>
                )}

                {puede("APLICAR_DESCUENTO") && (
                  <form
                    onSubmit={(evento) => void aplicarDescuentoForm(evento)}
                    className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-carbon">
                      Aplicar descuento
                    </h3>
                    <p className="mb-3 text-xs text-madera/70">
                      Máximo el 10 % del total de la cuenta.
                    </p>
                    {errorDescuento !== null && (
                      <Alerta tipo="error">{errorDescuento}</Alerta>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo
                        etiqueta="Concepto"
                        value={conceptoDescuento}
                        onChange={(evento) =>
                          setConceptoDescuento(evento.target.value)
                        }
                      />
                      <Campo
                        etiqueta="Monto"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={montoDescuento}
                        onChange={(evento) =>
                          setMontoDescuento(evento.target.value)
                        }
                      />
                    </div>
                    <div className="mt-3">
                      <Boton
                        tipo="submit"
                        cargando={aplicandoDescuento}
                        textoDeCarga="Aplicando…"
                      >
                        Aplicar descuento
                      </Boton>
                    </div>
                  </form>
                )}

                {puede("APLICAR_CORTESIA") && (
                  <form
                    onSubmit={(evento) => void aplicarCortesiaForm(evento)}
                    className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-carbon">
                      Aplicar cortesía
                    </h3>
                    <p className="mb-3 text-xs text-madera/70">
                      Solo el dueño puede aplicar una cortesía. No puede superar
                      el total de la cuenta.
                    </p>
                    {errorCortesia !== null && (
                      <Alerta tipo="error">{errorCortesia}</Alerta>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo
                        etiqueta="Concepto"
                        value={conceptoCortesia}
                        onChange={(evento) =>
                          setConceptoCortesia(evento.target.value)
                        }
                      />
                      <Campo
                        etiqueta="Monto"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={montoCortesia}
                        onChange={(evento) =>
                          setMontoCortesia(evento.target.value)
                        }
                      />
                    </div>
                    <div className="mt-3">
                      <Boton
                        tipo="submit"
                        cargando={aplicandoCortesia}
                        textoDeCarga="Aplicando…"
                      >
                        Aplicar cortesía
                      </Boton>
                    </div>
                  </form>
                )}

                </details>

                <div className="mt-4 rounded-xl border border-madera/10 bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold text-carbon">
                    Dividir la cuenta y cobrar por persona
                  </h3>
                  <p className="mb-3 text-xs text-madera/70">
                    Asigna todas las unidades antes de cobrar. Cada comensal
                    pagará su parte; los descuentos se reparten
                    proporcionalmente.
                  </p>

                  {detalle.asignaciones.length > 0 && (
                    <Tabla
                      titulo={`División de la cuenta ${detalle.numero}`}
                      filas={detalle.asignaciones}
                      claveDeFila={(asignacion) => asignacion.comensal}
                      vacio="Sin asignaciones."
                      columnas={[
                        {
                          clave: "comensal",
                          encabezado: "Comensal",
                          render: (asignacion) => asignacion.comensal,
                        },
                        {
                          clave: "cantidad",
                          encabezado: "Unidades",
                          alinear: "derecha",
                          render: (asignacion) => asignacion.cantidad,
                        },
                        {
                          clave: "total",
                          encabezado: "Total asignado",
                          alinear: "derecha",
                          render: (asignacion) =>
                            formatearDinero(asignacion.total),
                        },
                        {
                          clave: "estado",
                          encabezado: "Estado",
                          render: (asignacion) =>
                            asignacion.pagado ? "Pagado" : "Pendiente",
                        },
                      ]}
                    />
                  )}

                  {puede("DIVIDIR_CUENTA") && (
                    <form
                      onSubmit={(evento) => void asignarLineaForm(evento)}
                      className="mt-3 rounded-xl border border-madera/10 bg-crema/40 p-3"
                    >
                      <h4 className="mb-2 text-sm font-semibold text-carbon">
                        Asignar una línea
                      </h4>
                      {errorAsignacion !== null && (
                        <Alerta tipo="error">{errorAsignacion}</Alerta>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Selector
                          etiqueta="Línea"
                          marcador="Elige una línea…"
                          value={lineaAAsignar}
                          onChange={(evento) =>
                            setLineaAAsignar(evento.target.value)
                          }
                          opciones={detalle.lineas.map((linea) => ({
                            valor: linea.id,
                            texto: `${linea.producto} — ${linea.cantidad - linea.cantidadAsignada} por asignar`,
                          }))}
                        />
                        <Campo
                          etiqueta="Cantidad"
                          inputMode="numeric"
                          value={cantidadAsignar}
                          onChange={(evento) =>
                            setCantidadAsignar(evento.target.value)
                          }
                        />
                        <Campo
                          etiqueta="Comensal"
                          inputMode="numeric"
                          value={comensalAsignar}
                          onChange={(evento) =>
                            setComensalAsignar(evento.target.value)
                          }
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Boton
                          tipo="submit"
                          cargando={asignando}
                          textoDeCarga="Asignando…"
                        >
                          Asignar línea
                        </Boton>
                        <Boton
                          variante="secundario"
                          cargando={asignandoTodas}
                          textoDeCarga="Asignando…"
                          onClick={() => void asignarTodasLasLineas()}
                        >
                          Asignar todas las líneas a sus comensales
                        </Boton>
                      </div>
                    </form>
                  )}

                </div>

                {puede("REGISTRAR_PAGO") && (
                    <form
                      onSubmit={(evento) => void cobrarForm(evento)}
                      className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3"
                    >
                      <h3 className="mb-2 text-sm font-semibold text-carbon">
                        {tieneDivision ? "Cobrar una parte" : "Cobrar la cuenta"}
                      </h3>
                      {errorCobro !== null && (
                        <Alerta tipo="error">{errorCobro}</Alerta>
                      )}

                      <p className="mb-3 rounded-xl bg-white px-3 py-2 text-sm text-madera">
                        Total a cobrar:{" "}
                        <strong className="text-carbon">
                          {formatearDinero(totalACobrar)}
                        </strong>
                        {cambioCalculado !== null && (
                          <>
                            {" "}
                            · Cambio:{" "}
                            <strong className="text-carbon">
                              {formatearDinero(cambioCalculado)}
                            </strong>
                          </>
                        )}
                      </p>

                      {servicioNumero > 0 && (
                        <p className="mb-3 text-xs text-madera/80">
                          Incluye {formatearDinero(servicioNumero)} de servicio
                          (propina legal). Es distinto de la propina del
                          mesero.
                        </p>
                      )}

                      {tieneDivision && (
                        <>
                          {!divisionCompleta && (
                            <Alerta tipo="info">
                              Asigna todas las cantidades de los productos
                              antes de iniciar los cobros individuales.
                            </Alerta>
                          )}
                          <Selector
                            etiqueta="Comensal que va a pagar"
                            marcador="Elige un comensal pendiente…"
                            value={comensalCobro}
                            onChange={(evento) => {
                              const valor = evento.target.value;
                              setComensalCobro(valor);
                              const asignacion = detalle.asignaciones.find(
                                (item) => item.comensal === Number(valor),
                              );
                              if (!recibidoEditado.current) {
                                const propina = Number(propinaCobro) || 0;
                                setRecibidoCobro(
                                  ((asignacion?.total ?? 0) + propina).toFixed(2),
                                );
                              }
                            }}
                            opciones={detalle.asignaciones
                              .filter((asignacion) => !asignacion.pagado)
                              .map((asignacion) => ({
                                valor: asignacion.comensal,
                                texto: `Comensal ${asignacion.comensal} — ${formatearDinero(asignacion.total)}`,
                              }))}
                          />
                        </>
                      )}

                      {ofertas.length > 0 && (
                        <div className="mb-3 rounded-xl border border-madera/10 bg-white px-3 py-2">
                          <p className="mb-2 text-sm text-madera">
                            Aplicar una oferta (un descuento de la gerencia):
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            <Selector
                              etiqueta="Oferta"
                              marcador="Elige una oferta…"
                              value={ofertaElegida}
                              onChange={(evento) =>
                                setOfertaElegida(evento.target.value)
                              }
                              opciones={ofertas.map((oferta) => ({
                                valor: oferta.id,
                                texto: `${oferta.nombre} (${
                                  oferta.tipoValor === "Porcentaje"
                                    ? `${oferta.valor} %`
                                    : formatearDinero(oferta.valor ?? 0)
                                })`,
                              }))}
                            />
                            <Boton
                              variante="secundario"
                              onClick={() => void aplicarOferta()}
                              cargando={aplicandoOferta}
                              textoDeCarga="Aplicando…"
                              disabled={ofertaElegida === ""}
                            >
                              Aplicar oferta
                            </Boton>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Selector
                          etiqueta="Forma de pago"
                          value={formaCobro}
                          onChange={(evento) =>
                            setFormaCobro(evento.target.value as FormaDePago)
                          }
                          opciones={[
                            { valor: "Efectivo", texto: "Efectivo" },
                            { valor: "Tarjeta", texto: "Tarjeta" },
                            ...(!tieneDivision
                              ? [{ valor: "PayPal", texto: "PayPal" }]
                              : []),
                            { valor: "Crédito", texto: "Crédito" },
                          ]}
                        />

                        {formaCobro === "Efectivo" && (
                          <Campo
                            etiqueta="Recibido"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={recibidoCobro}
                            onChange={(evento) => {
                              recibidoEditado.current = true;
                              setRecibidoCobro(evento.target.value);
                            }}
                            ayuda="Cuánto dinero dio el cliente. El cambio sale de aquí."
                          />
                        )}

                        {formaCobro !== "PayPal" && puede("REGISTRAR_PROPINA") && (
                          <Campo
                            etiqueta="Propina"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={propinaCobro}
                            onChange={(evento) => {
                              const valor = evento.target.value;
                              setPropinaCobro(valor);
                              if (!recibidoEditado.current) {
                                const propina = MONTO_VALIDO.test(valor.trim())
                                  ? Number(valor)
                                  : 0;
                                setRecibidoCobro(
                                  (totalBaseCobro + propina).toFixed(2),
                                );
                              }
                            }}
                            ayuda="Suma al total a cobrar y se anota a nombre del mesero."
                          />
                        )}

                        {formaCobro === "Tarjeta" && (
                          <Campo
                            etiqueta="Referencia"
                            value={referenciaCobro}
                            onChange={(evento) =>
                              setReferenciaCobro(evento.target.value)
                            }
                            ayuda="Número de aprobación de la tarjeta."
                          />
                        )}
                      </div>

                      {formaCobro === "PayPal" && (
                        <p className="mt-2 text-xs text-madera/70">
                          Con PayPal se abre una ventana para que el cliente
                          apruebe el pago, y la cuenta se marca como pagada
                          sola en cuanto lo aprueba. El monto se convierte a
                          dólares con la tasa que está escrita en la
                          configuración. La propina se registra aparte, en
                          Propinas.
                        </p>
                      )}
                      <div className="mt-3">
                        <Boton
                          tipo="submit"
                          cargando={cobrando}
                          textoDeCarga="Cobrando…"
                          disabled={
                            pedidoPaypal !== null ||
                            (tieneDivision &&
                              (!divisionCompleta ||
                                !asignacionElegida ||
                                asignacionElegida.pagado))
                          }
                        >
                          Cobrar
                        </Boton>
                      </div>
                    </form>
                  )}

                  {pedidoPaypal !== null && (
                    <div className="mt-4 rounded-xl border border-madera/10 bg-crema/40 p-3">
                      <h3 className="mb-2 text-sm font-semibold text-carbon">
                        Pago con PayPal
                      </h3>
                      <p className="text-sm text-madera">
                        Pedido <strong>{pedidoPaypal.id}</strong> · Estado{" "}
                        <strong>{pedidoPaypal.estado}</strong> · Se cobra{" "}
                        <strong>
                          {dineroDe(pedidoPaypal.moneda, pedidoPaypal.monto)}
                        </strong>
                        {pedidoPaypal.montoEnPesos !== undefined && (
                          <>
                            {" "}
                            ({(pedidoPaypal.montoEnPesos ?? 0).toFixed(2)} en
                            pesos
                            {pedidoPaypal.tasaCambio !== undefined &&
                              `, a ${pedidoPaypal.tasaCambio} por dólar`}
                            )
                          </>
                        )}
                      </p>

                      {pedidoPaypal.estado === "CREATED" && (
                        <p className="mt-2 text-sm text-madera">
                          Se abrió la ventana de PayPal. Cuando el cliente
                          apruebe, la cuenta se marca como pagada sola.
                        </p>
                      )}

                      {pedidoPaypal.enlace !== null && (
                        <p className="mt-2 text-sm text-madera">
                          Si el cliente cerró la ventana:{" "}
                          <a
                            href={pedidoPaypal.enlace}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brasa underline"
                          >
                            volver a abrir PayPal
                          </a>
                        </p>
                      )}

                      <div className="mt-3">
                        <Boton
                          variante="secundario"
                          cargando={moviendoPaypal}
                          textoDeCarga="Verificando…"
                          onClick={() => void capturarPaypal()}
                        >
                          Verificar el pago ahora
                        </Boton>
                      </div>
                    </div>
                  )}
              </section>
            )}
          </>
        )}

        {/*
          Los cobros que ya se hicieron y que todavía no tienen comprobante
          quedan aquí, plegados, para recuperarlos si alguien se quedó sin
          emitirlos. No estorban el flujo normal: cobrar, preguntar y emitir.
        */}
        {pendientes.length > 0 && (
          <details className="rounded-2xl border border-madera/10 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-carbon">
              Cobros que esperan comprobante ({pendientes.length})
            </summary>
            <p className="mt-1 text-sm text-madera">
              Son cobros ya hechos a los que todavía no se les emitió
              comprobante fiscal.
            </p>
            <Tabla
              titulo="Cobros que esperan comprobante"
              filas={pendientes}
              claveDeFila={(pago) => pago.id}
              vacio="No hay cobros esperando comprobante."
              columnas={[
                {
                  clave: "cuenta",
                  encabezado: "Cuenta",
                  render: (pago) => `${pago.numeroCuenta} · Mesa ${pago.mesa}`,
                },
                {
                  clave: "comensal",
                  encabezado: "Comensal",
                  render: (pago) => pago.comensal ?? "—",
                },
                {
                  clave: "forma",
                  encabezado: "Forma",
                  render: (pago) => pago.forma,
                },
                {
                  clave: "total",
                  encabezado: "Total",
                  alinear: "derecha",
                  render: (pago) => formatearDinero(pago.total),
                },
                {
                  clave: "fecha",
                  encabezado: "Cobrado",
                  render: (pago) => pago.fecha,
                },
                {
                  clave: "acciones",
                  encabezado: "Acciones",
                  alinear: "derecha",
                  render: (pago) => (
                    <Boton
                      variante="secundario"
                      aria-label={`Emitir el comprobante del cobro ${pago.id} de la cuenta ${pago.numeroCuenta}`}
                      onClick={() => {
                        setPagoCompletado({
                          mesa: pago.mesa,
                          numero: pago.numeroCuenta,
                          forma: pago.forma,
                          referencia: pago.referencia,
                          pagoId: pago.id,
                          comensal: pago.comensal,
                        });
                        setPreguntandoComprobante(true);
                        setErrorComprobante(null);
                        setComprobanteEmitido(null);
                      }}
                    >
                      Emitir comprobante
                    </Boton>
                  ),
                },
              ]}
            />
          </details>
        )}
      </div>
    </div>
  );
}
