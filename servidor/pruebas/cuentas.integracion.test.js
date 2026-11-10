/*
  cuentas.integracion.test.js — pruebas de la API de cuentas (Fase 6, módulo 1).
  -----------------------------------------------------------------------------

  Se prueba contra PostgreSQL de verdad:

    · El permiso GENERAR_CUENTA y el rechazo por defecto.
    · La lista de mesas por facturar y su avance (sin líneas, sin enviar, lista).
    · Generar la cuenta solo cuando todo el consumo fue enviado.
    · Que el total de la API sea exactamente el de `fn_total_cuenta`.
    · Que generar dos veces no cree dos cuentas (RN-05).
    · Que el pedido quede cerrado y la mesa en "Cuenta pedida".
    · Que el detalle devuelva las líneas copiadas por la función de la base.

  Lo que no se prueba aquí: cobrar, descuentos y comprobantes. Son los módulos
  siguientes de la Fase 6 y todavía no existen.
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  cerrarAyudas,
  conceder,
  crearCuenta,
  dejarElSalonComoNuevo,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";
import { appDePrueba } from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let tokenMesero;
let tokenCapitan;
let tokenCajero;
let tokenDueno;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

function listar(token) {
  return como(token, request(app).get("/api/cuentas"));
}

function verCuenta(token, mesa = 1) {
  return como(token, request(app).get(`/api/cuentas/${mesa}`));
}

function generar(token, mesa = 1) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/generar`));
}

function pedirCuenta(token, mesa = 1) {
  return como(token, request(app).post(`/api/pedidos/${mesa}/pedir-cuenta`));
}

function quitarCuenta(token, mesa = 1) {
  return como(token, request(app).delete(`/api/pedidos/${mesa}/pedir-cuenta`));
}

function aplicarDescuento(token, mesa = 1, cuerpo = {}) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/descuentos`)).send(
    cuerpo,
  );
}

function aplicarCortesia(token, mesa = 1, cuerpo = {}) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/cortesias`)).send(
    cuerpo,
  );
}

function aplicarAsignacion(token, mesa = 1, cuerpo = {}) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/asignaciones`)).send(
    cuerpo,
  );
}

function cobrar(token, mesa = 1, cuerpo = {}) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/cobrar`)).send(
    cuerpo,
  );
}

function emitirComprobante(token, mesa = 1, cuerpo = {}) {
  return como(token, request(app).post(`/api/cuentas/${mesa}/comprobantes`)).send(
    cuerpo,
  );
}

function anularComprobante(token, ncf) {
  return como(token, request(app).post(`/api/comprobantes/${ncf}/anular`)).send(
    {},
  );
}

async function ocuparMesa(numero = 1) {
  await sql(
    "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE numero = $1",
    [numero],
  );
}

async function productoDePrueba() {
  const producto = await uno(
    "SELECT id_producto, precio::FLOAT8 AS precio FROM producto ORDER BY id_producto LIMIT 1",
  );

  if (!producto) {
    throw new Error("La semilla no dejó ningún producto para las pruebas.");
  }

  return producto;
}

/**
 * Abre un pedido en la mesa 1 y le agrega una línea. Con `enviar: false` la
 * línea queda guardada, que es el caso que la cuenta debe rechazar.
 */
async function prepararPedido({ enviar = true, cantidad = 2 } = {}) {
  await ocuparMesa(1);

  const abierto = await como(
    tokenGerente,
    request(app).post("/api/pedidos/1/abrir"),
  ).send({ comensales: 2 });
  expect(abierto.status).toBe(201);

  const producto = await productoDePrueba();

  const linea = await como(
    tokenGerente,
    request(app).post("/api/pedidos/1/lineas"),
  ).send({
    productoId: producto.id_producto,
    cantidad,
    persona: 1,
  });
  expect(linea.status).toBe(201);

  if (enviar) {
    const enviado = await como(
      tokenGerente,
      request(app).post("/api/pedidos/1/enviar"),
    );
    expect(enviado.status).toBe(200);
  }

  return {
    idPedido: abierto.body.datos.id,
    idLinea: linea.body.datos.id,
    idProducto: producto.id_producto,
    precio: producto.precio,
  };
}

async function cuentaEnLaBase(mesa = 1) {
  return uno(
    `SELECT c.id_cuenta, c.numero, c.estado,
            fn_total_cuenta(c.id_cuenta)::FLOAT8 AS total
       FROM cuenta c
       JOIN mesa m ON m.id_mesa = c.id_mesa
      WHERE m.numero = $1
      ORDER BY c.id_cuenta DESC
      LIMIT 1`,
    [mesa],
  );
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  await crearCuenta({ usuario: "c-mesero", rol: "mesero" });
  await crearCuenta({ usuario: "c-capitan", rol: "capitan" });
  await crearCuenta({ usuario: "c-cajero", rol: "cajero" });
  await crearCuenta({ usuario: "c-dueno", rol: "dueno" });
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElSalonComoNuevo();

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "c-mesero");
  tokenCapitan = await entrarYTomarToken(app, "c-capitan");
  tokenCajero = await entrarYTomarToken(app, "c-cajero");
  tokenDueno = await entrarYTomarToken(app, "c-dueno");
});

