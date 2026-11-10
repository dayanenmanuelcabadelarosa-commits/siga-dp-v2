/*
  inventario.integracion.test.js — Inventario contra PostgreSQL.
  --------------------------------------------------------------

  Qué se demuestra aquí:

    · Sin sesión no se entra (401). El mesero no tiene VER_EXISTENCIAS (403).
    · La cocina puede ver existencias e historial, pero no mover ni administrar
      (403), tal como dice la matriz aprobada.
    · El almacén crea insumos y proveedores, registra movimientos y el empleado
      que queda en el movimiento es el de la sesión, no uno inventado.
    · La entrada suma, la salida resta y la base guarda la salida con signo
      negativo. Una salida mayor que la existencia se rechaza (RN-13).
    · El ajuste guarda la diferencia, positiva o negativa, no el conteo final
      (RN-14 y migración 013). Un conteo igual a la existencia no crea nada.
    · Dos salidas simultáneas no pueden dejar la existencia en negativo.
    · Un insumo inactivo no se mueve y un proveedor inactivo no se usa.
    · Cambiar la unidad de un insumo con movimientos se rechaza; sin movimientos
      se permite.
    · Los nombres de insumo y proveedor no se repiten.
    · La lista trae la existencia total por insumo y el historial se puede
      filtrar por insumo.

  Todo pasa por HTTP y por la base de verdad. Antes de cada prueba se vacía el
  inventario y se vuelve a cargar la semilla, para que una prueba no dependa de
  lo que dejó otra.
*/

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarElInventarioComoNuevo,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let tokenCocina;
let tokenAlmacen;
let cuentaAlmacen;

let idUnidadBase;
let idUnidadAlterna;
let idPuntoAlmacen;
let idPuntoCocina;
let contador = 0;

function nuevoNombre(prefijo) {
  contador += 1;
  return `${prefijo} de prueba ${contador}`;
}

function como(token, peticion) {
  return peticion.set("Authorization", `Bearer ${token}`);
}

function datosDeInsumo(extra = {}) {
  return {
    nombre: nuevoNombre("Insumo"),
    id_unidad: idUnidadBase,
    minimo: "5.00",
    ...extra,
  };
}

function datosDeProveedor(extra = {}) {
  return {
    nombre: nuevoNombre("Proveedor"),
    telefono: "809-555-0101",
    ...extra,
  };
}

async function crearInsumoPorApi(extra = {}, token = tokenGerente) {
  const datos = datosDeInsumo(extra);
  const respuesta = await como(token, request(app).post("/api/inventario/insumos")).send(
    datos,
  );

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el insumo de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return { datos, insumo: respuesta.body.datos };
}

async function crearProveedorPorApi(extra = {}, token = tokenGerente) {
  const datos = datosDeProveedor(extra);
  const respuesta = await como(
    token,
    request(app).post("/api/inventario/proveedores"),
  ).send(datos);

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el proveedor de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return { datos, proveedor: respuesta.body.datos };
}

function mover(datos, token = tokenAlmacen) {
  return como(token, request(app).post("/api/inventario/movimientos")).send(datos);
}

async function entrar(insumo, cantidad, extra = {}, token = tokenAlmacen) {
  const proveedor = extra.id_proveedor
    ? { id_proveedor: extra.id_proveedor }
    : await crearProveedorPorApi({}, tokenGerente);

  const respuesta = await mover(
    {
      tipo: "Entrada de compra",
      id_insumo: insumo.id_insumo,
      id_punto: idPuntoAlmacen,
      cantidad,
      detalle: "Factura de prueba",
      id_proveedor: proveedor.proveedor?.id_proveedor ?? proveedor.id_proveedor,
      ...extra,
    },
    token,
  );

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo registrar la entrada de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return respuesta.body.datos;
}

