/*
  integraciones.integracion.test.js — pruebas aisladas de cada API externa (Fase 8).
  ---------------------------------------------------------------------------------

  Estas pruebas NO salen a internet: se les pasa un `fetch` de mentira que
  devuelve la respuesta que se quiere probar. Así se comprueba, sin depender de
  la red ni de tener claves, que el código:

    · Detecta que faltan las credenciales y lo dice claro.
    · Entiende la respuesta de PayPal (token, pedido, captura).
    · Detecta una respuesta que no es JSON.
    · Detecta que no hay conexión.
    · Nunca inventa datos: si el modelo propone un plato que no existe, lo
      descarta; si no hay tiempo estimado, no pone un número.
    · Se recupera de la falla de la API externa sin mentir.

  Y en la base se comprueba que la migración 017 dejó el tiempo estimado y la
  tabla de pagos de PayPal.
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";
import {
  leerConfigAsistente,
  sugerir,
} from "../src/servicios/asistente.js";
import {
  capturarPedido,
  convertirADolares,
  crearPedido,
  diagnostico as diagnosticoDePaypal,
} from "../src/servicios/paypal.js";

const app = appDePrueba();

let tokenGerente;
let tokenMesero;

const CONFIG_PAYPAL = {
  entorno: "sandbox",
  clientId: "cliente-de-prueba",
  clientSecret: "secreto-de-prueba",
  moneda: "USD",
};

/** Un `fetch` falso que responde lo que le pidan. */
function fetchFalso(respuestas) {
  const llamadas = [];

  const falso = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });

    if (url.includes("/v1/oauth2/token")) {
      return respuestas.token ?? respuestaJson({ access_token: "token", expires_in: 3600 });
    }

    if (url.includes("/capture")) {
      return respuestas.capture ?? respuestaJson({});
    }

    if (url.includes("/v2/checkout/orders/")) {
      return respuestas.consulta ?? respuestaJson({});
    }

    return respuestas.pedido ?? respuestaJson({});
  };

  falso.llamadas = llamadas;
  return falso;
}

function respuestaJson(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

function respuestaTexto(texto, estado = 200) {
  return new Response(texto, {
    status: estado,
    headers: { "Content-Type": "text/html" },
  });
}

/**
 * Deja una cuenta abierta en la mesa 1, sin líneas. Sirve para probar las
 * rutas que cobran: lo que importa es que exista el cobro pendiente.
 */
async function crearCuentaAbiertaEnPrueba() {
  const mesa = await uno("SELECT id_mesa FROM mesa WHERE numero = 1");

  // Si ya hay una cuenta abierta de esa mesa, se usa esa.
  const existente = await uno(
    "SELECT id_cuenta FROM cuenta WHERE id_mesa = $1 AND estado = 'Abierta' LIMIT 1",
    [mesa.id_mesa],
  );
  if (existente !== null) return existente;

  const mesero = await uno(
    "SELECT id_empleado FROM empleado ORDER BY id_empleado LIMIT 1",
  );

  const pedido = await uno(
    "INSERT INTO pedido (id_mesa, id_mesero) VALUES ($1, $2) RETURNING id_pedido",
    [mesa.id_mesa, mesero.id_empleado],
  );

  return uno(
    "INSERT INTO cuenta (id_mesa, id_pedido, id_mesero) VALUES ($1, $2, $3) RETURNING id_cuenta",
    [mesa.id_mesa, pedido.id_pedido, mesero.id_empleado],
  );
}

const CATALOGO_DE_PRUEBA = [
  {
    id: 1,
    nombre: "Pollo a la brasa",
    categoria: "Platos",
    estacion: "Cocina",
    precio: 350,
    disponible: true,
    minutosEstimados: 25,
    vendidos: 12,
  },
  {
    id: 2,
    nombre: "Jugo de chinola",
    categoria: "Bebidas",
    estacion: "Barra",
    precio: 100,
    disponible: true,
    minutosEstimados: 5,
    vendidos: 30,
  },
  {
    id: 3,
    nombre: "Sopa de garlic",
    categoria: "Platos",
    estacion: "Cocina",
    precio: 150,
    disponible: true,
    minutosEstimados: null,
    vendidos: 3,
  },
];

describe("Groq — configuración", () => {
  it("usa el modelo predeterminado si no se configura otro", () => {
    expect(leerConfigAsistente({}).modelo).toBe("openai/gpt-oss-120b");
  });
});

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  await crearCuenta({ usuario: "i-mesero", rol: "mesero" });
});

