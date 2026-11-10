/*
  Pruebas de ejemplo del esqueleto del servidor (Fase 0).

  Qué demuestran:
    1. La aplicación se construye y responde.
    2. El formato de respuesta es el mismo siempre.
    3. Una ruta que no existe contesta 404 con ese mismo formato.
    4. Un JSON mal formado y un cuerpo demasiado grande no cuelgan la petición.
    5. Un error dentro de una ruta async llega al manejador global (asyncHandler).

  Qué NO demuestran todavía: nada de negocio, porque todavía no hay negocio.
  Las pruebas contra PostgreSQL de verdad llegan en la Fase 1 y la Fase 2.
*/

import request from "supertest";
import { describe, expect, it } from "vitest";

import { asyncHandler, crearApp, ErrorDeApi } from "../src/app.js";

describe("GET /api/salud", () => {
  it("responde 200 y estado ok", async () => {
    const respuesta = await request(crearApp()).get("/api/salud");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, datos: { estado: "ok" } });
  });

  it("no expone información interna del sistema", async () => {
    const respuesta = await request(crearApp()).get("/api/salud");
    const texto = JSON.stringify(respuesta.body);

    expect(texto).not.toMatch(/postgres|version|hora|time|uptime|paypal|groq/i);
  });
});

describe("Formato único de respuesta", () => {
  it("una ruta que no existe responde 404 con el formato de error", async () => {
    const respuesta = await request(crearApp()).get("/api/no-existe");

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("NO_ENCONTRADO");
    expect(typeof respuesta.body.error.mensaje).toBe("string");
  });

  it("un JSON mal formado responde 400 y no 500", async () => {
    const respuesta = await request(crearApp())
      .post("/api/salud")
      .set("Content-Type", "application/json")
      .send("{ esto no es json");

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("JSON_INVALIDO");
  });

  it("un cuerpo de más de 100 kb responde 413", async () => {
    const respuesta = await request(crearApp())
      .post("/api/salud")
      .send({ relleno: "x".repeat(101 * 1024) });

    expect(respuesta.status).toBe(413);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("CUERPO_DEMASIADO_GRANDE");
  });
});

describe("asyncHandler", () => {
  it("lleva al manejador global el error de una función async", async () => {
    // Se comprueba el envoltorio tal cual lo usarán las rutas de la Fase 2.
    const esperado = new ErrorDeApi(418, "SOY_UNA_TETERA", "Error de prueba.");
    const envuelto = asyncHandler(async () => {
      await Promise.resolve();
      throw esperado;
    });

    const capturado = await new Promise((resolver) => {
      envuelto({}, {}, resolver);
    });

    expect(capturado).toBe(esperado);
  });

  it("deja pasar el resultado normal sin tocar el manejador de errores", async () => {
    let llamado = false;
    const envuelto = asyncHandler(async () => {
      await Promise.resolve();
    });

    await new Promise((resolver) => {
      envuelto({}, {}, (error) => {
        llamado = true;
        resolver(error);
      });
      // El envoltorio no llama a next() cuando todo sale bien.
      setTimeout(resolver, 10);
    });

    expect(llamado).toBe(false);
  });
});

describe("Seguridad básica", () => {
  it("manda las cabeceras de helmet", async () => {
    const respuesta = await request(crearApp()).get("/api/salud");

    expect(respuesta.headers["x-content-type-options"]).toBe("nosniff");
    expect(respuesta.headers["x-powered-by"]).toBeUndefined();
  });
});