function salir(insumo, cantidad, extra = {}) {
  return mover({
    tipo: "Salida por consumo",
    id_insumo: insumo.id_insumo,
    id_punto: idPuntoAlmacen,
    cantidad,
    detalle: "Consumo de la prueba",
    ...extra,
  });
}

function ajustar(insumo, conteo_fisico, punto = idPuntoAlmacen) {
  return mover({
    tipo: "Ajuste por conteo",
    id_insumo: insumo.id_insumo,
    id_punto: punto,
    conteo_fisico,
  });
}

async function existenciaDe(idInsumo, idPunto = idPuntoAlmacen) {
  const fila = await uno(
    "SELECT existencia FROM existencia WHERE id_insumo = $1 AND id_punto = $2",
    [idInsumo, idPunto],
  );

  return fila?.existencia ?? 0;
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  await dejarElInventarioComoNuevo();

  await crearCuenta({ usuario: "mesero-inv", rol: "mesero" });
  await crearCuenta({ usuario: "cocina-inv", rol: "cocina" });
  cuentaAlmacen = await crearCuenta({ usuario: "almacen-inv", rol: "almacen" });

  const unidadBase = await uno(
    "SELECT id_unidad FROM unidad_medida WHERE nombre = 'Unidad'",
  );
  idUnidadBase = unidadBase.id_unidad;

  const unidadAlterna = await uno(
    `INSERT INTO unidad_medida (nombre, abreviatura)
     VALUES ('Libra de prueba', 'lb')
     ON CONFLICT (nombre) DO UPDATE SET abreviatura = EXCLUDED.abreviatura
     RETURNING id_unidad`,
  );
  idUnidadAlterna = unidadAlterna.id_unidad;

  const almacen = await uno(
    "SELECT id_punto FROM punto_acceso WHERE es_almacen ORDER BY id_punto LIMIT 1",
  );
  idPuntoAlmacen = almacen.id_punto;

  const cocina = await uno(
    `INSERT INTO punto_acceso (nombre, es_almacen)
     VALUES ('Cocina de prueba', FALSE)
     ON CONFLICT (nombre) DO UPDATE SET es_almacen = EXCLUDED.es_almacen
     RETURNING id_punto`,
  );
  idPuntoCocina = cocina.id_punto;
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElInventarioComoNuevo();

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenCocina = await entrarYTomarToken(app, "cocina-inv");
  tokenAlmacen = await entrarYTomarToken(app, "almacen-inv");
});

afterAll(async () => {
  await dejarElInventarioComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ============================================================== autorización */
describe("autorización de /api/inventario", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/inventario");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("el mesero no tiene VER_EXISTENCIAS y recibe 403", async () => {
    const token = await entrarYTomarToken(app, "mesero-inv");

    const lista = await como(token, request(app).get("/api/inventario"));
    expect(lista.status).toBe(403);
    expect(lista.body.error.codigo).toBe("SIN_PERMISO");

    const historial = await como(
      token,
      request(app).get("/api/inventario/movimientos"),
    );
    expect(historial.status).toBe(403);
  });

  it("la cocina ve existencias e historial, pero no mueve ni administra", async () => {
    const { insumo } = await crearInsumoPorApi();

    for (const ruta of ["/api/inventario", "/api/inventario/movimientos"]) {
      const respuesta = await como(tokenCocina, request(app).get(ruta));
      expect(respuesta.status, ruta).toBe(200);
    }

    const proveedores = await como(
      tokenCocina,
      request(app).get("/api/inventario/proveedores"),
    );
    expect(proveedores.status).toBe(403);

    const movimientoCocina = await como(
      tokenCocina,
      request(app).post("/api/inventario/movimientos"),
    ).send({
      tipo: "Salida por consumo",
      id_insumo: insumo.id_insumo,
      id_punto: idPuntoAlmacen,
      cantidad: "1",
      detalle: "Intento de cocina",
    });
    expect(movimientoCocina.status).toBe(403);

    const insumoCocina = await como(
      tokenCocina,
      request(app).post("/api/inventario/insumos"),
    ).send(datosDeInsumo());
    expect(insumoCocina.status).toBe(403);
  });
});

