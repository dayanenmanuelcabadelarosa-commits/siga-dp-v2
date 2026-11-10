/*
  reportes.integracion.test.js — pruebas de la API de reportes (Fase 7).
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  cerrarAyudas,
  crearCuenta,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
} from "./ayudas/api-de-prueba.js";
import { appDePrueba } from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let tokenMesero;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  await crearCuenta({ usuario: "r-mesero", rol: "mesero" });
});

beforeEach(async () => {
  await reiniciarCuentas();

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "r-mesero");
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("reportes - autorización", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/reportes/ventas");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene CONSULTAR_REPORTES: 403", async () => {
    const respuesta = await como(
      tokenMesero,
      request(app).get("/api/reportes/ventas"),
    );
    expect(respuesta.status).toBe(403);
  });

  it("el gerente puede consultar ventas, propinas, inventario y agotados", async () => {
    const [ventas, propinas, inventario, agotados] = await Promise.all([
      como(tokenGerente, request(app).get("/api/reportes/ventas")),
      como(tokenGerente, request(app).get("/api/reportes/propinas")),
      como(tokenGerente, request(app).get("/api/reportes/inventario")),
      como(tokenGerente, request(app).get("/api/reportes/agotados")),
    ]);

    expect(ventas.status).toBe(200);
    expect(Array.isArray(ventas.body.datos)).toBe(true);
    expect(propinas.status).toBe(200);
    expect(inventario.status).toBe(200);
    expect(agotados.status).toBe(200);
  });
});