afterAll(async () => {
  await dejarElSalonComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("cuentas - autorización", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/cuentas");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene GENERAR_CUENTA: 403 en lista, detalle y generar", async () => {
    const lista = await listar(tokenMesero);
    const detalle = await verCuenta(tokenMesero);
    const generarRespuesta = await generar(tokenMesero);

    expect(lista.status).toBe(403);
    expect(detalle.status).toBe(403);
    expect(generarRespuesta.status).toBe(403);
    expect(lista.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("el cajero puede consultar y generar", async () => {
    await prepararPedido();

    const antes = await listar(tokenCajero);
    expect(antes.status).toBe(200);
    expect(antes.body.datos.porGenerar).toHaveLength(1);

    const respuesta = await generar(tokenCajero);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.creada).toBe(true);
  });

  it("el capitán puede consultar y generar", async () => {
    await prepararPedido();

    const antes = await listar(tokenCapitan);
    expect(antes.status).toBe(200);

    const respuesta = await generar(tokenCapitan);
    expect(respuesta.status).toBe(201);
  });
});

describe("cuentas - lista de mesas por facturar", () => {
  it("sin pedidos no hay cuentas abiertas ni mesas por facturar", async () => {
    const respuesta = await listar(tokenGerente);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.abiertas).toEqual([]);
    expect(respuesta.body.datos.porGenerar).toEqual([]);
  });

  it("dice cuántas líneas faltan enviar y cuántas se pueden facturar", async () => {
    await prepararPedido({ enviar: false });

    const conPendiente = await listar(tokenGerente);
    expect(conPendiente.body.datos.abiertas).toEqual([]);
    expect(conPendiente.body.datos.porGenerar).toHaveLength(1);
    expect(conPendiente.body.datos.porGenerar[0]).toMatchObject({
      idMesa: 1,
      numero: 1,
      lineasPendientes: 1,
      lineasFacturables: 0,
    });

    await como(
      tokenGerente,
      request(app).post("/api/pedidos/1/enviar"),
    );

    const listo = await listar(tokenGerente);
    expect(listo.body.datos.porGenerar[0]).toMatchObject({
      idMesa: 1,
      numero: 1,
      lineasPendientes: 0,
      lineasFacturables: 1,
    });
  });

  it("cuando la cuenta ya existe, sale de por facturar y entra en abiertas", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const lista = await listar(tokenGerente);
    const { abiertas, porGenerar } = lista.body.datos;

    expect(porGenerar).toEqual([]);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0]).toMatchObject({
      id: generada.body.datos.cuenta.id,
      numero: generada.body.datos.cuenta.numero,
      mesa: 1,
      total: 700,
    });
  });
});

