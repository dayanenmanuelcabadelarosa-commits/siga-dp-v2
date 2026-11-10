/*
  facturacion-puntapunta.integracion.test.js — la factura electrónica y el
  webhook de PayPal, de punta a punta (Fase 8).
  --------------------------------------------------------------------------------

  Aquí se prueba el camino COMPLETO con la base de verdad y las APIs externas
  sustituidas por un `fetch` de mentira:

    · Emitir el comprobante: la cuenta se factura, la plataforma asigna el eNCF
      y ese número queda guardado en la base (no el de la secuencia local).
    · El webhook de PayPal: cuando avisa que el pago se completó, la cuenta
      queda pagada, el pago se registra EN PESOS y la factura sale sola.
    · La misma cuenta no se cobra dos veces.
*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emitirFacturaElectronica } from "../src/servicios/facturacion.js";
import { registrarPagoPaypal } from "../src/servicios/pago-paypal.js";
import { cerrarAyudas, dejarLaBaseComoNueva, sql, uno } from "./ayudas/api-de-prueba.js";

const CONFIG_IMECF = {
  url: "https://ecf.de-prueba",
  clave: "ecf_live_de_prueba",
};

const CONFIG_PAYPAL = {
  entorno: "sandbox",
  clientId: "cliente",
  clientSecret: "secreto",
  moneda: "USD",
};

function respuestaJson(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

/** Un `fetch` falso que responde como PayPal y como la plataforma de la DGII. */
function fetchFalso() {
  const llamadas = [];

  /*
    Cada factura de prueba lleva un número distinto: el eNCF es único en la
    base y estas pruebas dejan datos confirmados.
  */
  let numeroDeFactura = 0;

  const falso = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });

    if (url.includes("/v1/oauth2/token")) {
      return respuestaJson({ access_token: "token", expires_in: 3600 });
    }

    if (url.includes("/capture")) {
      return respuestaJson({
        id: "ORDER-WEBHOOK-1",
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: "CUENTA-1",
            payments: {
              captures: [
                {
                  id: "PAY-77",
                  status: "COMPLETED",
                  amount: { value: "8.27", currency_code: "USD" },
                  payer: {
                    email_address: "comprador@de-prueba.com",
                    name: { given_name: "Ana", surname: "Pérez" },
                  },
                },
              ],
            },
          },
        ],
      });
    }

    if (url.includes("/api/v1/ecf/send")) {
      numeroDeFactura += 1;
      return respuestaJson({
        id: `EC-${Date.now()}-${numeroDeFactura}`,
        encf: `E32${Date.now()}${numeroDeFactura}`,
        trackId: "TRACK-9",
        dgiiUrl: "https://dgii.test/ver/15",
      });
    }

    return respuestaJson({});
  };

  falso.llamadas = llamadas;
  return falso;
}

/** El cajero de pruebas (o el primero que exista). */
async function cajeroDePrueba() {
  const existente = await uno(
    "SELECT e.id_empleado FROM empleado e JOIN rol r ON r.id_rol = e.id_rol WHERE r.codigo = 'cajero' ORDER BY e.id_empleado LIMIT 1",
  );
  if (existente !== null) return existente.id_empleado;

  const rol = await uno("SELECT id_rol FROM rol WHERE codigo = 'cajero'");
  const creado = await uno(
    "INSERT INTO empleado (cedula, nombre, id_rol) VALUES ($1, $2, $3) RETURNING id_empleado",
    [`ECF-${Date.now()}`, "Cajero de pruebas", rol.id_rol],
  );

  return creado.id_empleado;
}

/**
 * Deja una cuenta pagada en la base de pruebas, con datos ya confirmados (para
 * que el servicio, que usa su propia conexión, los vea).
 */
