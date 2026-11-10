/*
  propinas.integracion.test.js — Propinas contra PostgreSQL.
  ---------------------------------------------------------

  Qué se demuestra aquí:

    · Sin sesión no se entra (401). El cajero no tiene REGISTRAR_PROPINA
      (403) y el mesero no tiene CERRAR_PROPINAS (403).
    · Cada empleado ve solo las mesas que abrió hoy.
    · La propina se registra sobre una mesa propia, con efectivo o tarjeta; con
      tarjeta la referencia es obligatoria (RN-28).
    · El empleado de la propina es el mesero del pedido, no quien escribe en la
      pantalla (RN-03).
    · No se repite la misma propina para el mismo empleado, mesa y día (RN-04).
    · El cierre suma lo esperado, guarda lo contado y deja escrito quién cerró
      de verdad (RN-12 y migración 015).
    · No se cierra dos veces al mismo empleado el mismo día.

  Todo pasa por HTTP y por la base de verdad. Antes de cada prueba se deja el
  salón como nuevo y se vacía el cierre de propinas, para que una prueba no
  dependa de lo que dejó otra.
*/

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarElSalonComoNuevo,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let tokenMesero;
let tokenMeseroDos;
let tokenCapitan;
let tokenCajero;
let idMesero;
let idMeseroDos;
let idCapitan;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

function registrar(token, cuerpo) {
  return como(token, request(app).post("/api/propinas")).send(cuerpo);
}

function cerrar(token, cuerpo) {
  return como(token, request(app).post("/api/propinas/cierre")).send(cuerpo);
}

async function crearMesa(numero) {
  const zona = await uno("SELECT id_zona FROM zona ORDER BY id_zona LIMIT 1");
  await sql(
    "INSERT INTO mesa (numero, id_zona, capacidad) VALUES ($1, $2, 4) ON CONFLICT (numero) DO NOTHING",
    [numero, zona.id_zona],
  );
}

async function ocuparMesa(numero) {
  await sql(
    "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE numero = $1",
    [numero],
  );
}

/**
 * Abre un pedido en una mesa a nombre de un empleado concreto. Se hace con la
 * cuenta del gerente y el campo `mesero`, que es como la pantalla permite
 * abrirlo a nombre de otra persona.
 */
async function abrirPedidoDe(usuarioMesero, numero = 1) {
  await ocuparMesa(numero);

  const respuesta = await como(
    tokenGerente,
    request(app).post(`/api/pedidos/${numero}/abrir`),
  ).send({ comensales: 2, mesero: `Prueba ${usuarioMesero}` });

  expect(respuesta.status).toBe(201);
  return respuesta.body.datos.id;
}

async function cerrarPedido(idPedido) {
  await sql(
    "UPDATE pedido SET estado = 'Cerrado', cerrado_en = now() WHERE id_pedido = $1",
    [idPedido],
  );
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  const mesero = await crearCuenta({
    usuario: "p-mesero-1",
    rol: "mesero",
  });
  const meseroDos = await crearCuenta({
    usuario: "p-mesero-2",
    rol: "mesero",
  });
  const capitan = await crearCuenta({
    usuario: "p-capitan",
    rol: "capitan",
  });
  await crearCuenta({ usuario: "p-cajero", rol: "cajero" });

  idMesero = mesero.idEmpleado;
  idMeseroDos = meseroDos.idEmpleado;
  idCapitan = capitan.idEmpleado;
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElSalonComoNuevo();
  await sql("TRUNCATE cierre_propina");
  await crearMesa(2);

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "p-mesero-1");
  tokenMeseroDos = await entrarYTomarToken(app, "p-mesero-2");
  tokenCapitan = await entrarYTomarToken(app, "p-capitan");
  tokenCajero = await entrarYTomarToken(app, "p-cajero");
});

afterAll(async () => {
  await dejarElSalonComoNuevo();
  await sql("TRUNCATE cierre_propina");
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ============================================================== autorización */
describe("autorización de /api/propinas", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/propinas");
    expect(respuesta.status).toBe(401);
  });

  it("el cajero no tiene REGISTRAR_PROPINA y recibe 403", async () => {
    const respuesta = await como(
      tokenCajero,
      request(app).get("/api/propinas"),
    );
    expect(respuesta.status).toBe(403);
  });

  it("el mesero no tiene CERRAR_PROPINAS y recibe 403", async () => {
    const respuesta = await como(
      tokenMesero,
      request(app).get("/api/propinas/cierre"),
    );
    expect(respuesta.status).toBe(403);
  });

  it("el capitán sí puede ver el cierre", async () => {
    const respuesta = await como(
      tokenCapitan,
      request(app).get("/api/propinas/cierre"),
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);
  });
});