describe("cuentas - generar", () => {
  it("una mesa sin pedido responde 409 y no crea cuenta", async () => {
    const respuesta = await generar(tokenGerente);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("CONFLICTO_DE_ESTADO");
    expect(await cuentaEnLaBase()).toBeNull();
  });

  it("una mesa con líneas sin enviar responde 409 y no crea cuenta", async () => {
    await prepararPedido({ enviar: false });

    const respuesta = await generar(tokenGerente);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("sin enviar");
    expect(await cuentaEnLaBase()).toBeNull();
  });

  it("una mesa sin consumo enviado responde 409", async () => {
    await ocuparMesa(1);
    await como(tokenGerente, request(app).post("/api/pedidos/1/abrir")).send({
      comensales: 2,
    });

    const respuesta = await generar(tokenGerente);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("no tiene consumo enviado");
    expect(await cuentaEnLaBase()).toBeNull();
  });

  it("genera la cuenta, cierra el pedido y deja la mesa en Cuenta pedida", async () => {
    const pedido = await prepararPedido({ cantidad: 2 });

    const respuesta = await generar(tokenGerente);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.creada).toBe(true);
    expect(respuesta.body.datos.cuenta).toMatchObject({
      mesa: 1,
      zona: "Salón (desarrollo)",
      mesero: "Gerente de desarrollo",
      estado: "Abierta",
      cortesia: false,
    });
    expect(respuesta.body.datos.cuenta.numero).toMatch(/^F-\d{4}$/);
    expect(respuesta.body.datos.cuenta.lineas).toHaveLength(1);
    expect(respuesta.body.datos.cuenta.lineas[0]).toMatchObject({
      producto: "Producto de desarrollo A",
      cantidad: 2,
      precio: 350,
      importe: 700,
      persona: 1,
    });

    const enBase = await cuentaEnLaBase();
    expect(enBase).not.toBeNull();
    expect(enBase.estado).toBe("Abierta");
    expect(respuesta.body.datos.cuenta.total).toBe(enBase.total);

    const pedidoEnBase = await uno(
      "SELECT estado, cerrado_en FROM pedido WHERE id_pedido = $1",
      [pedido.idPedido],
    );
    expect(pedidoEnBase.estado).toBe("Cerrado");
    expect(pedidoEnBase.cerrado_en).not.toBeNull();

    const mesaEnBase = await uno(
      "SELECT estado_pedido FROM mesa WHERE numero = 1",
    );
    expect(mesaEnBase.estado_pedido).toBe("Cuenta pedida");
  });

  it("el total sale de fn_total_cuenta, no de una suma hecha en JavaScript", async () => {
    await prepararPedido({ cantidad: 3 });

    const respuesta = await generar(tokenGerente);
    const idCuenta = respuesta.body.datos.cuenta.id;

    const calculado = await uno(
      "SELECT fn_total_cuenta(c.id_cuenta)::FLOAT8 AS total FROM cuenta c WHERE c.id_cuenta = $1",
      [idCuenta],
    );

    expect(respuesta.body.datos.cuenta.total).toBe(1050);
    expect(respuesta.body.datos.cuenta.total).toBe(calculado.total);
  });

  it("no copia a la cuenta las líneas anuladas del pedido", async () => {
    await prepararPedido({ cantidad: 2 });

    const productoB = await uno(
      "SELECT id_producto FROM producto ORDER BY id_producto DESC LIMIT 1",
    );
    const segunda = await como(
      tokenGerente,
      request(app).post("/api/pedidos/1/lineas"),
    ).send({ productoId: productoB.id_producto, cantidad: 1, persona: 2 });
    expect(segunda.status).toBe(201);

    await como(
      tokenGerente,
      request(app).post("/api/pedidos/1/enviar"),
    );

    const anulada = await como(
      tokenGerente,
      request(app).delete(`/api/pedidos/lineas/${segunda.body.datos.id}`),
    ).send({ motivo: "El cliente cambió de opinión" });
    expect(anulada.status).toBe(200);

    const respuesta = await generar(tokenGerente);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.cuenta.lineas).toHaveLength(1);
    expect(respuesta.body.datos.cuenta.total).toBe(700);
  });

  it("generar dos veces es idempotente: devuelve la misma cuenta (RN-05)", async () => {
    await prepararPedido();

    const primera = await generar(tokenGerente);
    const segunda = await generar(tokenGerente);

    expect(primera.status, JSON.stringify(primera.body)).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.body.datos.creada).toBe(false);
    expect(segunda.body.datos.cuenta.id).toBe(primera.body.datos.cuenta.id);
    expect(segunda.body.datos.cuenta.numero).toBe(
      primera.body.datos.cuenta.numero,
    );

    const cuentas = await sql("SELECT id_cuenta FROM cuenta");
    expect(cuentas).toHaveLength(1);
  });

  it("el detalle devuelve la cuenta abierta con sus líneas y su total", async () => {
    await prepararPedido({ cantidad: 1 });
    const generada = await generar(tokenGerente);

    const detalle = await verCuenta(tokenGerente);

    expect(detalle.status).toBe(200);
    expect(detalle.body.datos).toMatchObject({
      id: generada.body.datos.cuenta.id,
      mesa: 1,
      total: 350,
    });
    expect(detalle.body.datos.lineas).toHaveLength(1);
    expect(detalle.body.datos.lineas[0].producto).toBe(
      "Producto de desarrollo A",
    );
  });

  it("si no hay cuenta abierta, el detalle responde null (no inventa una vacía)", async () => {
    const detalle = await verCuenta(tokenGerente);

    expect(detalle.status).toBe(200);
    expect(detalle.body.datos).toBeNull();
  });

  it("una mesa que no existe responde 404", async () => {
    const respuesta = await generar(tokenGerente, 999);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("NO_ENCONTRADO");
  });

  it("un número de mesa inválido responde 400", async () => {
    const respuesta = await verCuenta(tokenGerente, 0);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

describe("cuentas - descuentos y cortesías", () => {
  it("permisos: el mesero no aplica nada; el cajero aplica descuento pero no cortesía; el dueño aplica ambas", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const mesa = 1;

    const meseroDescuento = await aplicarDescuento(tokenMesero, mesa, {
      concepto: "Prueba",
      monto: "10.00",
    });
    const meseroCortesia = await aplicarCortesia(tokenMesero, mesa, {
      concepto: "Prueba",
      monto: "10.00",
    });
    const cajeroDescuento = await aplicarDescuento(tokenCajero, mesa, {
      concepto: "Prueba",
      monto: "10.00",
    });
    const cajeroCortesia = await aplicarCortesia(tokenCajero, mesa, {
      concepto: "Prueba",
      monto: "10.00",
    });
    const gerenteCortesia = await aplicarCortesia(tokenGerente, mesa, {
      concepto: "Prueba",
      monto: "10.00",
    });
    const duenoCortesia = await aplicarCortesia(tokenDueno, mesa, {
      concepto: "Cortesía del dueño",
      monto: "10.00",
    });

    expect(meseroDescuento.status).toBe(403);
    expect(meseroCortesia.status).toBe(403);
    expect(cajeroDescuento.status).toBe(201);
    expect(cajeroCortesia.status).toBe(403);
    expect(gerenteCortesia.status).toBe(403);
    expect(duenoCortesia.status).toBe(201);
  });

  it("aplica un descuento dentro del 10 % y lo resta del total", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await aplicarDescuento(tokenCajero, 1, {
      concepto: "Cliente frecuente",
      monto: "70.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.descuento).toMatchObject({
      concepto: "Cliente frecuente",
      monto: 70,
      tipo: "Descuento",
    });
    expect(respuesta.body.datos.cuenta.total).toBe(630);
    expect(respuesta.body.datos.cuenta.descuentos).toHaveLength(1);

    const enBase = await uno(
      "SELECT COUNT(*)::INT AS cuantos, COALESCE(SUM(monto), 0)::FLOAT8 AS total FROM descuento WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(enBase.cuantos).toBe(1);
    expect(enBase.total).toBe(70);
  });

  it("rechaza un descuento que pasa del 10 % del total", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await aplicarDescuento(tokenCajero, 1, {
      concepto: "Demasiado",
      monto: "71.00",
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("10 %");

    const enBase = await uno(
      "SELECT COUNT(*)::INT AS cuantos FROM descuento WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(enBase.cuantos).toBe(0);
  });

  it("aplica una cortesía del dueño y marca la cuenta", async () => {
    await prepararPedido({ cantidad: 1 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await aplicarCortesia(tokenDueno, 1, {
      concepto: "Cumpleaños",
      monto: "100.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.descuento.tipo).toBe("Cortesía");
    expect(respuesta.body.datos.cuenta.cortesia).toBe(true);
    expect(respuesta.body.datos.cuenta.total).toBe(250);

    const enBase = await uno(
      "SELECT cortesia FROM cuenta WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(enBase.cortesia).toBe(true);
  });

  it("rechaza una cortesía que supera el total", async () => {
    await prepararPedido({ cantidad: 1 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await aplicarCortesia(tokenDueno, 1, {
      concepto: "Demasiado",
      monto: "351.00",
    });

    expect(respuesta.status).toBe(409);
  });

  it("no aplica nada sobre una cuenta que no está abierta", async () => {
    const descuento = await aplicarDescuento(tokenCajero, 999, {
      concepto: "Prueba",
      monto: "1.00",
    });
    const cortesia = await aplicarCortesia(tokenDueno, 999, {
      concepto: "Prueba",
      monto: "1.00",
    });

    expect(descuento.status).toBe(404);
    expect(cortesia.status).toBe(404);
  });

  it("el detalle incluye los descuentos aplicados", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    await aplicarDescuento(tokenCajero, 1, {
      concepto: "Cliente frecuente",
      monto: "35.00",
    });

    const detalle = await verCuenta(tokenGerente);
    expect(detalle.status).toBe(200);
    expect(detalle.body.datos.descuentos).toHaveLength(1);
    expect(detalle.body.datos.descuentos[0].concepto).toBe(
      "Cliente frecuente",
    );
    expect(detalle.body.datos.total).toBe(665);
  });
});

describe("cuentas - división por persona", () => {
  it("permisos: el mesero no puede asignar; el cajero sí", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const linea = generada.body.datos.cuenta.lineas[0].id;

    const mesero = await aplicarAsignacion(tokenMesero, 1, {
      idLineaCuenta: linea,
      comensal: 1,
    });
    const cajero = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea,
      comensal: 1,
    });

    expect(mesero.status).toBe(403);
    expect(cajero.status).toBe(201);
  });

  it("asigna una línea a un comensal y la muestra en el detalle", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const linea = generada.body.datos.cuenta.lineas[0];

    const respuesta = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 1,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.mensaje).toContain("comensal 1");
    expect(respuesta.body.datos.cuenta.asignaciones).toHaveLength(1);
    expect(respuesta.body.datos.cuenta.asignaciones[0]).toMatchObject({
      comensal: 1,
      total: 700,
    });

    const detalle = await verCuenta(tokenGerente);
    expect(detalle.body.datos.asignaciones).toHaveLength(1);
  });

  it("permite asignar unidades de la misma línea a personas distintas", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    const linea = generada.body.datos.cuenta.lineas[0];

    const primera = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 1,
      cantidad: 1,
    });
    const segunda = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 2,
      cantidad: 1,
    });

    expect(primera.status, JSON.stringify(primera.body)).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.datos.cuenta.asignaciones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ comensal: 1, cantidad: 1, total: 350 }),
        expect.objectContaining({ comensal: 2, cantidad: 1, total: 350 }),
      ]),
    );
  });

  it("rechaza asignar más unidades de las disponibles", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    const linea = generada.body.datos.cuenta.lineas[0];

    const respuesta = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 1,
      cantidad: 3,
    });

    expect(respuesta.status).toBe(409);
  });

  it("rechaza una línea que no pertenece a la cuenta", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: 999999,
      comensal: 1,
    });

    expect(respuesta.status).toBe(404);
  });

  it("no asigna sobre una cuenta que no está abierta", async () => {
    const respuesta = await aplicarAsignacion(tokenCajero, 999, {
      idLineaCuenta: 1,
      comensal: 1,
    });

    expect(respuesta.status).toBe(404);
  });
});