/* ==================================================================== insumos */
describe("insumos", () => {
  it("la lista trae unidades, puntos y la existencia total de cada insumo", async () => {
    const { insumo } = await crearInsumoPorApi();

    await entrar(insumo, "10");
    await entrar(insumo, "2", { id_punto: idPuntoCocina });

    const respuesta = await como(
      tokenGerente,
      request(app).get("/api/inventario"),
    );

    expect(respuesta.status).toBe(200);

    const { insumos, puntos, unidades, existencias } = respuesta.body.datos;
    const fila = insumos.find((item) => item.id_insumo === insumo.id_insumo);

    expect(fila).toMatchObject({
      nombre: insumo.nombre,
      minimo: 5,
      activo: true,
      existencia_total: 12,
    });
    expect(fila.unidad).toBe("Unidad");
    expect(fila.abreviatura).toBe("und");

    expect(puntos.map((punto) => punto.nombre)).toContain("Almacén");
    expect(puntos.map((punto) => punto.nombre)).toContain("Cocina de prueba");
    expect(unidades.map((unidad) => unidad.nombre)).toContain("Unidad");

    expect(existencias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id_insumo: insumo.id_insumo,
          id_punto: idPuntoAlmacen,
          existencia: 10,
        }),
        expect.objectContaining({
          id_insumo: insumo.id_insumo,
          id_punto: idPuntoCocina,
          existencia: 2,
        }),
      ]),
    );
  });

  it("crea un insumo activo, con su unidad y mínimo, y lo deja en cero", async () => {
    const respuesta = await como(
      tokenGerente,
      request(app).post("/api/inventario/insumos"),
    ).send(datosDeInsumo({ nombre: "Pollo entero", minimo: "3.50" }));

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({
      nombre: "Pollo entero",
      id_unidad: idUnidadBase,
      unidad: "Unidad",
      minimo: 3.5,
      activo: true,
      existencia_total: 0,
    });
  });

  it("rechaza nombre repetido, mínimo negativo y unidad inexistente", async () => {
    await crearInsumoPorApi({ nombre: "Arroz" });

    const repetido = await como(
      tokenGerente,
      request(app).post("/api/inventario/insumos"),
    ).send(datosDeInsumo({ nombre: "Arroz" }));
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const negativo = await como(
      tokenGerente,
      request(app).post("/api/inventario/insumos"),
    ).send(datosDeInsumo({ minimo: "-1" }));
    expect(negativo.status).toBe(400);
    expect(negativo.body.error.codigo).toBe("DATOS_INVALIDOS");

    const sinUnidad = await como(
      tokenGerente,
      request(app).post("/api/inventario/insumos"),
    ).send(datosDeInsumo({ id_unidad: 999999 }));
    expect(sinUnidad.status).toBe(400);
    expect(sinUnidad.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("edita nombre y mínimo, lo desactiva y lo reactiva sin borrarlo", async () => {
    const { insumo } = await crearInsumoPorApi();

    const editado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ nombre: "Arroz mejorado", minimo: "8.25" });

    expect(editado.status).toBe(200);
    expect(editado.body.datos).toMatchObject({
      id_insumo: insumo.id_insumo,
      nombre: "Arroz mejorado",
      minimo: 8.25,
      activo: true,
    });

    const desactivado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ activo: false });
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.datos.activo).toBe(false);

    const reactivado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ activo: true });
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.datos.activo).toBe(true);

    const sigue = await uno("SELECT count(*)::int AS cuantos FROM insumo");
    expect(sigue.cuantos).toBe(1);
  });

  it("no cambia la unidad si ya hay movimientos, pero sí antes de moverlo", async () => {
    const { insumo } = await crearInsumoPorApi();
    await entrar(insumo, "4");

    const rechazado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ id_unidad: idUnidadAlterna });

    expect(rechazado.status).toBe(409);
    expect(rechazado.body.error.codigo).toBe("UNIDAD_CON_MOVIMIENTOS");

    const { insumo: sinMovimientos } = await crearInsumoPorApi();

    const permitido = await como(
      tokenGerente,
      request(app).patch(
        `/api/inventario/insumos/${sinMovimientos.id_insumo}`,
      ),
    ).send({ id_unidad: idUnidadAlterna });

    expect(permitido.status).toBe(200);
    expect(permitido.body.datos).toMatchObject({
      id_unidad: idUnidadAlterna,
      unidad: "Libra de prueba",
      abreviatura: "lb",
    });
  });

  it("un insumo inactivo no se puede mover hasta reactivarlo", async () => {
    const { insumo } = await crearInsumoPorApi();

    await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ activo: false });

    const rechazado = await ajustar(insumo, "10");
    expect(rechazado.status).toBe(409);
    expect(rechazado.body.error.codigo).toBe("INSUMO_INACTIVO");

    await como(
      tokenGerente,
      request(app).patch(`/api/inventario/insumos/${insumo.id_insumo}`),
    ).send({ activo: true });

    const aceptado = await ajustar(insumo, "10");
    expect(aceptado.status).toBe(201);
    expect(aceptado.body.datos.existencia).toBe(10);
  });
});

