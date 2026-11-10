/*
  servicios/facturacion.js — emitir la factura electrónica de una cuenta (Fase 8).
  ---------------------------------------------------------------------------------

  Es el camino completo, y es el mismo tanto si lo dispara el cajero en la
  pantalla como si lo dispara el webhook de PayPal:

    1. Se lee la cuenta pagada, sus líneas y la tasa de impuesto vigente.
    2. Se arma el JSON de la DGII.
    3. Se manda a la plataforma, que asigna el eNCF.
    4. Se guarda el comprobante con ese número, junto con el id de la
       plataforma, el trackId y el enlace del timbre.

  La venta se guarda en la base en PESOS (el total de la cuenta), porque el
  corte de caja y los comprobantes del local hablan en pesos.
*/

import { conTransaccion, consultarUno } from "../db/conexion.js";
import { ErrorDeApi } from "../errores.js";
import {
  construirFacturaElectronica,
  distribuirDescuentoEnLineas,
  normalizarRnc,
  pasarLineasAGravado,
  rncEsValido,
  separarBaseEImpuesto,
} from "./comprobante-fiscal.js";
import { enviarComprobante } from "./imecf.js";

/**
 * Emite la factura electrónica de una cuenta ya pagada.
 *
 * @param {object} datos
 * @param {number} datos.idCuenta
 * @param {"B01"|"B02"} datos.tipo       31 (crédito fiscal) o 32 (consumo).
 * @param {string} datos.nombre          Quién compra.
 * @param {string|null} datos.rnc        RNC del comprador, si lo tiene.
 * @param {string} datos.forma           Forma de pago.
 * @param {string|null} datos.referencia
 * @param {number} datos.idEmpleado       Quién lo emite.
 * @param {string|null} [datos.nombreEmisor]  Para la bitácora.
 * @param {object} [datos.opciones]       Para las pruebas: `fetch` y `config`.
 */
