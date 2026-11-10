/*
  servicios/comprobante-fiscal.js — el JSON de la factura electrónica (Fase 8).
  ---------------------------------------------------------------------------

  Aquí se arma el documento que la plataforma de la DGII espera. Dos reglas que
  no se negocian:

    · El precio y el tiempo NO salen de aquí: salen de la cuenta, que salió de
      la base. Este archivo solo traduce.
    · El número fiscal NO se inventa: no se manda `eNCF` en el JSON, para que la
      plataforma asigne el siguiente del rango configurado en su panel.

  La tasa del impuesto sale de `parametro.tasa_impuesto` y el total de la cuenta
  ya lo incluye (RN-05), así que el gravado se saca hacia atrás: si el total es
  590.00 y la tasa es 18 %, el gravado es 500.00 y el impuesto 90.00.
*/

/**
 * Los códigos de forma de pago de la DGII. El dueño confirmó este mapeo el 20 de
 * octubre de 2026; está en un solo lugar para poder corregirlo de una vez.
 */
export const FORMAS_DE_PAGO_DGII = {
  Efectivo: 1,
  Cheque: 2,
  Tarjeta: 3,
  "Tarjeta de débito": 4,
  PayPal: 3,
  Crédito: 2,
};

/** El tipo de comprobante según la DGII: 31 es crédito fiscal, 32 consumo. */
export const TIPOS_DE_COMPROBANTE_DGII = {
  B01: 31,
  B02: 32,
};

/**
 * Lo que la comida del asadero es para la DGII: un servicio (2), no un bien
 * (1). Así lo trae el ejemplo de restaurante de la plataforma.
 */
export const TIPO_DE_ARTICULO_DGII = 2;

/** Redondea a dos decimales, como los montos del sistema. */
function aDosDecimales(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

/**
 * Pasa las líneas de la cuenta a su versión fiscal: SIN ITBIS.
 *
 * En el local los precios ya llevan el impuesto dentro (RN-05), pero la
 * plataforma exige que el precio y el monto de las líneas vayan sin impuesto
 * ("Precio unitario SIN ITBIS", según su documentación del E32). Aquí se saca
 * el impuesto de cada línea y se reparten los centavos que quedan, para que la
 * suma de las líneas sea exactamente el gravado del comprobante.
 */
/**
 * Quita todo lo que no sea dígito del RNC del comprador. Devuelve `null` si
 * no queda ningún dígito (es decir, no se proporcionó RNC). La DGII rechaza
 * los RNC con guiones, espacios o puntos.
 */
export function normalizarRnc(rnc) {
  if (typeof rnc !== "string") return null;
  const soloDigitos = rnc.replace(/\\D/g, "");
  return soloDigitos === "" ? null : soloDigitos;
}

/**
 * Valida el formato (longitud y dígito verificador) de un RNC dominicano.
 * Acepta RNC de 9 dígitos (empresas) y cédula de 11 dígitos (personas
 * físicas registradas como contribuyentes).
 */
export function rncEsValido(rnc) {
  if (typeof rnc !== "string") return false;
  const soloDigitos = rnc.replace(/\\D/g, "");
  if (soloDigitos.length === 9) {
    const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 8; i++) {
      suma += Number(soloDigitos[i]) * pesos[i];
    }
    const resto = suma % 11;
    const dv = resto === 0 ? 2 : resto === 1 ? 1 : 11 - resto;
    return dv === Number(soloDigitos[8]);
  }
  if (soloDigitos.length === 11) {
    // Luhn modificado (mod 10) con pesos alternados 1, 2.
    let suma = 0;
    for (let i = 0; i < 10; i++) {
      let digito = Number(soloDigitos[i]);
      if (i % 2 === 1) digito *= 2;
      if (digito > 9) digito -= 9;
      suma += digito;
    }
    const dv = (10 - (suma % 10)) % 10;
    return dv === Number(soloDigitos[10]);
  }
  return false;
}