beforeEach(async () => {
  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenMesero = await entrarYTomarToken(app, "i-mesero");
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("PayPal — pruebas aisladas", () => {
  it("sin credenciales lo dice claro y no llama a nadie", async () => {
    const pedir = fetchFalso({});

    await expect(
      crearPedido(500, "CUENTA-1", {
        config: { ...CONFIG_PAYPAL, clientId: "", clientSecret: "" },
        fetch: pedir,
        cache: new Map(),
      }),
    ).rejects.toMatchObject({
      estado: 503,
      codigo: "INTEGRACION_NO_CONFIGURADA",
    });

    expect(pedir.llamadas).toHaveLength(0);
  });

  it("crea el pedido y devuelve el enlace de aprobación", async () => {
    const pedir = fetchFalso({
      pedido: respuestaJson({
        id: "ORDER-1",
        status: "CREATED",
        create_time: "2026-10-20T12:00:00Z",
        purchase_units: [
          {
            reference_id: "CUENTA-7",
            amount: { currency_code: "USD", value: "500.00" },
          },
        ],
        links: [{ rel: "approve", href: "https://paypal.test/approve" }],
      }),
    });

    const pedido = await crearPedido(500, "CUENTA-7", {
      config: CONFIG_PAYPAL,
      fetch: pedir,
      cache: new Map(),
    });

    expect(pedido.id).toBe("ORDER-1");
    expect(pedido.estado).toBe("CREATED");
    expect(pedido.enlace).toBe("https://paypal.test/approve");
    expect(pedido.monto).toBe(500);
  });

  it("si PayPal rechaza las credenciales, avisa con el motivo de PayPal", async () => {
    const pedir = fetchFalso({
      token: respuestaJson(
        { error: "invalid_client", error_description: "credenciales incorrectas" },
        401,
      ),
    });

    await expect(
      crearPedido(500, "CUENTA-7", {
        config: CONFIG_PAYPAL,
        fetch: pedir,
        cache: new Map(),
      }),
    ).rejects.toMatchObject({
      estado: 502,
      codigo: "INTEGRACION_FALLIDA",
    });
  });

  it("si la respuesta no es JSON, lo dice", async () => {
    const pedir = fetchFalso({
      pedido: respuestaTexto("<html>no soy json</html>"),
    });

    await expect(
      crearPedido(500, "CUENTA-7", {
        config: CONFIG_PAYPAL,
        fetch: pedir,
        cache: new Map(),
      }),
    ).rejects.toMatchObject({ codigo: "RESPUESTA_INVALIDA" });
  });

  it("si no hay conexión, lo dice", async () => {
    const pedir = async () => {
      throw new Error("sin red");
    };

    await expect(
      crearPedido(500, "CUENTA-7", {
        config: CONFIG_PAYPAL,
        fetch: pedir,
        cache: new Map(),
      }),
    ).rejects.toMatchObject({ codigo: "INTEGRACION_FALLIDA" });
  });

  it("captura el pago y devuelve el identificador del cobro", async () => {
    const pedir = fetchFalso({
      capture: respuestaJson({
        id: "ORDER-2",
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: "CUENTA-9",
            payments: {
              captures: [
                { id: "PAY-77", status: "COMPLETED", amount: { value: "700.00" } },
              ],
            },
          },
        ],
      }),
    });

    const cobro = await capturarPedido("ORDER-2", {
      config: CONFIG_PAYPAL,
      fetch: pedir,
      cache: new Map(),
    });

    expect(cobro.estado).toBe("COMPLETED");
    expect(cobro.identificadorPago).toBe("PAY-77");
    expect(cobro.monto).toBe(700);
  });

  it("el diagnóstico explica qué falta cuando no hay credenciales", async () => {
    const resultado = await diagnosticoDePaypal({
      config: { ...CONFIG_PAYPAL, clientId: "", clientSecret: "" },
      fetch: fetchFalso({}),
      cache: new Map(),
    });

    expect(resultado.listo).toBe(false);
    expect(resultado.mensaje).toContain("PAYPAL_CLIENT_ID");
  });

  it("convierte pesos a dólares con la tasa del negocio", () => {
    expect(convertirADolares(496, 60)).toBe(8.27);
    expect(convertirADolares(1000, 60)).toBe(16.67);
    expect(convertirADolares(60, 60)).toBe(1);
  });
});