export async function emitirFacturaElectronica({
  idCuenta,
  idPago = null,
  tipo,
  nombre,
  rnc,
  forma,
  referencia,
  idEmpleado,
  nombreEmisor = null,
  opciones = {},
}) {
  const cuenta = await consultarUno(
    `SELECT c.id_cuenta, c.estado, c.servicio::FLOAT8 AS servicio,
            fn_total_cuenta(c.id_cuenta)::FLOAT8 AS total
       FROM cuenta c
      WHERE c.id_cuenta = $1`,
    [idCuenta],
  );

  if (!cuenta) {
    throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa cuenta ya no existe.");
  }

  const pago = idPago === null
    ? null
    : await consultarUno(
        `SELECT id_pago, comensal, forma_pago, referencia, servicio
           FROM pago
          WHERE id_pago = $1 AND id_cuenta = $2`,
        [idPago, idCuenta],
      );

  if (idPago !== null && !pago) {
    throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese pago no pertenece a la cuenta.");
  }

  if (idPago === null && cuenta.estado !== "Pagada") {
    throw new ErrorDeApi(
      409,
      "CONFLICTO_DE_ESTADO",
      "Primero hay que cobrar la cuenta para emitir su comprobante.",
    );
  }

  const yaExiste =
    idPago === null
      ? await consultarUno(
          "SELECT numero_ncf FROM comprobante WHERE id_cuenta = $1 AND id_pago IS NULL",
          [idCuenta],
        )
      : await consultarUno(
          "SELECT numero_ncf FROM comprobante WHERE id_pago = $1",
          [idPago],
        );

  if (yaExiste) {
    throw new ErrorDeApi(
      409,
      "CONFLICTO_DE_ESTADO",
      `Esa cuenta ya tiene el comprobante ${yaExiste.numero_ncf}.`,
    );
  }

  const lineas = await consultarUno(
    `SELECT COALESCE(json_agg(
                json_build_object(
                  'producto', lc.descripcion,
                  'cantidad', COALESCE(ap.cantidad, lc.cantidad),
                  'precio',   lc.precio_unitario,
                  'importe',  COALESCE(ap.monto_asignado, lc.importe)
                ) ORDER BY lc.id_linea_cuenta
              ), '[]'::json) AS lineas
       FROM linea_cuenta lc
       LEFT JOIN asignacion_persona ap
         ON ap.id_linea_cuenta = lc.id_linea_cuenta
        AND ap.comensal = $2
      WHERE lc.id_cuenta = $1
        AND ($2::SMALLINT IS NULL OR ap.id_asignacion IS NOT NULL)`,
    [idCuenta, pago?.comensal ?? null],
  );

  const parametros = await consultarUno(
    "SELECT tasa_impuesto::FLOAT8 AS tasa FROM parametro ORDER BY id_parametro DESC LIMIT 1",
  );

  const tasa = Number(parametros?.tasa ?? 18);
  const total =
    pago?.comensal == null
      ? Number(cuenta.total)
      : Number(
          (
            await consultarUno(
              "SELECT fn_total_comensal($1, $2)::FLOAT8 AS total",
              [idCuenta, pago.comensal],
            )
          )?.total ?? 0,
        );
  const formaFinal = pago?.forma_pago ?? forma;
  const referenciaFinal = pago?.referencia ?? referencia;
  const { base, impuesto } = separarBaseEImpuesto(total, tasa);

  /*
    Las líneas van SIN ITBIS (la plataforma lo pide así) y el descuento de la
    cuenta se reparte entre ellas antes de sacarle el impuesto.
  */
  const lineasFiscales = pasarLineasAGravado(
    distribuirDescuentoEnLineas(lineas?.lineas ?? [], total),
    total,
    tasa,
  );

  /*
    A partir de RD$250,000 la DGII exige el RNC del comprador. Por debajo de
    esa cifra el Comprador es opcional (el comprobante sale como RFCE). El RNC
    se normaliza a solo dígitos: la DGII rechaza los que llevan guiones,
    espacios o puntos (código 1503, "Aceptado condicional").
  */
  const rncNormalizado = normalizarRnc(rnc);

  if (total >= 250000 && rncNormalizado === null) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "Para un comprobante de RD$250,000 o más hace falta el RNC del cliente.",
    );
  }

  if (rncNormalizado !== null && !rncEsValido(rncNormalizado)) {
    throw new ErrorDeApi(
      400,
      "DATOS_INVALIDOS",
      "El RNC del cliente no es válido: debe tener 9 u 11 dígitos y dígito verificador correcto.",
    );
  }

  const payload = construirFacturaElectronica({
    total,
    tasa,
    lineas: lineasFiscales,
    forma: formaFinal,
    nombre,
    rnc: rncNormalizado,
    tipo,
    /*
      El servicio del local (la propina legal del 10 % de los restaurantes) va
      aparte, como "MontoImpuestoAdicional": no es gravado ni impuesto, es el
      cargo por el servicio que la DGII pide declarar aparte. Si se factura un
      cobro concreto, es el de ese cobro; si se factura la cuenta entera, es el
      que se le cobró.
    */
    propinaLegal: Number(
      pago === null ? (cuenta.servicio ?? 0) : (pago.servicio ?? 0),
    ),
  });

  /*
    El envío va primero: la plataforma es la que asigna el número fiscal. Si
    después fallara el guardado, la factura existe en la plataforma y el aviso
    lo dice, para que nadie la emita dos veces.
  */
  const respuesta = await enviarComprobante(payload, opciones);

  if (!respuesta.encf) {
    throw new ErrorDeApi(
      502,
      "RESPUESTA_INVALIDA",
      "La plataforma no devolvió el número del comprobante.",
    );
  }

  const tipoEcF = Number(payload.ECF.Encabezado.IdDoc.TipoeCF);

  const idComprobante = await conTransaccion(
    async ({ consultarUno: uno }) => {
      const id = await uno(
        `SELECT fn_registrar_comprobante_electronico(
                  $1, $2, $3::smallint, $4, $5, $6, $7, $8, $9, $10::forma_pago, $11, $12, $13, $14, $15, $16, $17
                ) AS id`,
        [
          idCuenta,
          respuesta.encf,
          tipoEcF,
          tipo,
          nombre,
          rnc ?? null,
          base,
          impuesto,
          total,
          formaFinal,
          referenciaFinal ?? null,
          idEmpleado,
          respuesta.id,
          respuesta.trackId,
          respuesta.dgiiUrl,
          respuesta.estado ?? "Enviado",
          idPago,
        ],
      );

      return id.id;
    },
    { usuario: nombreEmisor },
  );

  return {
    id: idComprobante,
    ncf: respuesta.encf,
    idEcF: respuesta.id,
    pagoId: idPago,
    trackId: respuesta.trackId,
    dgiiUrl: respuesta.dgiiUrl,
    estado: respuesta.estado ?? "Enviado",
    base,
    impuesto,
    total,
    mensaje: `Comprobante ${respuesta.encf} emitido y enviado a la DGII.`,
  };
}