describe("cuentas - cobro", () => {
  it("cobra cada parte y cierra la cuenta al pagar el último comensal", async () => {
    await prepararPedido({ cantidad: 2 });
    const generada = await generar(tokenGerente);
    const linea = generada.body.datos.cuenta.lineas[0];

    const asignacion1 = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 1,
      cantidad: 1,
    });
    const asignacion2 = await aplicarAsignacion(tokenCajero, 1, {
      idLineaCuenta: linea.id,
      comensal: 2,
      cantidad: 1,
    });
    expect(asignacion1.status).toBe(201);
    expect(asignacion2.status).toBe(201);

    const primera = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "350.00",
      comensal: 1,
    });
    expect(primera.status, JSON.stringify(primera.body)).toBe(201);
    expect(primera.body.datos.cuentaPagada).toBe(false);
    expect(primera.body.datos.comensal).toBe(1);

    const cobroCompleto = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "350.00",
    });
    expect(cobroCompleto.status).toBe(409);

    const segunda = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "350.00",
      comensal: 2,
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body.datos.cuentaPagada).toBe(true);

    const cuenta = await uno(
      "SELECT estado FROM cuenta WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(cuenta.estado).toBe("Pagada");
  });

  it("permisos: el mesero no cobra; el cajero sí", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const mesero = await cobrar(tokenMesero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });
    const cajero = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    expect(mesero.status).toBe(403);
    expect(cajero.status).toBe(201);
  });

  it("la gerencia sí puede cobrar una cuenta que ella misma abrió", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await cobrar(tokenGerente, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    expect(respuesta.status).toBe(201);
  });

  it("un mesero no puede cobrar la cuenta de su propia mesa", async () => {
    // La regla es del mesero. Para poder probarla, se le da por un momento el
    // permiso de cobrar (en la matriz no lo tiene) y se le devuelve al final.
    await conceder("mesero", "REGISTRAR_PAGO", true);

    try {
      await ocuparMesa(1);

      const abierto = await como(
        tokenGerente,
        request(app).post("/api/pedidos/1/abrir"),
      ).send({ comensales: 2, mesero: "Prueba c-mesero" });
      expect(abierto.status).toBe(201);

      const producto = await productoDePrueba();
      await como(
        tokenGerente,
        request(app).post("/api/pedidos/1/lineas"),
      ).send({ productoId: producto.id_producto, cantidad: 2, persona: 1 });

      await como(
        tokenGerente,
        request(app).post("/api/pedidos/1/enviar"),
      );

      const generada = await generar(tokenGerente);
      expect(generada.status).toBe(201);

      const respuesta = await cobrar(tokenMesero, 1, {
        forma: "Efectivo",
        recibido: "700.00",
      });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.mensaje).toContain("mesero");
    } finally {
      await conceder("mesero", "REGISTRAR_PAGO", false);
    }
  });

  it("cobra en efectivo, calcula el cambio y deja la cuenta pagada", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "1000.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.cambio).toBe(300);
    expect(respuesta.body.datos.pagoId).toBeGreaterThan(0);

    const enBase = await uno(
      "SELECT estado, propina::FLOAT8 AS propina FROM cuenta WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(enBase.estado).toBe("Pagada");

    const pago = await uno(
      "SELECT forma_pago, monto_recibido::FLOAT8 AS recibido, cambio::FLOAT8 AS cambio FROM pago WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(pago.forma_pago).toBe("Efectivo");
    expect(pago.recibido).toBe(1000);
    expect(pago.cambio).toBe(300);
  });

  it("con tarjeta exige referencia", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const sinReferencia = await cobrar(tokenCajero, 1, {
      forma: "Tarjeta",
      recibido: "700.00",
    });
    expect(sinReferencia.status).toBe(400);

    const conReferencia = await cobrar(tokenCajero, 1, {
      forma: "Tarjeta",
      recibido: "700.00",
      referencia: "AUTH-123",
    });
    expect(conReferencia.status).toBe(201);
  });

  it("no cobra una cuenta que no está abierta", async () => {
    const respuesta = await cobrar(tokenCajero, 999, {
      forma: "Efectivo",
      recibido: "10.00",
    });

    expect(respuesta.status).toBe(404);
  });

  it("con propina, el cambio sale bien: no se come la propina", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    // Cuenta de RD$ 700, propina de RD$ 50, el cliente da RD$ 750.
    const respuesta = await cobrar(tokenGerente, 1, {
      forma: "Efectivo",
      recibido: "750.00",
      propina: "50.00",
    });

    expect(respuesta.status).toBe(201);
    // Sin cambio la base guarda NULL, que es lo mismo que cero.
    expect(respuesta.body.datos.cambio).toBeNull();

    const pago = await uno(
      "SELECT monto_recibido::FLOAT8 AS recibido, cambio::FLOAT8 AS cambio, propina::FLOAT8 AS propina FROM pago WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(pago.recibido).toBe(750);
    expect(pago.cambio).toBeNull();
    expect(pago.propina).toBe(50);
  });

  it("con el servicio activado, la cuenta cobra el 10 % de servicio", async () => {
    /*
      La propina legal de los restaurantes (10 % del gravado) se cobra con la
      cuenta y se anota aparte de la propina del mesero. El parámetro nace en 0
      (apagado) y lo activa el dueño.
    */
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const idCuenta = generada.body.datos.cuenta.id;
    const guardada = await uno(
      "SELECT propina_legal_porcentaje FROM parametro ORDER BY id_parametro DESC LIMIT 1",
    );

    await sql("UPDATE parametro SET propina_legal_porcentaje = 10");

    try {
      // Antes de cobrar, la cuenta abierta ya dice cuánto es el servicio.
      const detalle = await verCuenta(tokenGerente);
      expect(detalle.body.datos.servicio).toBe(59.32);

      const respuesta = await cobrar(tokenCajero, 1, {
        forma: "Efectivo",
        recibido: "1000.00",
      });

      expect(respuesta.status).toBe(201);

      const pago = await uno(
        "SELECT servicio::FLOAT8 AS servicio, cambio::FLOAT8 AS cambio FROM pago WHERE id_cuenta = $1",
        [idCuenta],
      );

      // El gravado de 700.00 es 593.22: el 10 % son 59.32.
      expect(pago.servicio).toBe(59.32);
      expect(pago.cambio).toBe(240.68);
    } finally {
      await sql("UPDATE parametro SET propina_legal_porcentaje = $1", [
        guardada.propina_legal_porcentaje,
      ]);
    }
  });

  it("sin el servicio activado, la cuenta se cobra tal cual", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    expect(respuesta.status).toBe(201);

    const pago = await uno(
      "SELECT servicio::FLOAT8 AS servicio FROM pago WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );

    expect(pago.servicio).toBe(0);
  });

  it("con efectivo insuficiente para el total más la propina, responde 409", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await cobrar(tokenGerente, 1, {
      forma: "Efectivo",
      recibido: "740.00",
      propina: "50.00",
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("750.00");
  });

  it("con tarjeta, el sistema cobra el total más la propina sin que se escriba", async () => {
    await prepararPedido({ cantidad: 2 });

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await cobrar(tokenGerente, 1, {
      forma: "Tarjeta",
      propina: "50.00",
      referencia: "AUTH-9",
    });

    expect(respuesta.status).toBe(201);

    const pago = await uno(
      "SELECT monto_recibido::FLOAT8 AS recibido, cambio::FLOAT8 AS cambio FROM pago WHERE id_cuenta = $1",
      [generada.body.datos.cuenta.id],
    );
    expect(pago.recibido).toBe(750);
    expect(pago.cambio).toBeNull();
  });
});

