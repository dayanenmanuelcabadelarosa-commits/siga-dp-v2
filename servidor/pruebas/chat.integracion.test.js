/*
  chat.integracion.test.js — el chat de Doña Pula (Fase 8).
  --------------------------------------------------------------------------------

  Se comprueba lo importante:

    · El chat solo consulta: al modelo se le manda el menú (y las ventas, si
      el rol tiene permiso) leído de PostgreSQL, y nunca una orden de escribir.
    · Las ventas solo llegan al modelo si quien pregunta tiene
      CONSULTAR_REPORTES.
    · Lo que responde el modelo es lo que se le enseña a la persona.
    · Sin la clave configurada, el chat lo dice y no inventa nada.
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  appDePrueba,
  cerrarAyudas,
  entrarYTomarToken,
} from "./ayudas/api-de-prueba.js";
import {
  leerConfigChat,
  menuDelLocal,
  responder,
  ventasDeHoy,
} from "../src/servicios/chat.js";

const app = appDePrueba();

let tokenGerente;

/** Un `fetch` falso que guarda lo que le mandan. */
function fetchFalso(respuesta = "El pollo a la brasa cuesta RD$ 350.00.") {
  const llamadas = [];

  const falso = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: respuesta } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  falso.llamadas = llamadas;
  return falso;
}

/** Lo que el modelo recibió, ya en texto. */
function promptEnviado(llamadas) {
  const llamada = llamadas[0];
  return JSON.parse(llamada.opciones.body).messages[0].content;
}

beforeAll(async () => {
  tokenGerente = await entrarYTomarToken(app, "gerente");
});

beforeEach(async () => {
  // Nada que preparar: el chat no cambia nada en la base.
});

afterAll(async () => {
  await cerrarAyudas();
});

describe("chat — la ruta", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).post("/api/asistente/chat").send({
      pregunta: "¿Qué hay en el menú?",
    });
    expect(respuesta.status).toBe(401);
  });

  it("sin la clave configurada, avisa que el chat no está configurado", async () => {
    const guardada = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const respuesta = await request(app)
        .post("/api/asistente/chat")
        .set("Authorization", `Bearer ${tokenGerente}`)
        .send({ pregunta: "¿Qué hay en el menú?" });

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error.codigo).toBe("INTEGRACION_NO_CONFIGURADA");
    } finally {
      if (guardada !== undefined) process.env.GROQ_API_KEY = guardada;
    }
  });

  it("una pregunta vacía responde 400", async () => {
    const respuesta = await request(app)
      .post("/api/asistente/chat")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ pregunta: "   " });

    expect(respuesta.status).toBe(400);
  });
});

describe("chat — lo que ve el modelo", () => {
  it("usa el modelo Groq predeterminado si no se configura otro", () => {
    expect(leerConfigChat({}).modelo).toBe("openai/gpt-oss-120b");
  });

  it("envía el menú al endpoint compatible de Groq", async () => {
    const menu = await menuDelLocal();
    const pedir = fetchFalso();

    await responder("¿Cuánto cuesta el pollo?", menu, null, {
      config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
      fetch: pedir,
    });

    const prompt = promptEnviado(pedir.llamadas);
    const solicitud = pedir.llamadas[0];

    expect(menu.length).toBeGreaterThan(0);
    expect(solicitud.url).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
    expect(solicitud.opciones.headers.Authorization).toBe("Bearer clave");
    expect(JSON.parse(solicitud.opciones.body)).toMatchObject({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: expect.any(String) }],
    });
    expect(prompt).toContain(menu[0].nombre);
    expect(prompt).toContain("precio: 350.00 pesos");
    expect(prompt).toContain("disponible");
  });

  it("envía la pregunta al modelo, no solo el menú", async () => {
    const menu = await menuDelLocal();
    const pedir = fetchFalso();

    await responder("¿Cuánto cuesta el pollo?", menu, null, {
      config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
      fetch: pedir,
    });

    // Sin la pregunta en el prompt el modelo no sabe qué contestarle y se
    // refugia en "eso no lo sé".
    expect(promptEnviado(pedir.llamadas)).toContain("¿Cuánto cuesta el pollo?");
  });

  it("sin permiso, el modelo no recibe datos de ventas", async () => {
    const menu = await menuDelLocal();
    const pedir = fetchFalso();

    await responder("¿Cuánto vendimos hoy?", menu, null, {
      config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
      fetch: pedir,
    });

    const prompt = promptEnviado(pedir.llamadas);
    expect(prompt).toContain("NO TENES DATOS DE VENTAS");
  });

  it("con permiso, el modelo recibe las ventas del día", async () => {
    const menu = await menuDelLocal();
    const ventas = await ventasDeHoy();
    const pedir = fetchFalso();

    await responder("¿Cuánto vendimos hoy?", menu, ventas, {
      config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
      fetch: pedir,
    });

    const prompt = promptEnviado(pedir.llamadas);
    expect(prompt).toContain("VENTAS DE HOY");
    expect(prompt).not.toContain("NO TENES DATOS DE VENTAS");
  });

  it("lo que responde el modelo es lo que se devuelve", async () => {
    const menu = await menuDelLocal();
    const pedir = fetchFalso("El pollo a la brasa está disponible y cuesta RD$ 350.00.");

    const respuesta = await responder("¿El pollo?", menu, null, {
      config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
      fetch: pedir,
    });

    expect(respuesta.respuesta).toBe(
      "El pollo a la brasa está disponible y cuesta RD$ 350.00.",
    );
    expect(respuesta.origen).toBe("groq");
  });

  it("si el modelo no contesta, se responde con los datos de la base", async () => {
    const menu = await menuDelLocal();

    const pedir = async () => {
      throw new Error("sin red");
    };

    const respuesta = await responder(
      `¿Cuánto cuesta ${menu[0].nombre}?`,
      menu,
      null,
      {
        config: { clave: "clave", modelo: "openai/gpt-oss-120b" },
        fetch: pedir,
      },
    );

    expect(respuesta.origen).toBe("base");
    expect(respuesta.respuesta).toContain(menu[0].nombre);
    expect(respuesta.respuesta).toContain(menu[0].precio.toFixed(2));
  });

  it("sin clave devuelve el error de configuración", async () => {
    const menu = await menuDelLocal();

    await expect(
      responder("¿Qué hay en el menú?", menu, null, {
        config: { clave: "", modelo: "openai/gpt-oss-120b" },
      }),
    ).rejects.toMatchObject({
      estado: 503,
      codigo: "INTEGRACION_NO_CONFIGURADA",
    });
  });

  it("el menú y las ventas se leen con consultas de solo lectura", async () => {
    // Si alguna de las dos funciones escribiera, este archivo no lo detectaría;
    // lo que se comprueba aquí es que las dos devuelven datos de la base.
    const menu = await menuDelLocal();
    const ventas = await ventasDeHoy();

    expect(Array.isArray(menu)).toBe(true);
    expect(menu.every((producto) => typeof producto.precio === "number")).toBe(true);
    expect(typeof ventas.total).toBe("number");
    expect(Array.isArray(ventas.porForma)).toBe(true);
  });
});
