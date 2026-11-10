/*
  corte.integracion.test.js — pruebas de la API de corte de caja (Fase 6, módulo 6).
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  cerrarAyudas,
  crearCuenta,
  dejarElSalonComoNuevo,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
} from "./ayudas/api-de-prueba.js";
import { appDePrueba } from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenCajero;
let tokenDueno;
let tokenMesero;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  await crearCuenta({ usuario: "c-cajero", rol: "cajero" });
  await crearCuenta({ usuario: "c-dueno", rol: "dueno" });
  await crearCuenta({ usuario: "c-mesero", rol: "mesero" });
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElSalonComoNuevo();
  await sql("TRUNCATE corte_caja");

  tokenCajero = await entrarYTomarToken(app, "c-cajero");
  tokenDueno = await entrarYTomarToken(app, "c-dueno");
  tokenMesero = await entrarYTomarToken(app, "c-mesero");
});

afterAll(async () => {
  await dejarElSalonComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("corte - autorización", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/corte");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene REALIZAR_CORTE: 403", async () => {
    const respuesta = await como(tokenMesero, request(app).get("/api/corte"));
    expect(respuesta.status).toBe(403);
  });

  it("el cajero puede consultar el resumen", async () => {
    const respuesta = await como(tokenCajero, request(app).get("/api/corte"));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe("Abierto");
  });
});

describe("corte - cerrar", () => {
  it("cierra el corte del día", async () => {
    const respuesta = await como(tokenCajero, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "0.00",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.resumen.estado).toBe("Cerrado");
  });

  it("un segundo cierre por un no dueño responde 409", async () => {
    await como(tokenCajero, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "0.00",
    });

    const segundo = await como(tokenCajero, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "0.00",
    });

    expect(segundo.status).toBe(409);
  });

  it("el dueño puede reabrir y cerrar de nuevo", async () => {
    await como(tokenCajero, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "0.00",
    });

    const reabierto = await como(tokenDueno, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "10.00",
    });

    expect(reabierto.status).toBe(201);
    expect(reabierto.body.datos.resumen.estado).toBe("Cerrado");
  });

  it("un efectivo declarado inválido responde 400", async () => {
    const respuesta = await como(tokenCajero, request(app).post("/api/corte/cerrar")).send({
      efectivoDeclarado: "abc",
    });

    expect(respuesta.status).toBe(400);
  });
});