describe("cuentas - comprobantes fiscales", () => {
  /*
    Desde la Fase 8 el comprobante lo emite la plataforma de la DGII, que
    necesita la clave `IMECF_API_KEY`. Las pruebas de esta ruta quitan la clave
    un momento, para que no dependan de lo que haya en el .env de la máquina.
    El camino completo con la plataforma se prueba en
    `facturacion-electronica.integracion.test.js`, con un `fetch` de mentira.
  */
  async function sinClaveDeLaPlataforma(queHacer) {
    const guardada = process.env.IMECF_API_KEY;
    delete process.env.IMECF_API_KEY;

    try {
      return await queHacer();
    } finally {
      if (guardada !== undefined) process.env.IMECF_API_KEY = guardada;
    }
  }

  it("permisos: el mesero no emite", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    const mesero = await emitirComprobante(tokenMesero, 1, {
      tipo: "B02",
      cliente: "Cliente",
    });

    expect(mesero.status).toBe(403);
  });

  it("sin la clave de la plataforma, avisa que falta la configuración", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    const respuesta = await sinClaveDeLaPlataforma(() =>
      emitirComprobante(tokenCajero, 1, {
        tipo: "B02",
        cliente: "Cliente",
      }),
    );

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.codigo).toBe("INTEGRACION_NO_CONFIGURADA");
  });

  it("no emite si la cuenta no está pagada", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    const respuesta = await emitirComprobante(tokenCajero, 1, {
      tipo: "B02",
      cliente: "Cliente",
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("cobrar");
  });

  it("el comprobante sale de la cuenta del pago, no de la cuenta vieja de la mesa", async () => {
    /*
      Una mesa puede tener varias cuentas: una por cada pedido que se le cobra.
      Si la ruta buscara "la cuenta de la mesa" sin mirar el pago, el
      comprobante se iría a la cuenta vieja y la emisión moría con un 404
      ("ese pago no pertenece a la cuenta") que no deja ni emitir ni entender
      qué pasó.
    */
    await prepararPedido();
    expect((await generar(tokenGerente)).status).toBe(201);
    expect(
      (await cobrar(tokenCajero, 1, { forma: "Efectivo", recibido: "700.00" }))
        .status,
    ).toBe(201);

    await prepararPedido();
    expect((await generar(tokenGerente)).status).toBe(201);

    const cobrada = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });
    expect(cobrada.status).toBe(201);

    /*
      Sin la clave de la plataforma la emisión se detiene en el 503. Si la
      cuenta se hubiera resuelto mal, el error sería 404 y la prueba lo
      encontraría.
    */
    const respuesta = await sinClaveDeLaPlataforma(() =>
      emitirComprobante(tokenCajero, 1, {
        tipo: "B02",
        cliente: "Cliente",
        pagoId: cobrada.body.datos.pagoId,
      }),
    );

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.codigo).toBe("INTEGRACION_NO_CONFIGURADA");
  });

  it("no emite el comprobante de un pago que no es de esa mesa", async () => {
    await prepararPedido();
    expect((await generar(tokenGerente)).status).toBe(201);

    const cobrada = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });
    expect(cobrada.status).toBe(201);

    const respuesta = await emitirComprobante(tokenCajero, 2, {
      tipo: "B02",
      cliente: "Cliente",
      pagoId: cobrada.body.datos.pagoId,
    });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.mensaje).toContain("no es de esta mesa");
  });

  it("lista los cobros que todavía no tienen comprobante fiscal", async () => {
    /*
      Si la emisión falla (o el cajero sigue de largo), el comprobante se tiene
      que poder emitir DESPUÉS, sin volver a cobrar. Esta lista es el camino.
    */
    await prepararPedido();
    expect((await generar(tokenGerente)).status).toBe(201);

    const cobrada = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });
    expect(cobrada.status).toBe(201);

    const respuesta = await como(
      tokenCajero,
      request(app).get("/api/cuentas/comprobantes-pendientes"),
    );

    expect(respuesta.status).toBe(200);

    const mio = respuesta.body.datos.find(
      (pago) => pago.id === cobrada.body.datos.pagoId,
    );

    expect(mio).toBeDefined();
    expect(mio.mesa).toBe(1);
    expect(mio.forma).toBe("Efectivo");
    expect(Number(mio.total)).toBe(700);
  });

  it("no marca como anulado un comprobante sin soporte de anulación de la plataforma", async () => {
    await prepararPedido();

    const generada = await generar(tokenGerente);
    expect(generada.status).toBe(201);

    await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });

    /*
      El comprobante se deja con la función de la base (la que usa la secuencia
      local) porque la anulación no depende de la plataforma.
    */
    const cajero = await uno(
      "SELECT e.id_empleado FROM usuario u JOIN empleado e ON e.id_empleado = u.id_empleado WHERE u.usuario = 'c-cajero'",
    );

    const emitido = await uno(
      `SELECT fn_emitir_comprobante($1, 'B02'::tipo_comprobante, 'Cliente', $2, NULL, 'Efectivo'::forma_pago, NULL) AS ncf`,
      [generada.body.datos.cuenta.id, cajero.id_empleado],
    );

    const anulado = await anularComprobante(tokenCajero, emitido.ncf);
    expect(anulado.status).toBe(501);
    expect(anulado.body.error.codigo).toBe("ANULACION_FISCAL_NO_DISPONIBLE");
    expect(anulado.body.error.mensaje).toContain("no se modificó");

    const segundoIntento = await anularComprobante(tokenCajero, emitido.ncf);
    expect(segundoIntento.status).toBe(501);

    const estado = await uno(
      "SELECT estado FROM comprobante WHERE numero_ncf = $1",
      [emitido.ncf],
    );
    expect(estado.estado).toBe("Emitido");
  });

  it("lista comprobantes con cuenta y pago en el historial", async () => {
    await prepararPedido();
    const generada = await generar(tokenGerente);
    await cobrar(tokenCajero, 1, { forma: "Efectivo", recibido: "700.00" });
    const cajero = await uno(
      "SELECT e.id_empleado FROM usuario u JOIN empleado e ON e.id_empleado = u.id_empleado WHERE u.usuario = 'c-cajero'",
    );
    const emitido = await uno(
      `SELECT fn_emitir_comprobante($1, 'B02'::tipo_comprobante, 'Cliente historial', $2, NULL, 'Efectivo'::forma_pago, NULL) AS ncf`,
      [generada.body.datos.cuenta.id, cajero.id_empleado],
    );

    const respuesta = await como(
      tokenCajero,
      request(app).get("/api/comprobantes/historial?busqueda=Cliente"),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ncf: emitido.ncf,
          cliente: "Cliente historial",
          numeroCuenta: generada.body.datos.cuenta.numero,
          total: 700,
        }),
      ]),
    );
  });

  it("no emite sobre una mesa sin cuenta", async () => {
    const respuesta = await emitirComprobante(tokenCajero, 999, {
      tipo: "B02",
      cliente: "Cliente",
    });

    expect(respuesta.status).toBe(404);
  });
});



