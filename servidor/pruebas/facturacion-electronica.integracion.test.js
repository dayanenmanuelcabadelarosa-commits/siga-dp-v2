/*
  facturacion-electronica.integracion.test.js — la factura electrónica (Fase 8).
  --------------------------------------------------------------------------------

  Se prueba por partes, sin internet:

    · El cliente de la plataforma manda la clave en el encabezado correcto y
      arma la dirección de cada llamada.
    · El JSON de la factura sale bien: el gravado, el impuesto, la forma de pago
      y las líneas.
    · NO se manda `eNCF`: el número lo asigna la plataforma.
    · La base guarda el número fiscal que llegó de la plataforma (y no lo
      cambia por la secuencia local).
*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  construirFacturaElectronica,
  distribuirDescuentoEnLineas,
  pasarLineasAGravado,
  separarBaseEImpuesto,
} from "../src/servicios/comprobante-fiscal.js";
import {
  consultarEstado,
  consultarTrack,
  descargarXml,
  diagnostico as diagnosticoDeImecf,
  enviarComprobante,
  hayClave as hayClaveDeImecf,
  leerConfigImecf,
} from "../src/servicios/imecf.js";
import { conBaseDePrueba } from "./ayudas/base-de-prueba.js";

const CONFIG = {
  url: "https://ecf.de-prueba",
  clave: "ecf_live_de_prueba",
};

/** Un `fetch` falso que devuelve lo que se le pida. */
function fetchFalso(respuestas = {}) {
  const llamadas = [];

  const falso = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });

    if (url.includes("/xml")) {
      return respuestas.xml ?? new Response("<xml/>", { status: 200 });
    }

    return (
      respuestas.json ??
      new Response(JSON.stringify({ id: "EC-1", encf: "E320000000015" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  };

  falso.llamadas = llamadas;
  return falso;
}

beforeAll(async () => {
  // Nada que preparar: estas pruebas no tocan la base.
});

afterAll(async () => {
  // Idem.
});

describe("facturación electrónica — el JSON de la factura", () => {
  it("separa el gravado y el impuesto de un total que ya los incluye", () => {
    // Total de RD$ 590.00 con 18 % de impuesto: gravado 500.00, impuesto 90.00.
    const separacion = separarBaseEImpuesto(590, 18);

    expect(separacion.base).toBe(500);
    expect(separacion.impuesto).toBe(90);
    expect(separacion.total).toBe(590);
  });

  it("las líneas van sin ITBIS, como pide la plataforma", () => {
    /*
      En el local el precio de 350 ya lleva el impuesto dentro, pero la
      plataforma exige que el precio y el monto de la línea vayan sin ITBIS
      ("Precio unitario SIN ITBIS"). El gravado de 700 es 593.22.
    */
    const lineas = pasarLineasAGravado(
      [{ producto: "Producto A", cantidad: 2, precio: 350, importe: 700 }],
      700,
      18,
    );

    expect(lineas[0].precio).toBe(296.61);
    expect(lineas[0].importe).toBe(593.22);
  });

  it("al repartir el gravado entre varias líneas no se pierde ningún centavo", () => {
    const lineas = pasarLineasAGravado(
      [
        { producto: "A", cantidad: 1, precio: 100, importe: 100 },
        { producto: "B", cantidad: 1, precio: 100, importe: 100 },
        { producto: "C", cantidad: 1, precio: 99.99, importe: 99.99 },
      ],
      299.99,
      18,
    );

    const suma = lineas.reduce((total, linea) => total + linea.importe, 0);

    expect(suma).toBeCloseTo(254.23, 2);
  });

  it("el descuento de la línea viaja sin ITBIS también", () => {
    const lineas = pasarLineasAGravado(
      [{ producto: "A", cantidad: 1, precio: 100, importe: 90 }],
      90,
      18,
    );

    // El precio sin impuesto sigue siendo el del catálogo; el descuento se
    // reporta aparte.
    expect(lineas[0].precio).toBe(84.75);
    expect(lineas[0].importe).toBe(76.27);
    expect(lineas[0].descuentoMonto).toBe(8.47);
  });

  it("arma la factura con los datos de la cuenta", () => {
    const payload = construirFacturaElectronica({
      total: 590,
      tasa: 18,
      lineas: [
        { producto: "Pollo a la brasa", cantidad: 1, precio: 500, importe: 500 },
      ],
      forma: "Efectivo",
      nombre: "CLIENTE SRL",
      rnc: "40223982170",
      tipo: "B01",
    });

    const encabezado = payload.ECF.Encabezado;

    expect(encabezado.Version).toBe("1.0");
    expect(encabezado.IdDoc.TipoeCF).toBe("31");
    expect(encabezado.IdDoc.TablaFormasPago.FormaDePago[0]).toEqual({
      FormaPago: 1,
      MontoPago: "590.00",
    });
    expect(encabezado.Comprador).toEqual({
      RNCComprador: "40223982170",
      RazonSocialComprador: "CLIENTE SRL",
    });
    expect(encabezado.Totales).toEqual({
      MontoGravadoTotal: "500.00",
      MontoGravadoI1: "500.00",
      ITBIS1: "18",
      TotalITBIS1: "90.00",
      TotalITBIS: "90.00",
      MontoTotal: "590.00",
    });
    expect(payload.ECF.DetallesItems.Item[0]).toEqual({
      NumeroLinea: "1",
      IndicadorFacturacion: "1",
      NombreItem: "Pollo a la brasa",
      IndicadorBienoServicio: "2",
      CantidadItem: "1",
      UnidadMedida: "43",
      PrecioUnitarioItem: "500.00",
      MontoItem: "500.00",
    });
  });

  it("distribuye el descuento por línea sin alterar la suma fiscal", () => {
    const lineas = distribuirDescuentoEnLineas(
      [
        { producto: "A", cantidad: 1, precio: 33.33, importe: 33.33 },
        { producto: "B", cantidad: 1, precio: 33.33, importe: 33.33 },
        { producto: "C", cantidad: 1, precio: 34.34, importe: 34.34 },
      ],
      100,
    );

    expect(lineas.reduce((suma, linea) => suma + linea.importe, 0)).toBe(100);
    expect(lineas.reduce((suma, linea) => suma + linea.descuentoMonto, 0)).toBe(1);

    const payload = construirFacturaElectronica({
      total: 100,
      tasa: 18,
      lineas,
      forma: "Efectivo",
      nombre: "Cliente",
      rnc: null,
      tipo: "B02",
    });
    const items = payload.ECF.DetallesItems.Item;

    expect(items.reduce((suma, item) => suma + Number(item.MontoItem), 0)).toBe(100);
    expect(items.reduce((suma, item) => suma + Number(item.DescuentoMonto ?? 0), 0)).toBe(1);
  });

  it("el consumo (B02) va con el tipo 32 y sin RNC no lleva bloque de comprador", () => {
    const payload = construirFacturaElectronica({
      total: 118,
      tasa: 18,
      lineas: [],
      forma: "PayPal",
      nombre: "Consumidor Final",
      rnc: null,
      tipo: "B02",
    });

    expect(payload.ECF.Encabezado.IdDoc.TipoeCF).toBe("32");
    // Por debajo de RD$250,000 el Comprador es opcional: sin RNC no se manda.
    expect(payload.ECF.Encabezado.Comprador).toBeUndefined();
  });

  it("no manda eNCF: el número lo asigna la plataforma", () => {
    const payload = construirFacturaElectronica({
      total: 100,
      tasa: 18,
      lineas: [],
      forma: "Efectivo",
      nombre: "Cliente",
      rnc: null,
      tipo: "B02",
    });

    expect(JSON.stringify(payload)).not.toContain("eNCF");
    expect(JSON.stringify(payload)).not.toContain("encf");
  });

  it("manda la forma de pago con el código de la DGII", () => {
    const deTarjeta = construirFacturaElectronica({
      total: 100,
      tasa: 18,
      lineas: [],
      forma: "Tarjeta",
      nombre: "Cliente",
      rnc: null,
      tipo: "B02",
    });
    const dePaypal = construirFacturaElectronica({
      total: 100,
      tasa: 18,
      lineas: [],
      forma: "PayPal",
      nombre: "Cliente",
      rnc: null,
      tipo: "B02",
    });

    expect(deTarjeta.ECF.Encabezado.IdDoc.TablaFormasPago.FormaDePago[0].FormaPago).toBe(3);
    expect(dePaypal.ECF.Encabezado.IdDoc.TablaFormasPago.FormaDePago[0].FormaPago).toBe(3);
  });
});

describe("facturación electrónica — el cliente de la plataforma", () => {
  it("manda la clave en el encabezado X-API-Key", async () => {
    const pedir = fetchFalso();

    await enviarComprobante(
      { ECF: { Encabezado: {} } },
      { config: CONFIG, fetch: pedir },
    );

    const llamada = pedir.llamadas[0];
    expect(llamada.url).toBe("https://ecf.de-prueba/api/v1/ecf/send");
    expect(llamada.opciones.headers["X-API-Key"]).toBe("ecf_live_de_prueba");
    expect(llamada.opciones.headers["Content-Type"]).toBe("application/json");
  });

  it("lee el eNCF, el trackId y el enlace de la respuesta", async () => {
    const pedir = fetchFalso({
      json: new Response(
        JSON.stringify({
          id: "EC-77",
          encf: "E320000000015",
          trackId: "TRACK-9",
          dgiiUrl: "https://dgii.test/ver/15",
          status: "Enviado",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    });

    const resultado = await enviarComprobante(
      { ECF: {} },
      { config: CONFIG, fetch: pedir },
    );

    expect(resultado.encf).toBe("E320000000015");
    expect(resultado.id).toBe("EC-77");
    expect(resultado.trackId).toBe("TRACK-9");
    expect(resultado.dgiiUrl).toBe("https://dgii.test/ver/15");
  });

  it("sin clave avisa que falta la configuración y no llama a nadie", async () => {
    const pedir = fetchFalso();

    await expect(
      enviarComprobante(
        { ECF: {} },
        { config: { url: CONFIG.url, clave: "" }, fetch: pedir },
      ),
    ).rejects.toMatchObject({
      estado: 503,
      codigo: "INTEGRACION_NO_CONFIGURADA",
    });

    expect(pedir.llamadas).toHaveLength(0);
  });

  it("si la plataforma responde otra cosa, avisa", async () => {
    const pedir = fetchFalso({
      json: new Response("<html>no soy json</html>", { status: 200 }),
    });

    await expect(
      enviarComprobante(
        { ECF: {} },
        { config: CONFIG, fetch: pedir },
      ),
    ).rejects.toMatchObject({ codigo: "RESPUESTA_INVALIDA" });
  });

  it("pregunta el estado, el track y el XML en su dirección", async () => {
    const pedir = fetchFalso();

    await consultarEstado("EC-77", { config: CONFIG, fetch: pedir });
    await consultarTrack("EC-77", { config: CONFIG, fetch: pedir });
    const xml = await descargarXml("EC-77", { config: CONFIG, fetch: pedir });

    expect(pedir.llamadas.map((llamada) => llamada.url)).toEqual([
      "https://ecf.de-prueba/api/v1/ecf/EC-77/status",
      "https://ecf.de-prueba/api/v1/ecf/EC-77/track",
      "https://ecf.de-prueba/api/v1/ecf/EC-77/xml",
    ]);
    expect(xml).toContain("<xml/>");
  });

  it("el diagnóstico explica que falta la clave", async () => {
    const resultado = await diagnosticoDeImecf({
      config: { url: CONFIG.url, clave: "" },
    });

    expect(resultado.listo).toBe(false);
    expect(resultado.mensaje).toContain("IMECF_API_KEY");
  });

  it("el diagnóstico pregunta a la plataforma y cuenta qué pasó con el último comprobante", async () => {
    const pedir = fetchFalso({
      json: new Response(
        JSON.stringify({
          data: [
            {
              encf: "E320000000018",
              estado: "ERROR_AL_ENVIAR_A_DGII",
              errorMessage: "Request failed with status code 400",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    });

    const resultado = await diagnosticoDeImecf({
      config: CONFIG,
      fetch: pedir,
    });

    expect(pedir.llamadas[0].url).toBe("https://ecf.de-prueba/api/v1/ecf");
    expect(resultado.listo).toBe(false);
    expect(resultado.mensaje).toContain("E320000000018");
    expect(resultado.mensaje).toContain("ERROR_AL_ENVIAR_A_DGII");
    expect(resultado.mensaje).toContain("Request failed with status code 400");
  });

  it("cuando la plataforma crea el documento pero la DGII lo rechaza, el aviso trae el número del documento", async () => {
    const pedir = fetchFalso({
      json: new Response(
        JSON.stringify({
          message: "Request failed with status code 400",
          documentId: "e390f589-aea0-4836-a0ae-72f987a18023",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    });

    await expect(
      enviarComprobante({ ECF: {} }, { config: CONFIG, fetch: pedir }),
    ).rejects.toMatchObject({
      codigo: "INTEGRACION_FALLIDA",
      message: expect.stringContaining("e390f589-aea0-4836-a0ae-72f987a18023"),
    });
  });

  it("la configuración por defecto apunta a la plataforma de la empresa", () => {
    const config = leerConfigImecf({});

    expect(config.url).toBe(
      "https://ecf-platform-backend-50801509587.us-central1.run.app",
    );
    expect(hayClaveDeImecf(config)).toBe(false);
  });
});

describe("facturación electrónica — en la base", () => {
  it("guarda el número fiscal que dio la plataforma", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [500] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1)", [
        s.idMesa,
      ]);

      // La cuenta está pagada (para poder facturar).
      await ay.numero(
        "SELECT fn_cobrar_cuenta($1, 'Efectivo', 500, $2, 0, NULL)",
        [idCuenta, s.idCajero],
      );

      const id = await ay.numero(
        `SELECT fn_registrar_comprobante_electronico(
                  $1, 'E320000000015', 32::smallint, 'B02', 'Consumidor Final', NULL,
                  500, 90, 590, 'Efectivo', NULL, $2,
                  'EC-77', 'TRACK-9', 'https://dgii.test/ver/15', 'Enviado'
                ) AS id`,
        [idCuenta, s.idCajero],
      );

      const comprobante = await ay.uno(
        `SELECT numero_ncf, id_ecf, track_id, dgii_url, estado_ecf, tipo_ecf,
                base::FLOAT8 AS base, impuesto::FLOAT8 AS impuesto, total::FLOAT8 AS total
           FROM comprobante WHERE id_comprobante = $1`,
        [id],
      );

      // El número es el de la plataforma, no el de la secuencia local.
      expect(comprobante.numero_ncf).toBe("E320000000015");
      expect(comprobante.id_ecf).toBe("EC-77");
      expect(comprobante.track_id).toBe("TRACK-9");
      expect(comprobante.estado_ecf).toBe("Enviado");
      expect(comprobante.tipo_ecf).toBe(32);
      expect(comprobante.base).toBe(500);
      expect(comprobante.impuesto).toBe(90);
      expect(comprobante.total).toBe(590);

      const lineas = await ay.numero(
        "SELECT COUNT(*) FROM linea_comprobante WHERE id_comprobante = $1",
        [id],
      );
      expect(lineas).toBe(1);
    });
  });

  it("sin número, la secuencia local sigue numerando", async () => {
    await conBaseDePrueba(async (ay) => {
      const s = await ay.servicio({ cuantasLineas: 1, precios: [500] });
      const idCuenta = await ay.numero("SELECT fn_generar_cuenta($1)", [
        s.idMesa,
      ]);

      const numero = await ay.uno(
        `INSERT INTO comprobante (tipo, id_cuenta, cliente, base, impuesto, total, forma_pago, id_emitido_por)
         VALUES ('B02', $1, 'Cliente', 500, 90, 590, 'Efectivo', $2)
         RETURNING numero_ncf`,
        [idCuenta, s.idCajero],
      );

      expect(numero.numero_ncf).toMatch(/^B02\d{9}$/);
    });
  });
});