async function prepararCuentaPagada({ cobrar = true, precio = null } = {}) {
  const mesa = await uno("SELECT id_mesa FROM mesa WHERE numero = 1");
  const mesero = await uno(
    "SELECT e.id_empleado FROM usuario u JOIN empleado e ON e.id_empleado = u.id_empleado WHERE u.usuario = 'gerente'",
  );
  const cajero = await cajeroDePrueba();

  /*
    Estas pruebas dejan datos confirmados. Para poder repetirlas, primero se
    cierran los pedidos y las cuentas que quedaron abiertos de la corrida
    anterior (una mesa solo puede tener un pedido abierto a la vez).
  */
  await sql(
    "UPDATE cuenta SET estado = 'Pagada', cerrada_en = now() WHERE id_mesa = $1 AND estado = 'Abierta'",
    [mesa.id_mesa],
  );
  await sql(
    "UPDATE pedido SET estado = 'Cerrado', cerrado_en = now() WHERE id_mesa = $1 AND estado IN ('Abierto', 'Enviado')",
    [mesa.id_mesa],
  );

  await sql(
    "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE id_mesa = $1",
    [mesa.id_mesa],
  );

  const pedido = await uno(
    "INSERT INTO pedido (id_mesa, id_mesero) VALUES ($1, $2) RETURNING id_pedido",
    [mesa.id_mesa, mesero.id_empleado],
  );

  const producto = await uno(
    "SELECT id_producto, precio FROM producto ORDER BY id_producto LIMIT 1",
  );

  await sql(
    `INSERT INTO linea_pedido (id_pedido, id_producto, comensal, cantidad, precio_unitario, estado)
     VALUES ($1, $2, 1, 2, $3, 'Enviada')`,
    [pedido.id_pedido, producto.id_producto, precio ?? producto.precio],
  );

  const cuenta = await uno("SELECT fn_generar_cuenta($1) AS id", [mesa.id_mesa]);
  const total = await uno("SELECT fn_total_cuenta($1)::FLOAT8 AS total", [
    cuenta.id,
  ]);

  if (cobrar) {
    // Si el dueño tiene activado el servicio (propina legal), hay que pagar
    // también esa parte: la base no acepta menos.
    const servicio = await uno(
      "SELECT fn_servicio_de_la_cuenta($1)::FLOAT8 AS servicio",
      [cuenta.id],
    );

    await uno("SELECT fn_cobrar_cuenta($1, 'Efectivo', $2, $3, 0, NULL)", [
      cuenta.id,
      Number(total.total) + Number(servicio.servicio),
      cajero,
    ]);
  }

  return { idCuenta: cuenta.id, total: Number(total.total), cajero };
}

beforeAll(async () => {
  // La base de pruebas ya está preparada por el globalSetup de Vitest.
});