describe("pedidos - pedir la cuenta (R1)", () => {
  it("sin sesion responde 401", async () => {
    const respuesta = await request(app).post("/api/pedidos/1/pedir-cuenta");
    expect(respuesta.status).toBe(401);
  });

  it("el cajero no tiene CAPTURAR_PEDIDO: 403", async () => {
    await prepararPedido();
    const respuesta = await pedirCuenta(tokenCajero);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("el mesero pide la cuenta y queda en la cola del cajero", async () => {
    await prepararPedido();

    const respuesta = await pedirCuenta(tokenMesero);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.pedido.cuenta_pedida_en).not.toBeNull();

    const mesaEnBase = await uno(
      "SELECT estado_pedido, cuenta_pedida_en FROM mesa WHERE numero = 1",
    );
    expect(mesaEnBase.estado_pedido).toBe("Cuenta pedida");
    expect(mesaEnBase.cuenta_pedida_en).not.toBeNull();

    const lista = await listar(tokenCajero);
    expect(lista.status).toBe(200);
    expect(lista.body.datos.pedidas).toHaveLength(1);
    expect(lista.body.datos.pedidas[0]).toMatchObject({
      numero: 1,
      lineasPendientes: 0,
      lineasFacturables: 1,
    });
    expect(lista.body.datos.porGenerar).toEqual([]);
  });

  it("rechaza si hay lineas sin enviar", async () => {
    await prepararPedido({ enviar: false });

    const respuesta = await pedirCuenta(tokenMesero);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("pendiente");

    const mesaEnBase = await uno(
      "SELECT cuenta_pedida_en FROM mesa WHERE numero = 1",
    );
    expect(mesaEnBase.cuenta_pedida_en).toBeNull();
  });

  it("rechaza si no hay pedido abierto", async () => {
    await ocuparMesa(1);

    const respuesta = await pedirCuenta(tokenMesero);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("pedido abierto");
  });

  it("quitar el aviso deja la mesa en por facturar", async () => {
    await prepararPedido();
    await pedirCuenta(tokenMesero);

    const respuesta = await quitarCuenta(tokenMesero);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.pedido.cuenta_pedida_en).toBeNull();

    const mesaEnBase = await uno(
      "SELECT cuenta_pedida_en, estado_pedido FROM mesa WHERE numero = 1",
    );
    expect(mesaEnBase.cuenta_pedida_en).toBeNull();
    expect(mesaEnBase.estado_pedido).toBe("En preparación");

    const lista = await listar(tokenCajero);
    expect(lista.body.datos.pedidas).toHaveLength(0);
    expect(lista.body.datos.porGenerar).toHaveLength(1);
  });

  it("no se puede quitar el aviso si la cuenta ya se genero", async () => {
    await prepararPedido();
    await pedirCuenta(tokenMesero);

    const generada = await generar(tokenCajero);
    expect(generada.status).toBe(201);

    const respuesta = await quitarCuenta(tokenMesero);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("ya se generó");
  });

  it("al cobrar la cuenta, la mesa pasa a limpieza", async () => {
    await prepararPedido();
    await pedirCuenta(tokenMesero);

    const generada = await generar(tokenCajero);
    expect(generada.status).toBe(201);

    const cobrada = await cobrar(tokenCajero, 1, {
      forma: "Efectivo",
      recibido: "700.00",
    });
    expect(cobrada.status).toBe(201);

    const mesaEnBase = await uno(
      `SELECT estado, personas, hora_llegada, id_mesero_orden,
              estado_pedido, cuenta_pedida_en
         FROM mesa WHERE numero = 1`,
    );
    expect(mesaEnBase.estado).toBe("limpieza");
    expect(mesaEnBase.personas).toBeNull();
    expect(mesaEnBase.hora_llegada).toBeNull();
    expect(mesaEnBase.id_mesero_orden).toBeNull();
    expect(mesaEnBase.estado_pedido).toBeNull();
    expect(mesaEnBase.cuenta_pedida_en).toBeNull();
  });
});
