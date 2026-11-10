/*
  cocina.integracion.test.js — Cocina y estaciones contra PostgreSQL.
  ------------------------------------------------------------------

  Qué se demuestra aquí:

    · Sin sesión no se entra (401). El mesero no tiene CONFIRMAR_PREPARACION
      (403); la cocina y la gerencia sí.
    · Al enviar un pedido se crean comandas por estación y la cocina las ve con
      sus líneas, la mesa, el mesero y la hora de envío.
    · El avance es Pendiente → En preparación → Preparado, y no se puede saltar
      ni repetir.
    · Cada avance deja una fila en `historial_linea` con el empleado de la
      sesión, no con uno inventado.
    · Una comanda que no existe responde 404 y una estación inválida responde
      400.

  Todo pasa por HTTP y por la base de verdad. Antes de cada prueba se deja el
  salón como nuevo (lo que arrastra pedidos, comandas e historial) para que una
  prueba no dependa de lo que dejó otra.
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
let tokenCocina;
let tokenMesero;
let idEmpleadoCocina;
let disponibleOriginal;

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

async function ocuparMesa(numero = 1) {
  await sql(
    "UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() WHERE numero = $1",
    [numero],
  );
}

/**
 * Deja un pedido con una línea enviada a cocina y devuelve las comandas que la
 * cocina ve en ese momento.
 */
async function pedidoEnviado() {
  await ocuparMesa();
  await como(tokenGerente, request(app).post("/api/pedidos/1/abrir")).send({
    comensales: 2,
  });

  await como(tokenGerente, request(app).post("/api/pedidos/1/lineas")).send({
    productoId: 1,
    cantidad: 1,
    observacion: "sin cebolla",
    persona: 1,
  });

  const envio = await como(
    tokenGerente,
    request(app).post("/api/pedidos/1/enviar"),
  ).send({});
  expect(envio.status).toBe(200);

  const lista = await como(
    tokenCocina,
    request(app).get("/api/cocina/comandas"),
  );
  expect(lista.status).toBe(200);

  return lista.body.datos;
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  await crearCuenta({ usuario: "cocina-op", rol: "cocina" });
  await crearCuenta({ usuario: "mesero-op", rol: "mesero" });

  const empleadoCocina = await uno(
    `SELECT e.id_empleado
       FROM empleado e
       JOIN rol r ON r.id_rol = e.id_rol
      WHERE r.codigo = 'cocina'
      ORDER BY e.id_empleado DESC
      LIMIT 1`,
  );
  idEmpleadoCocina = empleadoCocina.id_empleado;

  const productoBase = await uno(
    "SELECT disponible FROM producto WHERE id_producto = 1",
  );
  disponibleOriginal = productoBase.disponible;
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElSalonComoNuevo();
  await sql(
    "UPDATE producto SET disponible = $1 WHERE id_producto = 1",
    [disponibleOriginal],
  );

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenCocina = await entrarYTomarToken(app, "cocina-op");
  tokenMesero = await entrarYTomarToken(app, "mesero-op");
});

afterAll(async () => {
  await dejarElSalonComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ============================================================== autorización */
describe("autorización de /api/cocina", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/cocina/comandas");
    expect(respuesta.status).toBe(401);
  });

  it("el mesero no tiene CONFIRMAR_PREPARACION y recibe 403", async () => {
    const respuesta = await como(
      tokenMesero,
      request(app).get("/api/cocina/comandas"),
    );
    expect(respuesta.status).toBe(403);
  });

  it("la cocina sí puede ver las comandas", async () => {
    const respuesta = await como(
      tokenCocina,
      request(app).get("/api/cocina/comandas"),
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);
  });
});

