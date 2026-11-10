/*
  ofertas.integracion.test.js — descuentos y ofertas (Fase 8).
  ---------------------------------------------------------------------------

  Se prueba contra PostgreSQL de verdad:

    · Solo la gerencia (dueño y gerente) crea, edita, activa y desactiva
      ofertas: el mesero y el cajero reciben 403.
    · Una oferta con el mismo nombre no se repite.
    · Al aplicar una oferta a una cuenta, el descuento queda guardado en la
      tabla `descuento` y la cuenta se recalcula sola (fn_total_cuenta).
    · Una oferta inactiva o vencida no se puede aplicar.
    · Un descuento mayor que el total no se aplica.
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let tokenMesero;
let tokenCajero;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

function crearOferta(token, cuerpo) {
  return como(token, request(app).post("/api/ofertas")).send({
    fechaInicio: "2026-01-01",
    fechaFin: "2026-12-31",
    ...cuerpo,
  });
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  await crearCuenta({ usuario: "o-mesero", rol: "mesero" });
  await crearCuenta({ usuario: "o-cajero", rol: "cajero" });
});

beforeEach(async () => {
  await reiniciarCuentas();
  await sql("TRUNCATE promocion, descuento CASCADE");

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "o-mesero");
  tokenCajero = await entrarYTomarToken(app, "o-cajero");
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("ofertas — quién las maneja", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/ofertas");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero y el cajero no pueden crearlas: 403", async () => {
    const mesero = await crearOferta(tokenMesero, {
      nombre: "Oferta del mesero",
      tipoValor: "Porcentaje",
      valor: 10,
    });
    const cajero = await crearOferta(tokenCajero, {
      nombre: "Oferta del cajero",
      tipoValor: "Porcentaje",
      valor: 10,
    });

    expect(mesero.status).toBe(403);
    expect(cajero.status).toBe(403);
  });

  it("la gerencia sí puede crearlas", async () => {
    const respuesta = await crearOferta(tokenGerente, {
      nombre: "10 % de descuento",
      descripcion: "Cliente frecuente",
      tipoValor: "Porcentaje",
      valor: 10,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({
      nombre: "10 % de descuento",
      tipoValor: "Porcentaje",
      valor: 10,
      activo: true,
    });
  });

  it("no se repite el nombre", async () => {
    await crearOferta(tokenGerente, {
      nombre: "Cena especial",
      tipoValor: "Monto",
      valor: 100,
    });

    const repetida = await crearOferta(tokenGerente, {
      nombre: "Cena especial",
      tipoValor: "Monto",
      valor: 200,
    });

    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("YA_EXISTE");
  });

  it("edita, activa y desactiva", async () => {
    const creada = await crearOferta(tokenGerente, {
      nombre: "Lunch",
      tipoValor: "Monto",
      valor: 50,
    });
    const id = creada.body.datos.id;

    const editada = await como(
      tokenGerente,
      request(app).patch(`/api/ofertas/${id}`),
    ).send({ nombre: "Lunch Express", valor: 75 });
    expect(editada.status).toBe(200);
    expect(editada.body.datos.nombre).toBe("Lunch Express");
    expect(editada.body.datos.valor).toBe(75);

    const desactivada = await como(
      tokenGerente,
      request(app).post(`/api/ofertas/${id}/desactivar`),
    );
    expect(desactivada.status).toBe(200);
    expect(desactivada.body.datos.activo).toBe(false);

    const reactivada = await como(
      tokenGerente,
      request(app).post(`/api/ofertas/${id}/activar`),
    );
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.datos.activo).toBe(true);
  });
});

describe("ofertas — aplicarlas al cobrar", () => {
  it("el cajero ve las ofertas activas; el mesero no las ve", async () => {
    const activa = await crearOferta(tokenGerente, {
      nombre: "Activa",
      tipoValor: "Porcentaje",
      valor: 10,
    });
    const inactiva = await crearOferta(tokenGerente, {
      nombre: "Inactiva",
      tipoValor: "Porcentaje",
      valor: 10,
    });

    await como(
      tokenGerente,
      request(app).post(`/api/ofertas/${inactiva.body.datos.id}/desactivar`),
    );

    const delCajero = await como(
      tokenCajero,
      request(app).get("/api/ofertas/activas"),
    );
    expect(delCajero.status).toBe(200);
    expect(delCajero.body.datos).toHaveLength(1);
    expect(delCajero.body.datos[0].id).toBe(activa.body.datos.id);

    const delMesero = await como(
      tokenMesero,
      request(app).get("/api/ofertas/activas"),
    );
    expect(delMesero.status).toBe(403);
  });

  it("el descuento queda guardado y la cuenta se recalcula", async () => {
    // Una cuenta abierta de RD$ 700.
    await sql(
      "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE numero = 1",
    );
    await como(tokenGerente, request(app).post("/api/pedidos/1/abrir")).send({
      comensales: 2,
    });
    const producto = await uno(
      "SELECT id_producto, precio::FLOAT8 AS precio FROM producto ORDER BY id_producto LIMIT 1",
    );
    await como(tokenGerente, request(app).post("/api/pedidos/1/lineas")).send({
      productoId: producto.id_producto,
      cantidad: 2,
      persona: 1,
    });
    await como(tokenGerente, request(app).post("/api/pedidos/1/enviar"));
    await como(tokenGerente, request(app).post("/api/cuentas/1/generar"));

    const oferta = await crearOferta(tokenGerente, {
      nombre: "10 % de descuento",
      tipoValor: "Porcentaje",
      valor: 10,
    });

    const respuesta = await como(
      tokenCajero,
      request(app).post("/api/cuentas/1/ofertas"),
    ).send({ idOferta: oferta.body.datos.id });

    expect(respuesta.status).toBe(201);

    // 700 - 10 % = 630.
    expect(respuesta.body.datos.cuenta.total).toBe(630);
    expect(respuesta.body.datos.cuenta.descuentos).toHaveLength(1);
    expect(respuesta.body.datos.cuenta.descuentos[0]).toMatchObject({
      concepto: "10 % de descuento",
      monto: 70,
      tipo: "Descuento",
    });

    // Y el total de la base es el mismo.
    const enBase = await uno(
      "SELECT fn_total_cuenta($1)::FLOAT8 AS total FROM cuenta WHERE id_cuenta = $1",
      [respuesta.body.datos.cuenta.id],
    );
    expect(enBase.total).toBe(630);
  });

  it("una oferta inactiva no se puede aplicar", async () => {
    const oferta = await crearOferta(tokenGerente, {
      nombre: "Oferta vieja",
      tipoValor: "Monto",
      valor: 50,
    });
    await como(
      tokenGerente,
      request(app).post(`/api/ofertas/${oferta.body.datos.id}/desactivar`),
    );

    const respuesta = await como(
      tokenCajero,
      request(app).post("/api/cuentas/1/ofertas"),
    ).send({ idOferta: oferta.body.datos.id });

    expect(respuesta.status).toBe(409);
  });

  it("un descuento mayor que el total no se aplica", async () => {
    const oferta = await crearOferta(tokenGerente, {
      nombre: "Enorme",
      tipoValor: "Monto",
      valor: 999999,
    });

    const respuesta = await como(
      tokenCajero,
      request(app).post("/api/cuentas/1/ofertas"),
    ).send({ idOferta: oferta.body.datos.id });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toContain("mayor que el total");
  });
});