/* ================================================================ proveedores */
describe("proveedores", () => {
  it("se crean, se editan y se desactivan sin borrarse", async () => {
    const { proveedor } = await crearProveedorPorApi({
      nombre: "Avícola del Cibao",
      telefono: "809-555-0101",
    });

    const lista = await como(
      tokenGerente,
      request(app).get("/api/inventario/proveedores"),
    );
    expect(lista.status).toBe(200);
    expect(lista.body.datos.proveedores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id_proveedor: proveedor.id_proveedor,
          nombre: "Avícola del Cibao",
          estado: "Activo",
        }),
      ]),
    );

    const editado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/proveedores/${proveedor.id_proveedor}`),
    ).send({ nombre: "Avícola del Cibao SRL", telefono: "829-555-0202" });

    expect(editado.status).toBe(200);
    expect(editado.body.datos).toMatchObject({
      nombre: "Avícola del Cibao SRL",
      telefono: "829-555-0202",
      estado: "Activo",
    });

    const inactivo = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/proveedores/${proveedor.id_proveedor}`),
    ).send({ estado: "Inactivo" });

    expect(inactivo.status).toBe(200);
    expect(inactivo.body.datos.estado).toBe("Inactivo");

    const reactivado = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/proveedores/${proveedor.id_proveedor}`),
    ).send({ estado: "Activo" });

    expect(reactivado.status).toBe(200);
    expect(reactivado.body.datos.estado).toBe("Activo");

    const sigue = await uno("SELECT count(*)::int AS cuantos FROM proveedor");
    expect(sigue.cuantos).toBe(1);
  });

  it("rechaza nombre repetido y teléfono con letras", async () => {
    await crearProveedorPorApi({ nombre: "Distribuidora Uno" });

    const repetido = await como(
      tokenGerente,
      request(app).post("/api/inventario/proveedores"),
    ).send(datosDeProveedor({ nombre: "Distribuidora Uno" }));
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const telefono = await como(
      tokenGerente,
      request(app).post("/api/inventario/proveedores"),
    ).send(datosDeProveedor({ telefono: "llamar a Juan" }));
    expect(telefono.status).toBe(400);
    expect(telefono.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("un proveedor inactivo no se puede usar en una entrada", async () => {
    const { insumo } = await crearInsumoPorApi();
    const { proveedor } = await crearProveedorPorApi();

    await como(
      tokenGerente,
      request(app).patch(`/api/inventario/proveedores/${proveedor.id_proveedor}`),
    ).send({ estado: "Inactivo" });

    const respuesta = await mover({
      tipo: "Entrada de compra",
      id_insumo: insumo.id_insumo,
      id_punto: idPuntoAlmacen,
      cantidad: "5",
      detalle: "Compra con proveedor inactivo",
      id_proveedor: proveedor.id_proveedor,
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PROVEEDOR_INACTIVO");
    expect(await existenciaDe(insumo.id_insumo)).toBe(0);
  });
});

/* ================================================================ movimientos */
describe("movimientos", () => {
  it("la entrada suma, guarda el proveedor y el empleado de la sesión", async () => {
    const { insumo } = await crearInsumoPorApi();
    const { proveedor } = await crearProveedorPorApi();

    const respuesta = await mover({
      tipo: "Entrada de compra",
      id_insumo: insumo.id_insumo,
      id_punto: idPuntoAlmacen,
      cantidad: "12.50",
      detalle: "Factura 001",
      id_proveedor: proveedor.id_proveedor,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({
      existencia: 12.5,
      existencia_total: 12.5,
      movimiento: {
        tipo: "Entrada de compra",
        id_insumo: insumo.id_insumo,
        insumo: insumo.nombre,
        id_punto: idPuntoAlmacen,
        punto: "Almacén",
        cantidad: 12.5,
        detalle: "Factura 001",
        id_proveedor: proveedor.id_proveedor,
        proveedor: proveedor.nombre,
        id_empleado: cuentaAlmacen.idEmpleado,
      },
    });

    expect(await existenciaDe(insumo.id_insumo)).toBe(12.5);
  });

  it("la salida resta y se guarda negativa; si no alcanza, no toca la existencia", async () => {
    const { insumo } = await crearInsumoPorApi();
    await entrar(insumo, "10");

    const salida = await salir(insumo, "3.25");

    expect(salida.status).toBe(201);
    expect(salida.body.datos).toMatchObject({
      existencia: 6.75,
      existencia_total: 6.75,
      movimiento: { tipo: "Salida por consumo", cantidad: -3.25 },
    });

    const demasiado = await salir(insumo, "99");

    expect(demasiado.status).toBe(409);
    expect(demasiado.body.error.codigo).toBe("EXISTENCIA_INSUFICIENTE");
    expect(await existenciaDe(insumo.id_insumo)).toBe(6.75);

    const movimientos = await uno(
      "SELECT count(*)::int AS cuantos FROM movimiento_inventario WHERE id_insumo = $1",
      [insumo.id_insumo],
    );
    expect(movimientos.cuantos).toBe(2);
  });

  it("el ajuste guarda la diferencia positiva y negativa, no el conteo final", async () => {
    const { insumo } = await crearInsumoPorApi();
    await entrar(insumo, "10");

    const faltante = await ajustar(insumo, "7.50");

    expect(faltante.status).toBe(201);
    expect(faltante.body.datos.movimiento).toMatchObject({
      tipo: "Ajuste por conteo",
      cantidad: -2.5,
    });
    expect(faltante.body.datos.movimiento.detalle).toMatch(
      /había 10.*se contaron 7\.5/,
    );
    expect(faltante.body.datos.existencia).toBe(7.5);

    const sobrante = await ajustar(insumo, "9");

    expect(sobrante.status).toBe(201);
    expect(sobrante.body.datos.movimiento.cantidad).toBe(1.5);
    expect(sobrante.body.datos.existencia).toBe(9);

    const movimientos = await uno(
      "SELECT count(*)::int AS cuantos FROM movimiento_inventario WHERE id_insumo = $1",
      [insumo.id_insumo],
    );
    expect(movimientos.cuantos).toBe(3);
  });

  it("un conteo igual a la existencia no crea movimiento", async () => {
    const { insumo } = await crearInsumoPorApi();
    await entrar(insumo, "10");

    const respuesta = await ajustar(insumo, "10");

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("SIN_DIFERENCIA");
    expect(await existenciaDe(insumo.id_insumo)).toBe(10);

    const movimientos = await uno(
      "SELECT count(*)::int AS cuantos FROM movimiento_inventario WHERE id_insumo = $1",
      [insumo.id_insumo],
    );
    expect(movimientos.cuantos).toBe(1);
  });

  it("dos salidas simultáneas no dejan la existencia en negativo", async () => {
    const { insumo } = await crearInsumoPorApi();
    await entrar(insumo, "10");

    const [primera, segunda] = await Promise.all([
      salir(insumo, "6"),
      salir(insumo, "6"),
    ]);

    expect([primera.status, segunda.status].sort()).toEqual([201, 409]);
    expect(await existenciaDe(insumo.id_insumo)).toBe(4);

    const salidas = await uno(
      `SELECT count(*)::int AS cuantos
         FROM movimiento_inventario
        WHERE id_insumo = $1 AND tipo = 'Salida por consumo'`,
      [insumo.id_insumo],
    );
    expect(salidas.cuantos).toBe(1);
  });

  it("la entrada exige proveedor y una cantidad mayor que cero", async () => {
    const { insumo } = await crearInsumoPorApi();

    const sinProveedor = await mover({
      tipo: "Entrada de compra",
      id_insumo: insumo.id_insumo,
      id_punto: idPuntoAlmacen,
      cantidad: "5",
      detalle: "Compra sin proveedor",
    });
    expect(sinProveedor.status).toBe(400);
    expect(sinProveedor.body.error.codigo).toBe("DATOS_INVALIDOS");

    const cero = await salir(insumo, "0");
    expect(cero.status).toBe(400);
    expect(cero.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("el historial se filtra por insumo y trae los nombres de las relaciones", async () => {
    const { insumo: pollo } = await crearInsumoPorApi({ nombre: "Pollo" });
    const { insumo: arroz } = await crearInsumoPorApi({ nombre: "Arroz" });

    await entrar(pollo, "10");
    await entrar(arroz, "20");

    const todos = await como(
      tokenGerente,
      request(app).get("/api/inventario/movimientos"),
    );
    expect(todos.status).toBe(200);
    expect(todos.body.datos.movimientos).toHaveLength(2);
    expect(todos.body.datos.movimientos[0]).toMatchObject({
      insumo: expect.any(String),
      abreviatura: "und",
      punto: "Almacén",
      proveedor: expect.any(String),
      empleado: expect.any(String),
    });

    const soloPollo = await como(
      tokenGerente,
      request(app).get(
        `/api/inventario/movimientos?id_insumo=${pollo.id_insumo}`,
      ),
    );

    expect(soloPollo.status).toBe(200);
    expect(soloPollo.body.datos.movimientos).toHaveLength(1);
    expect(soloPollo.body.datos.movimientos[0].id_insumo).toBe(
      pollo.id_insumo,
    );
  });

  it("el filtro del historial rechaza un id que no es número", async () => {
    const respuesta = await como(
      tokenGerente,
      request(app).get("/api/inventario/movimientos?id_insumo=pollo"),
    );

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* ============================================================ inmutabilidad */
describe("inmutabilidad del movimiento", () => {
  it("no hay ruta para editar ni borrar un movimiento", async () => {
    const { insumo } = await crearInsumoPorApi();
    const entrada = await entrar(insumo, "5");
    const id = entrada.movimiento.id_movimiento;

    const editar = await como(
      tokenGerente,
      request(app).patch(`/api/inventario/movimientos/${id}`),
    ).send({ cantidad: "99" });

    const borrar = await como(
      tokenGerente,
      request(app).delete(`/api/inventario/movimientos/${id}`),
    );

    expect(editar.status).toBe(404);
    expect(borrar.status).toBe(404);

    const sigue = await sql(
      "SELECT cantidad FROM movimiento_inventario WHERE id_movimiento = $1",
      [id],
    );
    expect(sigue[0].cantidad).toBe(5);
  });
});