describe("Asistente — pruebas aisladas", () => {
  it("sin clave usa los datos del local y lo avisa", async () => {
    const resultado = await sugerir(
      { catalogo: CATALOGO_DE_PRUEBA, pedido: [], promociones: [] },
      { config: { clave: "", modelo: "openai/gpt-oss-120b" }, fetch: fetchFalso({}) },
    );

    expect(resultado.origen).toBe("base");
    expect(resultado.aviso).toContain("GROQ_API_KEY");
    expect(resultado.sugerencias[0].nombre).toBe("Jugo de chinola");
  });

  it("el modelo elige el plato, pero el precio y el tiempo son del catálogo", async () => {
    const pedir = async () =>
      respuestaJson({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sugerencias: [
                  {
                    nombre: "Pollo a la brasa",
                    motivo: "Es el plato de la casa.",
                    precio: 9999,
                    minutos: 1,
                  },
                ],
              }),
            },
          },
        ],
      });

    const resultado = await sugerir(
      { catalogo: CATALOGO_DE_PRUEBA, pedido: [], promociones: [] },
      {
        config: { clave: "clave-de-prueba", modelo: "openai/gpt-oss-120b" },
        fetch: pedir,
      },
    );

    expect(resultado.origen).toBe("groq");
    expect(resultado.sugerencias[0].precio).toBe(350);
    expect(resultado.sugerencias[0].minutos).toBe(25);
  });

  it("descarta lo que el modelo invente", async () => {
    const pedir = async () =>
      respuestaJson({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sugerencias: [
                  { nombre: "Pizza de camarones", motivo: "No existe." },
                ],
              }),
            },
          },
        ],
      });

    const resultado = await sugerir(
      { catalogo: CATALOGO_DE_PRUEBA, pedido: [], promociones: [] },
      {
        config: { clave: "clave-de-prueba", modelo: "openai/gpt-oss-120b" },
        fetch: pedir,
      },
    );

    expect(resultado.origen).toBe("base");
    expect(resultado.aviso).toContain("no propuso nada del menú");
  });

  it("no inventa minutos: si el plato no tiene tiempo estimado, queda en null", async () => {
    const resultado = await sugerir(
      {
        catalogo: CATALOGO_DE_PRUEBA.filter((producto) => producto.id === 3),
        pedido: [],
        promociones: [],
      },
      { config: { clave: "", modelo: "openai/gpt-oss-120b" }, fetch: fetchFalso({}) },
    );

    expect(resultado.sugerencias[0].minutos).toBeNull();
  });

  it("si la API externa no responde, se avisa y no se finge que respondió", async () => {
    const pedir = async () => {
      throw new Error("sin red");
    };

    const resultado = await sugerir(
      { catalogo: CATALOGO_DE_PRUEBA, pedido: [], promociones: [] },
      {
        config: { clave: "clave-de-prueba", modelo: "openai/gpt-oss-120b" },
        fetch: pedir,
      },
    );

    expect(resultado.origen).toBe("base");
    expect(resultado.aviso).toContain("no respondió");
  });

  it("si la respuesta no es JSON, se avisa", async () => {
    const pedir = async () => respuestaTexto("<html>no soy json</html>", 200);

    const resultado = await sugerir(
      { catalogo: CATALOGO_DE_PRUEBA, pedido: [], promociones: [] },
      {
        config: { clave: "clave-de-prueba", modelo: "openai/gpt-oss-120b" },
        fetch: pedir,
      },
    );

    expect(resultado.origen).toBe("base");
    expect(resultado.aviso).toContain("no respondió");
  });
});

describe("base de datos de integraciones", () => {
  it("el tiempo estimado del producto existe y no puede ser cero", async () => {
    const columnas = await sql(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'producto' AND column_name = 'tiempo_estimado_minutos'",
    );
    expect(columnas).toHaveLength(1);

    const producto = await uno(
      "SELECT id_producto FROM producto ORDER BY id_producto LIMIT 1",
    );

    const guardado = await uno(
      "UPDATE producto SET tiempo_estimado_minutos = 20 WHERE id_producto = $1 RETURNING tiempo_estimado_minutos",
      [producto.id_producto],
    );
    expect(guardado.tiempo_estimado_minutos).toBe(20);

    await expect(
      uno(
        "UPDATE producto SET tiempo_estimado_minutos = 0 WHERE id_producto = $1",
        [producto.id_producto],
      ),
    ).rejects.toThrow();
  });

  it("la tabla de pagos de PayPal existe y guarda el estado", async () => {
    const columnas = await sql(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pago_paypal'",
    );

    expect(columnas.map((columna) => columna.column_name)).toEqual(
      expect.arrayContaining([
        "id_pago_paypal",
        "id_cuenta",
        "id_paypal",
        "referencia",
        "monto",
        "estado",
        "enlace_aprobacion",
      ]),
    );
  });
});