export function pasarLineasAGravado(lineas, total, tasa) {
  const { base } = separarBaseEImpuesto(total, tasa);
  const factor = 1 + Number(tasa) / 100;

  // Todo en centavos: así no se pierde ningún centavo por el redondeo.
  const gravadoPorLinea = lineas.map((linea) => {
    const cantidad = Number(linea.cantidad);
    const precioCentavos = Math.round((Number(linea.precio) / factor) * 100);
    const descuentoCentavos = Math.round(
      ((Number(linea.precio) * cantidad - Number(linea.importe)) / factor) * 100,
    );

    return {
      precioCentavos,
      descuentoCentavos,
      montoCentavos: precioCentavos * cantidad - descuentoCentavos,
    };
  });

  const sumaCentavos = gravadoPorLinea.reduce(
    (suma, gravado) => suma + gravado.montoCentavos,
    0,
  );
  const diferencia = Math.round(base * 100) - sumaCentavos;

  // El último cobro (o paga) los centavos que sobran.
  if (diferencia !== 0 && gravadoPorLinea.length > 0) {
    gravadoPorLinea[gravadoPorLinea.length - 1].montoCentavos += diferencia;
  }

  return lineas.map((linea, indice) => {
    const gravado = gravadoPorLinea[indice];

    return {
      ...linea,
      precio: gravado.precioCentavos / 100,
      importe: gravado.montoCentavos / 100,
      ...(gravado.descuentoCentavos > 0
        ? { descuentoMonto: gravado.descuentoCentavos / 100 }
        : {}),
    };
  });
}

/**
 * Distribuye el total neto entre las líneas en proporción a sus importes.
 * Los centavos sobrantes se asignan por mayor resto para conservar el total.
 */
export function distribuirDescuentoEnLineas(lineas, total) {
  const importesCentavos = lineas.map((linea) =>
    Math.round(Number(linea.importe) * 100),
  );
  const brutoCentavos = importesCentavos.reduce((suma, importe) => suma + importe, 0);
  const totalCentavos = Math.round(Number(total) * 100);

  if (
    importesCentavos.some((importe) => !Number.isSafeInteger(importe) || importe < 0) ||
    !Number.isSafeInteger(brutoCentavos) ||
    !Number.isSafeInteger(totalCentavos) ||
    totalCentavos < 0 ||
    totalCentavos > brutoCentavos
  ) {
    throw new Error("El total fiscal no coincide con los importes de las líneas.");
  }

  if (brutoCentavos === 0) {
    return lineas.map((linea) => ({ ...linea, importe: 0, descuentoMonto: 0 }));
  }

  const bruto = BigInt(brutoCentavos);
  const asignaciones = importesCentavos.map((importe) => {
    const exacto = (BigInt(totalCentavos) * BigInt(importe)) / bruto;
    const resto = (BigInt(totalCentavos) * BigInt(importe)) % bruto;
    return { base: Number(exacto), resto };
  });
  let centavosPendientes =
    totalCentavos - asignaciones.reduce((suma, asignacion) => suma + asignacion.base, 0);

  const ordenPorResto = asignaciones
    .map((asignacion, indice) => ({ ...asignacion, indice }))
    .sort((a, b) => {
      if (a.resto !== b.resto) return a.resto > b.resto ? -1 : 1;
      return a.indice - b.indice;
    });

  for (const asignacion of ordenPorResto) {
    if (centavosPendientes === 0) break;
    if (importesCentavos[asignacion.indice] === 0) continue;
    asignaciones[asignacion.indice].base += 1;
    centavosPendientes -= 1;
  }

  if (centavosPendientes !== 0) {
    throw new Error("No se pudo distribuir el total fiscal entre las líneas.");
  }

  return lineas.map((linea, indice) => {
    const netoCentavos = asignaciones[indice].base;
    return {
      ...linea,
      importe: netoCentavos / 100,
      descuentoMonto: (importesCentavos[indice] - netoCentavos) / 100,
    };
  });
}

/**
 * Separa el total de la cuenta en gravado e impuesto. El total ya incluye el
 * impuesto, así que el gravado se calcula dividiendo.
 */
export function separarBaseEImpuesto(total, tasa) {
  const totalNumero = Number(total);
  const base = aDosDecimales(totalNumero / (1 + Number(tasa) / 100));
  const impuesto = aDosDecimales(totalNumero - base);

  return { base, impuesto, total: aDosDecimales(totalNumero) };
}

