/*
  errores.integracion.test.js — que un error de verdad no cuelgue la petición.
  ---------------------------------------------------------------------------

  El criterio de salida de la Fase 2 pide comprobar "que un error async no deja la
  petición colgada". Aquí se comprueba con un error de verdad, no simulado:

  se entra al sistema, y después se cierra el grupo de conexiones de la
  aplicación. A partir de ahí, cualquier ruta que necesite la base falla de
  verdad, en medio de una función async, y lo que se mira es que la petición
  conteste (500) en vez de quedarse esperando para siempre.

  El grupo de conexiones que se cierra es el de este archivo. Cada archivo de
  pruebas corre en su propio proceso (Vitest los aísla), así que las demás pruebas
  no se enteran.
*/

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cerrarConexion } from "../src/db/conexion.js";
import {
  appDePrueba,
  cerrarAyudas,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let token;
let quejaOriginal;

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  token = await entrarYTomarToken(app);

  // El error real se escribe en el registro del servidor; se silencia para que no
  // ensucie la salida de las pruebas.
  quejaOriginal = vi.spyOn(console, "error").mockImplementation(() => {});

  await cerrarConexion();
});

afterAll(async () => {
  quejaOriginal?.mockRestore();
  await cerrarAyudas();
});

describe("Un error async no deja la petición colgada", () => {
  it("responde 500 con el mensaje genérico, sin filtrar el detalle interno", async () => {
    const respuesta = await request(app)
      .get("/api/acceso/yo")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("ERROR_INTERNO");
    expect(respuesta.body.error.mensaje).toBe("Ocurrió un error en el servidor.");
    // Ni rastro del error de PostgreSQL ni de la pila.
    expect(JSON.stringify(respuesta.body)).not.toMatch(/pool|connect|pg|SELECT|at \w+ \(/i);
  }, 5000);

  it("la siguiente petición también contesta (no quedó nada a medias)", async () => {
    const saludo = await request(app).get("/api/salud");
    const rota = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);

    expect(saludo.status).toBe(200); // la salud no toca la base
    expect(rota.status).toBe(500);
  }, 5000);
});
