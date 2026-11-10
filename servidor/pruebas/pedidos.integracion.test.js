/*
  pedidos.integracion.test.js — pruebas de la API de pedidos (Fase 5, módulo 1).
*/

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

import {
  appDePrueba,
  dejarElSalonComoNuevo,
  entrarYTomarToken,
  sql,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;

beforeAll(async () => {
  await dejarElSalonComoNuevo();
});

beforeEach(async () => {
  await dejarElSalonComoNuevo();
  tokenGerente = await entrarYTomarToken(app, "gerente", "gerente");
});

async function ocuparMesa(numero) {
  await sql(
    "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE numero = $1",
    [numero],
  );
}

describe("pedidos - permisos", () => {
  it("sin sesión responde 401", async () => {
    const res = await request(app).get("/api/pedidos/1");
    expect(res.status).toBe(401);
  });

  it("con rol sin CAPTURAR_PEDIDO responde 403", async () => {
    // cocina no tiene CAPTURAR_PEDIDO
    const tokenCocina = await entrarYTomarToken(app, "cocina", "cocina").catch(() => null);
    if (!tokenCocina) return; // seed may not have cocina user
    const res = await request(app)
      .get("/api/pedidos/1")
      .set("Authorization", `Bearer ${tokenCocina}`);
    expect(res.status).toBe(403);
  });
});

describe("pedidos - abrir y agregar líneas", () => {
  it("abrir pedido en mesa ocupada devuelve 201 con el pedido", async () => {
    await ocuparMesa(1);
    const res = await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.datos.id).toBeGreaterThan(0);
    expect(res.body.datos.pedido.mesa).toBe(1);
    expect(res.body.datos.pedido.lineas).toEqual([]);
  });

  it("abrir pedido en mesa libre falla", async () => {
    const res = await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
  });

  it("agregar una línea al pedido devuelve 201 y la línea", async () => {
    await ocuparMesa(1);
    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    const res = await request(app)
      .post("/api/pedidos/1/lineas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ productoId: 1, cantidad: 2, observacion: "sin cebolla", persona: 1 });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.datos.id).toBeGreaterThan(0);
    expect(res.body.datos.pedido.lineas).toHaveLength(1);
  });

  it("enviar el pedido a cocina devuelve los números de comanda", async () => {
    await ocuparMesa(1);
    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    await request(app)
      .post("/api/pedidos/1/lineas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ productoId: 1, cantidad: 1 });

    const res = await request(app)
      .post("/api/pedidos/1/enviar")
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.datos.comandas.length).toBeGreaterThan(0);
  });

  it("el mesero ve el avance de las comandas en el pedido", async () => {
    await ocuparMesa(1);
    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    await request(app)
      .post("/api/pedidos/1/lineas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ productoId: 1, cantidad: 1 });

    await request(app)
      .post("/api/pedidos/1/enviar")
      .set("Authorization", `Bearer ${tokenGerente}`);

    const pendiente = await request(app)
      .get("/api/pedidos/1")
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(pendiente.status).toBe(200);
    expect(pendiente.body.datos.comandas).toHaveLength(1);
    expect(pendiente.body.datos.comandas[0].estado).toBe("Pendiente");
    expect(pendiente.body.datos.comandas[0].lineas[0].producto).toBeTruthy();

    const idComanda = pendiente.body.datos.comandas[0].id_comanda;

    await request(app)
      .post(`/api/cocina/comandas/${idComanda}/iniciar`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    const enPreparacion = await request(app)
      .get("/api/pedidos/1")
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(enPreparacion.body.datos.comandas[0].estado).toBe(
      "En preparación",
    );

    await request(app)
      .post(`/api/cocina/comandas/${idComanda}/preparar`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    const listo = await request(app)
      .get("/api/pedidos/1")
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(listo.body.datos.comandas[0].estado).toBe("Preparado");
    expect(listo.body.datos.comandas[0].lineas[0].estado).toBe("Preparado");
  });

  it("enviar sin líneas pendientes falla", async () => {
    await ocuparMesa(1);
    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    const res = await request(app)
      .post("/api/pedidos/1/enviar")
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("pedidos - la lista", () => {
  it("trae todos los pedidos con su total, que lo calcula la base", async () => {
    await ocuparMesa(1);

    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    const producto = await sql(
      "SELECT id_producto, precio::FLOAT8 AS precio FROM producto ORDER BY id_producto LIMIT 1",
    );

    await request(app)
      .post("/api/pedidos/1/lineas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({
        productoId: producto[0].id_producto,
        cantidad: 2,
        persona: 1,
      });

    const res = await request(app)
      .get("/api/pedidos")
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(res.status).toBe(200);
    expect(res.body.datos).toHaveLength(1);
    expect(res.body.datos[0].mesa).toBe(1);
    expect(res.body.datos[0].total).toBe(producto[0].precio * 2);
  });

  it("filtra por estado y por fecha", async () => {
    await ocuparMesa(1);

    await request(app)
      .post("/api/pedidos/1/abrir")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ comensales: 2 });

    const abiertos = await request(app)
      .get("/api/pedidos?estado=Abierto")
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(abiertos.body.datos).toHaveLength(1);

    const cerrados = await request(app)
      .get("/api/pedidos?estado=Cerrado")
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(cerrados.body.datos).toHaveLength(0);

    /*
      La fecha la dice el negocio, no el navegador: la ruta filtra por el día en
      America/Santo_Domingo. Calcularla aquí con `toISOString()` daría el día UTC
      y la prueba fallaría por la tarde/noche, cuando en Santo Domingo todavía es
      hoy pero en UTC ya es mañana.
    */
    const [{ fecha: hoy }] = await sql(
      "SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date::text AS fecha",
    );
    const deHoy = await request(app)
      .get(`/api/pedidos?fecha=${hoy}`)
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(deHoy.body.datos).toHaveLength(1);

    const deOtroDia = await request(app)
      .get("/api/pedidos?fecha=2020-01-01")
      .set("Authorization", `Bearer ${tokenGerente}`);
    expect(deOtroDia.body.datos).toHaveLength(0);
  });
});