describe("rutas de integraciones — autorización", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/integraciones/estado");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene ADMINISTRAR_PARAMETROS: 403", async () => {
    const respuesta = await request(app)
      .get("/api/integraciones/estado")
      .set("Authorization", `Bearer ${tokenMesero}`);
    expect(respuesta.status).toBe(403);
  });

  it("el gerente ve el estado de las integraciones", async () => {
    /*
      Las claves se quitan para que la prueba no llame a PayPal, a Groq ni a la
      plataforma de facturación de verdad: aquí se comprueba que el diagnóstico
      responde, no que las claves del .env estén bien.
    */
    const guardadas = {
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      IMECF_API_KEY: process.env.IMECF_API_KEY,
    };

    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.GROQ_API_KEY;
    delete process.env.IMECF_API_KEY;

    try {
      const respuesta = await request(app)
        .get("/api/integraciones/estado")
        .set("Authorization", `Bearer ${tokenGerente}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos).toHaveLength(3);
      expect(respuesta.body.datos[0].listo).toBe(false);
    } finally {
      for (const [clave, valor] of Object.entries(guardadas)) {
        if (valor !== undefined) process.env[clave] = valor;
      }
    }
  });

  it("el mesero no pide sugerencias del asistente", async () => {
    const respuesta = await request(app)
      .get("/api/asistente/sugerencias/1")
      .set("Authorization", `Bearer ${tokenMesero}`);
    expect(respuesta.status).toBe(403);
  });

  it("el gerente pide sugerencias y el sistema responde", async () => {
    /*
      Igual que con PayPal: la clave se quita un momento para que la prueba no
      dependa de lo que haya en el .env ni gaste tokens de Groq.
    */
    const guardada = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const respuesta = await request(app)
        .get("/api/asistente/sugerencias/1")
        .set("Authorization", `Bearer ${tokenGerente}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos).toHaveProperty("sugerencias");
    } finally {
      if (guardada !== undefined) {
        process.env.GROQ_API_KEY = guardada;
      }
    }
  });

  it("sin credenciales, PayPal avisa que no está configurado", async () => {
    await crearCuentaAbiertaEnPrueba();

    /*
      Esta prueba no puede depender de lo que haya en el .env de la máquina: si
      ahí hay claves de PayPal, la ruta iría a la API de verdad. Se quitan un
      momento y se vuelven a poner.
    */
    const guardadas = {
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    };

    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;

    try {
      const respuesta = await request(app)
        .post("/api/paypal/pedidos")
        .set("Authorization", `Bearer ${tokenGerente}`)
        .send({ mesa: 1 });

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error.codigo).toBe("INTEGRACION_NO_CONFIGURADA");
    } finally {
      if (guardadas.PAYPAL_CLIENT_ID !== undefined) {
        process.env.PAYPAL_CLIENT_ID = guardadas.PAYPAL_CLIENT_ID;
      }
      if (guardadas.PAYPAL_CLIENT_SECRET !== undefined) {
        process.env.PAYPAL_CLIENT_SECRET = guardadas.PAYPAL_CLIENT_SECRET;
      }
    }
  });

  it("sin cuenta abierta, la ruta de PayPal avisa que no hay cuenta", async () => {
    const respuesta = await request(app)
      .post("/api/paypal/pedidos")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ mesa: 99 });

    expect(respuesta.status).toBe(404);
  });

  it("sin tasa de cambio, la ruta avisa que falta escribirla", async () => {
    await crearCuentaAbiertaEnPrueba();

    const original = await uno(
      "SELECT tasa_cambio_usd::FLOAT8 AS tasa FROM parametro LIMIT 1",
    );
    await sql("UPDATE parametro SET tasa_cambio_usd = NULL");

    try {
      const respuesta = await request(app)
        .post("/api/paypal/pedidos")
        .set("Authorization", `Bearer ${tokenGerente}`)
        .send({ mesa: 1 });

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error.codigo).toBe("INTEGRACION_NO_CONFIGURADA");
      expect(respuesta.body.error.mensaje).toContain("tasa de cambio");
    } finally {
      await sql("UPDATE parametro SET tasa_cambio_usd = $1", [
        original?.tasa ?? 60,
      ]);
    }
  });
});