/* ================================================================ comandas */
describe("comandas en cocina", () => {
  it("al enviar el pedido la cocina ve una comanda con sus líneas", async () => {
    const comandas = await pedidoEnviado();

    expect(comandas.length).toBeGreaterThan(0);
    const comanda = comandas[0];
    expect(comanda.numero).toBeGreaterThan(0);
    expect(comanda.mesa).toBe(1);
    expect(comanda.estado).toBe("Pendiente");
    expect(comanda.estacion).toBeTruthy();
    expect(comanda.mesero).toBeTruthy();
    expect(comanda.lineas.length).toBeGreaterThan(0);

    const linea = comanda.lineas[0];
    expect(linea.producto).toBeTruthy();
    expect(linea.cantidad).toBe(1);
    expect(linea.observacion).toBe("sin cebolla");
    expect(linea.estado).toBe("Pendiente");
  });

  it("la lista se puede filtrar por estación", async () => {
    const comandas = await pedidoEnviado();
    const idEstacion = await uno(
      "SELECT id_estacion FROM estacion WHERE nombre = $1",
      [comandas[0].estacion],
    );

    const filtradas = await como(
      tokenCocina,
      request(app).get(
        `/api/cocina/comandas?estacion=${idEstacion.id_estacion}`,
      ),
    );

    expect(filtradas.status).toBe(200);
    expect(filtradas.body.datos.length).toBeGreaterThan(0);
    expect(
      filtradas.body.datos.every(
        (comanda) => comanda.estacion === comandas[0].estacion,
      ),
    ).toBe(true);
  });

  it("una estación inválida responde 400", async () => {
    const respuesta = await como(
      tokenCocina,
      request(app).get("/api/cocina/comandas?estacion=0"),
    );
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.ok).toBe(false);
  });

  it("las estaciones traen cuántas comandas pendientes tienen", async () => {
    await pedidoEnviado();

    const respuesta = await como(
      tokenCocina,
      request(app).get("/api/cocina/estaciones"),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.length).toBeGreaterThan(0);
    expect(
      respuesta.body.datos.some((estacion) => estacion.pendientes > 0),
    ).toBe(true);
  });
});