/**
 * Arma el JSON de la factura electrónica.
 *
 * @param {object} datos
 * @param {number} datos.total      El total de la cuenta, con el impuesto dentro.
 * @param {number} datos.tasa       El porcentaje de impuesto vigente.
 * @param {Array} datos.lineas      Las líneas de la cuenta.
 * @param {string} datos.forma      "Efectivo", "Tarjeta", "PayPal" o "Crédito".
 * @param {string} datos.nombre     Quién compra.
 * @param {string|null} datos.rnc   El RNC del comprador, si lo tiene.
 * @param {"B01"|"B02"} datos.tipo  El tipo de comprobante.
 */
export function construirFacturaElectronica({
  total,
  tasa,
  lineas,
  forma,
  nombre,
  rnc,
  tipo,
  propinaLegal = 0,
}) {
  const { base, impuesto } = separarBaseEImpuesto(total, tasa);
  const formaPago = FORMAS_DE_PAGO_DGII[forma] ?? 1;
  const tipoEcF = TIPOS_DE_COMPROBANTE_DGII[tipo] ?? 32;
  /*
    El RNC del comprador se normaliza a solo dígitos: la DGII rechaza (con
    "Aceptado condicional", código 1503) los comprobantes cuyo RncComprador
    lleva guiones, espacios o puntos. Si después de normalizar no queda nada,
    se trata como si no hubiera RNC (el Comprador es opcional por debajo de
    RD$250,000).
  */
  const rncNormalizado = normalizarRnc(rnc);
  const hayRnc = rncNormalizado !== null;
  const montoTotal = aDosDecimales(Number(total) + Number(propinaLegal));

  /*
    La plataforma asigna el número, el emisor y la fecha: eso no se manda. Lo
    que sí va es lo que la cuenta y el cliente dicen. El Comprador es
    opcional por debajo de RD$250,000 (el comprobante se convierte en RFCE) y
    obligatorio a partir de ahí, así que sin RNC no se manda el bloque.
  */
  const encabezado = {
    Version: "1.0",
    IdDoc: {
      TipoeCF: String(tipoEcF),
      IndicadorEnvioDiferido: "1",
      IndicadorMontoGravado: "0",
      TipoIngresos: "01",
      TipoPago: "1",
      TablaFormasPago: {
        FormaDePago: [
          { FormaPago: formaPago, MontoPago: montoTotal.toFixed(2) },
        ],
      },
    },
    Totales: {
      MontoGravadoTotal: base.toFixed(2),
      MontoGravadoI1: base.toFixed(2),
      ITBIS1: String(tasa),
      TotalITBIS1: impuesto.toFixed(2),
      TotalITBIS: impuesto.toFixed(2),
      MontoTotal: montoTotal.toFixed(2),
      ...(propinaLegal > 0
        ? { MontoImpuestoAdicional: aDosDecimales(propinaLegal).toFixed(2) }
        : {}),
    },
  };

  if (hayRnc) {
    /*
      Validar el formato antes de mandarlo: un RNC con dígito verificador
      incorrecto (o de longitud distinta a 9 u 11) es la causa del mensaje
      "El campo RncComprador ... no es válido" (código 1503) de la DGII.
    */
    if (!rncEsValido(rncNormalizado)) {
      throw new Error(
        "El RNC del comprador no es válido: debe tener 9 u 11 dígitos y dígito verificador correcto.",
      );
    }
    encabezado.Comprador = {
      RNCComprador: rncNormalizado,
      RazonSocialComprador: nombre,
    };
  }

  return {
    ECF: {
      Encabezado: encabezado,
      DetallesItems: {
        Item: lineas.map((linea, indice) => ({
          NumeroLinea: String(indice + 1),
          IndicadorFacturacion: "1",
          NombreItem: linea.producto,
          IndicadorBienoServicio: String(TIPO_DE_ARTICULO_DGII),
          CantidadItem: String(linea.cantidad),
          UnidadMedida: "43",
          PrecioUnitarioItem: Number(linea.precio).toFixed(2),
          MontoItem: Number(linea.importe).toFixed(2),
          ...(Number(linea.descuentoMonto ?? 0) > 0
            ? { DescuentoMonto: Number(linea.descuentoMonto).toFixed(2) }
            : {}),
        })),
      },
    },
  };
}