afterAll(async () => {
  // Se deja la base como estaba: estas pruebas crean cuentas y pagos de verdad.
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("facturación electrónica — de punta a punta", () => {
  it("emite la factura y guarda el número que dio la plataforma", async () => {
    const { idCuenta, cajero } = await prepararCuentaPagada();
    const pedir = fetchFalso();

    const factura = await emitirFacturaElectronica({
      idCuenta,
      tipo: "B01",
      nombre: "Cliente SRL",
      rnc: "40223982170",
      forma: "Efectivo",
      referencia: null,
      idEmpleado: cajero,
      nombreEmisor: "gerente",
      opciones: { config: CONFIG_IMECF, fetch: pedir },
    });

    expect(factura.ncf).toMatch(/^E32/);
    expect(factura.trackId).toBe("TRACK-9");

    const guardado = await uno(
      "SELECT numero_ncf, id_ecf, track_id, tipo_ecf, estado_ecf FROM comprobante WHERE id_cuenta = $1",
      [idCuenta],
    );
    expect(guardado.numero_ncf).toBe(factura.ncf);
    expect(guardado.id_ecf).toContain("EC-");
    expect(guardado.tipo_ecf).toBe(31);
    expect(guardado.estado_ecf).toBe("Enviado");
  });

  it("el pago que avisa PayPal cobra la cuenta y factura solo", async () => {
    // La cuenta está abierta: el pago de PayPal es lo que la va a cobrar.
    const { idCuenta, total, cajero } = await prepararCuentaPagada({
      cobrar: false,
    });

    const idPaypal = `ORDER-WEBHOOK-${Date.now()}`;

    await sql(
      `INSERT INTO pago_paypal (id_cuenta, id_paypal, referencia, monto, monto_rd, tasa_cambio, estado, id_cajero)
       VALUES ($1, $2, 'CUENTA-1', 8.27, $3, 60, 'APPROVED', $4)`,
      [idCuenta, idPaypal, total, cajero],
    );

    const pedir = fetchFalso();

    const resultado = await registrarPagoPaypal(idPaypal, {
      paypal: { config: CONFIG_PAYPAL, fetch: pedir },
      imecf: { config: CONFIG_IMECF, fetch: pedir },
    });

    expect(resultado.cobrado).toBe(true);

    const cuenta = await uno("SELECT estado FROM cuenta WHERE id_cuenta = $1", [
      idCuenta,
    ]);
    expect(cuenta.estado).toBe("Pagada");

    // El pago se registra en PESOS: el total de la cuenta.
    const pago = await uno(
      "SELECT monto_recibido::FLOAT8 AS recibido, referencia FROM pago WHERE id_cuenta = $1",
      [idCuenta],
    );
    expect(pago.recibido).toBe(total);
    expect(pago.referencia).toBe("PAY-77");

    // Y la factura sale sola, sin que nadie pulse nada.
    const comprobante = await uno(
      "SELECT numero_ncf, cliente, estado_ecf FROM comprobante WHERE id_cuenta = $1",
      [idCuenta],
    );
    expect(comprobante.numero_ncf).toMatch(/^E32/);
    expect(comprobante.cliente).toBe("Ana Pérez");

    const correo = await uno(
      "SELECT correo_comprador FROM pago_paypal WHERE id_paypal = $1",
      [idPaypal],
    );
    expect(correo.correo_comprador).toBe("comprador@de-prueba.com");
  });

  it("las líneas van sin ITBIS, como las pide la plataforma", async () => {
    /*
      Los precios del local ya llevan el impuesto dentro, pero la plataforma
      exige que el precio y el monto de las líneas vayan SIN ITBIS.
    */
    const { idCuenta, cajero } = await prepararCuentaPagada();
    const pedir = fetchFalso();

    await emitirFacturaElectronica({
      idCuenta,
      tipo: "B01",
      nombre: "Cliente SRL",
      rnc: "40223982170",
      forma: "Efectivo",
      referencia: null,
      idEmpleado: cajero,
      nombreEmisor: "gerente",
      opciones: { config: CONFIG_IMECF, fetch: pedir },
    });

    const enviado = JSON.parse(pedir.llamadas[0].opciones.body);
    const encabezado = enviado.ECF.Encabezado;
    const items = enviado.ECF.DetallesItems.Item;

    const gravado = Number(encabezado.Totales.MontoGravadoTotal);

    expect(gravado).toBeGreaterThan(0);
    expect(
      items.reduce((suma, item) => suma + Number(item.MontoItem), 0),
    ).toBeCloseTo(gravado, 2);
    expect(Number(items[0].PrecioUnitarioItem)).toBeLessThan(
      Number(items[0].MontoItem) / Number(items[0].CantidadItem) + 0.01,
    );
  });

  it("con el servicio activado, el comprobante declara el MontoImpuestoAdicional", async () => {
    /*
      La propina legal de los restaurantes (10 % del gravado) se declara aparte
      en el comprobante, como "MontoImpuestoAdicional", y el total lo incluye.
    */
    const guardada = await uno(
      "SELECT propina_legal_porcentaje FROM parametro ORDER BY id_parametro DESC LIMIT 1",
    );

    await sql("UPDATE parametro SET propina_legal_porcentaje = 10");

    try {
      const { idCuenta, cajero } = await prepararCuentaPagada();
      const pedir = fetchFalso();

      await emitirFacturaElectronica({
        idCuenta,
        tipo: "B01",
        nombre: "Cliente SRL",
        rnc: "40223982170",
        forma: "Efectivo",
        referencia: null,
        idEmpleado: cajero,
        nombreEmisor: "gerente",
        opciones: { config: CONFIG_IMECF, fetch: pedir },
      });

      const enviado = JSON.parse(pedir.llamadas[0].opciones.body);
      const totales = enviado.ECF.Encabezado.Totales;

      // El gravado de 700.00 es 593.22: el 10 % de servicio son 59.32.
      expect(totales.MontoImpuestoAdicional).toBe("59.32");
      expect(totales.MontoTotal).toBe("759.32");
      expect(enviado.ECF.Encabezado.IdDoc.TablaFormasPago.FormaDePago[0].MontoPago).toBe(
        "759.32",
      );
    } finally {
      await sql("UPDATE parametro SET propina_legal_porcentaje = $1", [
        guardada.propina_legal_porcentaje,
      ]);
    }
  });

  it("a partir de RD$250,000 sin RNC no emite: la DGII lo exige", async () => {
    const { idCuenta, cajero } = await prepararCuentaPagada({ precio: 200000 });
    const pedir = fetchFalso();

    await expect(
      emitirFacturaElectronica({
        idCuenta,
        tipo: "B01",
        nombre: "Cliente",
        rnc: null,
        forma: "Efectivo",
        referencia: null,
        idEmpleado: cajero,
        nombreEmisor: "gerente",
        opciones: { config: CONFIG_IMECF, fetch: pedir },
      }),
    ).rejects.toMatchObject({ codigo: "DATOS_INVALIDOS" });

    expect(pedir.llamadas).toHaveLength(0);
  });

  it("no cobra dos veces la misma cuenta", async () => {    const { idCuenta, total, cajero } = await prepararCuentaPagada({
      cobrar: false,
    });

    const idPaypal = `ORDER-WEBHOOK-${Date.now()}`;

    await sql(
      `INSERT INTO pago_paypal (id_cuenta, id_paypal, referencia, monto, monto_rd, tasa_cambio, estado, id_cajero)
       VALUES ($1, $2, 'CUENTA-1', 8.27, $3, 60, 'APPROVED', $4)`,
      [idCuenta, idPaypal, total, cajero],
    );

    const pedir = fetchFalso();

    await registrarPagoPaypal(idPaypal, {
      paypal: { config: CONFIG_PAYPAL, fetch: pedir },
      imecf: { config: CONFIG_IMECF, fetch: pedir },
    });

    const segundo = await registrarPagoPaypal(idPaypal, {
      paypal: { config: CONFIG_PAYPAL, fetch: pedir },
      imecf: { config: CONFIG_IMECF, fetch: pedir },
    });

    expect(segundo.cobrado).toBe(false);
    expect(segundo.yaCobrado).toBe(true);
  });
});