/* ================================================================== avance */
describe("avance de una comanda", () => {
  it("iniciar la comanda la deja en preparación y sella la hora de las líneas", async () => {
    const comandas = await pedidoEnviado();
    const idComanda = comandas[0].id_comanda;

    const respuesta = await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/iniciar`),
    ).send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.comanda.estado).toBe("En preparación");
    expect(respuesta.body.datos.comanda.iniciada_en).toBeTruthy();
    expect(
      respuesta.body.datos.comanda.lineas.every(
        (linea) => linea.estado === "En preparación",
      ),
    ).toBe(true);
    expect(
      respuesta.body.datos.comanda.lineas.every((linea) => linea.hora_inicio),
    ).toBe(true);
  });

  it("preparar la comanda la deja lista y sella la hora de las líneas", async () => {
    const comandas = await pedidoEnviado();
    const idComanda = comandas[0].id_comanda;

    await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/iniciar`),
    ).send({});

    const respuesta = await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/preparar`),
    ).send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.comanda.estado).toBe("Preparado");
    expect(
      respuesta.body.datos.comanda.lineas.every(
        (linea) => linea.estado === "Preparado",
      ),
    ).toBe(true);
    expect(
      respuesta.body.datos.comanda.lineas.every((linea) => linea.hora_preparado),
    ).toBe(true);
  });

  it("no se puede preparar una comanda que todavía no se empezó", async () => {
    const comandas = await pedidoEnviado();
    const idComanda = comandas[0].id_comanda;

    const respuesta = await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/preparar`),
    ).send({});

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("CONFLICTO_DE_ESTADO");
  });

  it("no se puede empezar dos veces la misma comanda", async () => {
    const comandas = await pedidoEnviado();
    const idComanda = comandas[0].id_comanda;

    const primera = await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/iniciar`),
    ).send({});
    expect(primera.status).toBe(200);

    const segunda = await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/iniciar`),
    ).send({});
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.codigo).toBe("CONFLICTO_DE_ESTADO");
  });

  it("cada avance queda en el historial con el empleado de la sesión", async () => {
    const comandas = await pedidoEnviado();
    const idComanda = comandas[0].id_comanda;

    await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/iniciar`),
    ).send({});
    await como(
      tokenCocina,
      request(app).post(`/api/cocina/comandas/${idComanda}/preparar`),
    ).send({});

    const historial = await sql(
      `SELECT h.etapa, h.id_empleado, h.detalle
         FROM historial_linea h
         JOIN linea_comanda lc ON lc.id_linea_comanda = h.id_linea_comanda
        WHERE lc.id_comanda = $1
        ORDER BY h.id_historial`,
      [idComanda],
    );

    expect(historial.length).toBeGreaterThanOrEqual(2);
    expect(historial.map((fila) => fila.etapa)).toEqual(
      expect.arrayContaining(["En preparación", "Preparado"]),
    );
    expect(
      historial.every((fila) => fila.id_empleado === idEmpleadoCocina),
    ).toBe(true);
  });

  it("una comanda que no existe responde 404", async () => {
    const respuesta = await como(
      tokenCocina,
      request(app).post("/api/cocina/comandas/999999/iniciar"),
    ).send({});

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("NO_ENCONTRADO");
  });
});

/* ===================================================== agotado y reposición */
describe("disponibilidad para la cocina", () => {
  it("el mesero no puede reportar agotado", async () => {
    const lista = await como(
      tokenMesero,
      request(app).get("/api/cocina/productos"),
    );
    expect(lista.status).toBe(403);

    const cambio = await como(
      tokenMesero,
      request(app).patch("/api/cocina/productos/1/disponibilidad"),
    ).send({ disponible: false });
    expect(cambio.status).toBe(403);
  });

  it("marcar agotado lo deja en la lista con disponible en falso", async () => {
    const cambio = await como(
      tokenCocina,
      request(app).patch("/api/cocina/productos/1/disponibilidad"),
    ).send({ disponible: false });

    expect(cambio.status).toBe(200);
    expect(cambio.body.ok).toBe(true);
    expect(cambio.body.datos.producto.disponible).toBe(false);

    const lista = await como(
      tokenCocina,
      request(app).get("/api/cocina/productos"),
    );
    expect(lista.status).toBe(200);

    const producto = lista.body.datos.find(
      (actual) => actual.id_producto === 1,
    );
    expect(producto).toBeTruthy();
    expect(producto.disponible).toBe(false);
  });

  it("reponer lo vuelve a dejar disponible", async () => {
    await como(
      tokenCocina,
      request(app).patch("/api/cocina/productos/1/disponibilidad"),
    ).send({ disponible: false });

    const cambio = await como(
      tokenCocina,
      request(app).patch("/api/cocina/productos/1/disponibilidad"),
    ).send({ disponible: true });

    expect(cambio.status).toBe(200);
    expect(cambio.body.datos.producto.disponible).toBe(true);
    expect(cambio.body.datos.mensaje).toContain("vuelve a estar disponible");
  });

  it("sin el campo disponible responde 400", async () => {
    const respuesta = await como(
      tokenCocina,
      request(app).patch("/api/cocina/productos/1/disponibilidad"),
    ).send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("un producto que no existe responde 404", async () => {
    const respuesta = await como(
      tokenCocina,
      request(app).patch("/api/cocina/productos/999999/disponibilidad"),
    ).send({ disponible: false });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("NO_ENCONTRADO");
  });

  it("un producto inactivo no se puede marcar ni reponer", async () => {
    const inactivo = await uno(
      `INSERT INTO producto (nombre, id_categoria, id_estacion, precio, activo)
       VALUES (
         'Producto inactivo de la prueba de cocina',
         (SELECT id_categoria FROM categoria ORDER BY id_categoria LIMIT 1),
         (SELECT id_estacion FROM estacion ORDER BY id_estacion LIMIT 1),
         10,
         false
       )
       ON CONFLICT (nombre) DO UPDATE SET activo = false
       RETURNING id_producto`,
    );

    const respuesta = await como(
      tokenCocina,
      request(app).patch(
        `/api/cocina/productos/${inactivo.id_producto}/disponibilidad`,
      ),
    ).send({ disponible: false });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PRODUCTO_INACTIVO");
  });
});