/* ================================================================ registro */
describe("registro de propinas", () => {
  it("el mesero ve solo las mesas que abrió hoy", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await abrirPedidoDe("p-mesero-2", 2);

    const respuesta = await como(
      tokenMesero,
      request(app).get("/api/propinas"),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.mesas).toHaveLength(1);
    expect(respuesta.body.datos.mesas[0].numero).toBe(1);
    expect(respuesta.body.datos.mesas[0].propina).toBeNull();

    const delOtro = await como(
      tokenMeseroDos,
      request(app).get("/api/propinas"),
    );
    expect(delOtro.body.datos.mesas).toHaveLength(1);
    expect(delOtro.body.datos.mesas[0].numero).toBe(2);
  });

  it("registra una propina en efectivo y queda en la base", async () => {
    const idPedido = await abrirPedidoDe("p-mesero-1", 1);

    const respuesta = await registrar(tokenMesero, {
      mesa: 1,
      monto: "150.50",
      forma: "Efectivo",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.propina.monto).toBe(150.5);
    expect(respuesta.body.datos.propina.forma).toBe("Efectivo");
    expect(respuesta.body.datos.propina.mesa).toBe(1);
    expect(respuesta.body.datos.propina.hora).toMatch(/^\d{2}:\d{2}$/);

    expect(respuesta.body.datos.resumen.propinas).toHaveLength(1);
    expect(respuesta.body.datos.resumen.total).toBe(150.5);

    const guardada = await uno(
      `SELECT pr.id_empleado, pr.id_mesa, pr.id_cuenta, pr.referencia, p.id_mesero
         FROM propina pr
         JOIN pedido p ON p.id_pedido = $1
        WHERE pr.id_mesa = p.id_mesa`,
      [idPedido],
    );

    expect(guardada.id_empleado).toBe(idMesero);
    expect(guardada.id_empleado).toBe(guardada.id_mesero);
    expect(guardada.id_mesa).toBeTruthy();
    expect(guardada.id_cuenta).toBeNull();
    expect(guardada.referencia).toBeNull();
  });

  it("con tarjeta guarda la referencia (RN-28)", async () => {
    await abrirPedidoDe("p-mesero-1", 1);

    const respuesta = await registrar(tokenMesero, {
      mesa: 1,
      monto: "75.00",
      forma: "Tarjeta",
      referencia: "AUTH-123",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.propina.referencia).toBe("AUTH-123");

    const guardada = await uno(
      "SELECT referencia FROM propina ORDER BY id_propina DESC LIMIT 1",
    );
    expect(guardada.referencia).toBe("AUTH-123");
  });

  it("con tarjeta sin referencia responde 400 y no guarda nada", async () => {
    await abrirPedidoDe("p-mesero-1", 1);

    const respuesta = await registrar(tokenMesero, {
      mesa: 1,
      monto: "75.00",
      forma: "Tarjeta",
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/referencia/i);
    expect(
      await uno("SELECT count(*)::INTEGER AS cuantas FROM propina"),
    ).toEqual({ cuantas: 0 });
  });

  it("no deja registrar en una mesa que abrió otro mesero", async () => {
    await abrirPedidoDe("p-mesero-2", 2);

    const respuesta = await registrar(tokenMesero, {
      mesa: 2,
      monto: "100.00",
      forma: "Efectivo",
    });

    expect(respuesta.status).toBe(403);
    expect(
      await uno("SELECT count(*)::INTEGER AS cuantas FROM propina"),
    ).toEqual({ cuantas: 0 });
  });

  it("no deja registrar dos veces la misma mesa el mismo día (RN-04)", async () => {
    await abrirPedidoDe("p-mesero-1", 1);

    const primera = await registrar(tokenMesero, {
      mesa: 1,
      monto: "100.00",
      forma: "Efectivo",
    });
    expect(primera.status).toBe(201);

    const segunda = await registrar(tokenMesero, {
      mesa: 1,
      monto: "50.00",
      forma: "Efectivo",
    });
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.mensaje).toMatch(/ya registraste/i);

    expect(
      await uno("SELECT count(*)::INTEGER AS cuantas FROM propina"),
    ).toEqual({ cuantas: 1 });
  });

  it("exige elegir una mesa, sin valor por defecto", async () => {
    const respuesta = await registrar(tokenMesero, {
      monto: "100.00",
      forma: "Efectivo",
    });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza un monto de cero", async () => {
    await abrirPedidoDe("p-mesero-1", 1);

    const respuesta = await registrar(tokenMesero, {
      mesa: 1,
      monto: "0.00",
      forma: "Efectivo",
    });

    expect(respuesta.status).toBe(400);
  });

  it("una mesa que no existe responde 404", async () => {
    const respuesta = await registrar(tokenMesero, {
      mesa: 99,
      monto: "100.00",
      forma: "Efectivo",
    });

    expect(respuesta.status).toBe(404);
  });

  it("dos meseros pueden registrar en la misma mesa si cada uno tuvo su pedido hoy", async () => {
    // La base lo permite a propósito: el índice único de RN-04 incluye al
    // empleado. La decisión 11 sigue pendiente; esta prueba documenta lo que
    // hace hoy el sistema, no una regla nueva.
    const primerPedido = await abrirPedidoDe("p-mesero-1", 1);
    await cerrarPedido(primerPedido);
    await abrirPedidoDe("p-mesero-2", 1);

    const delPrimero = await registrar(tokenMesero, {
      mesa: 1,
      monto: "100.00",
      forma: "Efectivo",
    });
    expect(delPrimero.status).toBe(201);

    const delSegundo = await registrar(tokenMeseroDos, {
      mesa: 1,
      monto: "200.00",
      forma: "Efectivo",
    });
    expect(delSegundo.status).toBe(201);

    expect(
      await uno("SELECT count(*)::INTEGER AS cuantas FROM propina"),
    ).toEqual({ cuantas: 2 });
  });
});

/* ================================================================== cierre */
describe("cierre de propinas", () => {
  it("lista lo esperado por cada mesero que tiene propinas hoy", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await abrirPedidoDe("p-mesero-2", 2);

    await registrar(tokenMesero, {
      mesa: 1,
      monto: "100.00",
      forma: "Efectivo",
    });
    await registrar(tokenMeseroDos, {
      mesa: 2,
      monto: "200.00",
      forma: "Efectivo",
    });

    const respuesta = await como(
      tokenCapitan,
      request(app).get("/api/propinas/cierre"),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.filas).toHaveLength(2);

    const unoDeLosDos = respuesta.body.datos.filas.find(
      (fila) => fila.idEmpleado === idMesero,
    );
    expect(unoDeLosDos.esperado).toBe(100);
    expect(unoDeLosDos.cierre).toBeNull();
    expect(respuesta.body.datos.totales.totalEsperado).toBe(300);
    expect(respuesta.body.datos.totales.totalContado).toBe(0);
  });

  it("cierra las propinas y deja escrito quién las cerró", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await registrar(tokenMesero, {
      mesa: 1,
      monto: "200.00",
      forma: "Efectivo",
    });

    const respuesta = await cerrar(tokenCapitan, {
      idEmpleado: idMesero,
      contado: "190.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.cierre.esperado).toBe(200);
    expect(respuesta.body.datos.cierre.contado).toBe(190);
    expect(respuesta.body.datos.cierre.diferencia).toBe(-10);
    expect(respuesta.body.datos.cierre.cerradoPor).toBe(
      "Prueba p-capitan",
    );

    const guardado = await uno(
      "SELECT esperado, contado, diferencia, id_cerrado_por FROM cierre_propina WHERE id_empleado = $1",
      [idMesero],
    );
    expect(guardado.esperado).toBe(200);
    expect(guardado.contado).toBe(190);
    expect(guardado.diferencia).toBe(-10);
    expect(guardado.id_cerrado_por).toBe(idCapitan);
    expect(guardado.id_cerrado_por).not.toBe(idMesero);

    expect(respuesta.body.datos.resumen.filas[0].cierre).not.toBeNull();
  });

  it("permite cerrar con contado cero y anota el faltante", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await registrar(tokenMesero, {
      mesa: 1,
      monto: "50.00",
      forma: "Efectivo",
    });

    const respuesta = await cerrar(tokenCapitan, {
      idEmpleado: idMesero,
      contado: "0.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.cierre.diferencia).toBe(-50);
  });

  it("no cierra dos veces al mismo empleado el mismo día (RN-12)", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await registrar(tokenMesero, {
      mesa: 1,
      monto: "100.00",
      forma: "Efectivo",
    });

    const primera = await cerrar(tokenCapitan, {
      idEmpleado: idMesero,
      contado: "100.00",
    });
    expect(primera.status).toBe(201);

    const segunda = await cerrar(tokenCapitan, {
      idEmpleado: idMesero,
      contado: "100.00",
    });
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.mensaje).toMatch(/ya se cerraron/i);
  });

  it("no cierra a un empleado que no tiene propinas hoy", async () => {
    const respuesta = await cerrar(tokenCapitan, {
      idEmpleado: idMeseroDos,
      contado: "0.00",
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/no tiene propinas/i);
  });

  it("rechaza un contado con más de dos decimales", async () => {
    await abrirPedidoDe("p-mesero-1", 1);
    await registrar(tokenMesero, {
      mesa: 1,
      monto: "100.00",
      forma: "Efectivo",
    });

    const respuesta = await cerrar(tokenCapitan, {
      idEmpleado: idMesero,
      contado: "10.999",
    });

    expect(respuesta.status).toBe(400);
  });
});
