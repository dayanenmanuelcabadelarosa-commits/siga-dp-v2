/*
  bitacora.integracion.test.js — pruebas de la API de bitácora (Fase 7).
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

  await crearCuenta({ usuario: "b-mesero", rol: "mesero" });
});

beforeEach(async () => {
  await reiniciarCuentas();

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "b-mesero");
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("bitacora - autorización", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/bitacora");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene CONSULTAR_BITACORA: 403", async () => {
    const respuesta = await como(tokenMesero, request(app).get("/api/bitacora"));
    expect(respuesta.status).toBe(403);
  });

  it("el gerente puede consultar", async () => {
    const respuesta = await como(tokenGerente, request(app).get("/api/bitacora"));
    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
  });

  it("filtra por tabla", async () => {
    const respuesta = await como(
      tokenGerente,
      request(app).get("/api/bitacora?tabla=usuario&limite=5"),
    );
    expect(respuesta.status).toBe(200);
  });
});
