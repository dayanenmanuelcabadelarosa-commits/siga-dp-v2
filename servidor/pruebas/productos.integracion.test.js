/*
  productos.integracion.test.js — Productos y catálogo contra PostgreSQL.
  ---------------------------------------------------------------------

  Qué se demuestra aquí:

    · Sin sesión no se entra (401) y un rol sin ADMINISTRAR_PRODUCTOS tampoco (403).
    · El gerente ve productos activos e inactivos, con su categoría, estación y
      precio; el precio llega como número, no como texto.
    · Crear un producto lo deja Disponible y Activo por defecto, y deja rastro en
      la bitácora con el usuario que lo creó.
    · El nombre no se repite, ni cambiando mayúsculas y minúsculas.
    · El precio se valida con dos decimales y mayor que cero; la categoría y la
      estación tienen que existir, y la categoría tiene que estar activa.
    · Editar no cambia la disponibilidad ni el estado de catálogo.
    · La baja es lógica (activo = false), conserva la disponibilidad y se puede
      deshacer; un producto inactivo no se puede marcar agotado/disponible.
    · Una categoría con productos activos no se puede desactivar; con solo
      productos inactivos sí, y entonces esos productos no se pueden reactivar
      hasta cambiarles la categoría.
    · Las estaciones se crean y se renombran; el nombre nuevo se ve en los
      productos que las usan.
    · Ninguna operación borra un producto (RN-16).

  Todo pasa por HTTP y por la base de verdad. Los datos que se crean se confirman
  para que la API los vea, y al final se deja el catálogo como recién sembrado.
*/

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarElCatalogoComoNuevo,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let idCategoriaBase;
let idEstacionBase;
let idCategoriaAlterna;
let nombreCategoriaAlterna;
let idCategoriaInactiva;
let idEstacionAlterna;
let nombreEstacionAlterna;
let contador = 0;

/** Pone el token del gerente en una petición. */
function comoGerente(peticion) {
  return peticion.set("Authorization", `Bearer ${tokenGerente}`);
}

/** Un nombre irrepetible para no chocar con lo que dejaron otras pruebas. */
function nuevoNombre(prefijo) {
  contador += 1;
  return `${prefijo} de prueba ${contador}`;
}

/** Datos válidos para crear un producto. */
function datosDeProducto(extra = {}) {
  return {
    nombre: nuevoNombre("Producto"),
    precio: "123.45",
    id_categoria: idCategoriaBase,
    id_estacion: idEstacionBase,
    ...extra,
  };
}

async function crearProductoPorApi(extra = {}) {
  const datos = datosDeProducto(extra);
  const respuesta = await comoGerente(
    request(app).post("/api/productos"),
  ).send(datos);

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el producto de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return { datos, producto: respuesta.body.datos };
}

async function crearCategoriaPorApi(nombre = nuevoNombre("Categoría")) {
  const respuesta = await comoGerente(
    request(app).post("/api/productos/categorias"),
  ).send({ nombre });

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear la categoría de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return respuesta.body.datos;
}

async function crearEstacionPorApi(nombre = nuevoNombre("Estación")) {
  const respuesta = await comoGerente(
    request(app).post("/api/productos/estaciones"),
  ).send({ nombre });

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear la estación de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return respuesta.body.datos;
}

function cambiarDisponibilidad(id, disponible) {
  return comoGerente(
    request(app).patch(`/api/productos/${id}/disponibilidad`),
  ).send({ disponible });
}

function darDeBaja(id) {
  return comoGerente(request(app).post(`/api/productos/${id}/baja`));
}

function reactivar(id) {
  return comoGerente(request(app).post(`/api/productos/${id}/reactivar`));
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  await dejarElCatalogoComoNuevo();

  await crearCuenta({ usuario: "mesero-prod", rol: "mesero" });

  const categoriaBase = await uno(
    `SELECT id_categoria FROM categoria WHERE activo ORDER BY id_categoria LIMIT 1`,
  );
  const estacionBase = await uno(
    `SELECT id_estacion FROM estacion ORDER BY id_estacion LIMIT 1`,
  );

  idCategoriaBase = categoriaBase.id_categoria;
  idEstacionBase = estacionBase.id_estacion;

  const alterna = await uno(
    `INSERT INTO categoria (nombre)
     VALUES ($1)
     RETURNING id_categoria, nombre`,
    [nuevoNombre("Categoría alterna")],
  );
  idCategoriaAlterna = alterna.id_categoria;
  nombreCategoriaAlterna = alterna.nombre;

  const inactiva = await uno(
    `INSERT INTO categoria (nombre, activo)
     VALUES ($1, false)
     RETURNING id_categoria`,
    [nuevoNombre("Categoría inactiva")],
  );
  idCategoriaInactiva = inactiva.id_categoria;

  const estacionAlterna = await uno(
    `INSERT INTO estacion (nombre)
     VALUES ($1)
     RETURNING id_estacion, nombre`,
    [nuevoNombre("Estación alterna")],
  );
  idEstacionAlterna = estacionAlterna.id_estacion;
  nombreEstacionAlterna = estacionAlterna.nombre;
});

beforeEach(async () => {
  await reiniciarCuentas();
  tokenGerente = await entrarYTomarToken(app, "gerente");
});

afterAll(async () => {
  await dejarElCatalogoComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ============================================================== autorización */
describe("autorización de /api/productos", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/productos");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("un rol sin ADMINISTRAR_PRODUCTOS responde 403", async () => {
    const token = await entrarYTomarToken(app, "mesero-prod");

    const lista = await request(app)
      .get("/api/productos")
      .set("Authorization", `Bearer ${token}`);

    expect(lista.status).toBe(403);
    expect(lista.body.error.codigo).toBe("SIN_PERMISO");

    const crear = await request(app)
      .post("/api/productos")
      .set("Authorization", `Bearer ${token}`)
      .send(datosDeProducto());

    expect(crear.status).toBe(403);
    expect(crear.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("el mesero sí puede consultar qué está disponible para pedir", async () => {
    const { producto: disponible } = await crearProductoPorApi();
    const { producto: agotado } = await crearProductoPorApi();
    await cambiarDisponibilidad(agotado.id_producto, false).expect(200);

    const { producto: inactivo } = await crearProductoPorApi();
    await darDeBaja(inactivo.id_producto).expect(200);

    const token = await entrarYTomarToken(app, "mesero-prod");
    const respuesta = await request(app)
      .get("/api/productos/disponibles")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);

    const ids = respuesta.body.datos.productos.map(
      (producto) => producto.id_producto,
    );

    expect(ids).toContain(disponible.id_producto);
    expect(ids).not.toContain(agotado.id_producto);
    expect(ids).not.toContain(inactivo.id_producto);
  });

  it("sin sesión la lista de disponibles responde 401", async () => {
    const respuesta = await request(app).get("/api/productos/disponibles");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });
});

/* ==================================================================== lista */
describe("GET /api/productos", () => {
  it("devuelve productos activos e inactivos, categorías y estaciones", async () => {
    const { datos: datosActivo, producto: activo } =
      await crearProductoPorApi();
    const { producto: inactivo } = await crearProductoPorApi();

    await darDeBaja(inactivo.id_producto).expect(200);

    const respuesta = await comoGerente(request(app).get("/api/productos"));

    expect(respuesta.status).toBe(200);

    const { productos, categorias, estaciones } = respuesta.body.datos;

    const filaActiva = productos.find(
      (fila) => fila.id_producto === activo.id_producto,
    );

    expect(filaActiva).toMatchObject({
      nombre: datosActivo.nombre,
      categoria: "Platos (desarrollo)",
      categoria_activa: true,
      estacion: "Cocina",
      disponible: true,
      riesgo_agotarse: false,
      activo: true,
    });
    expect(typeof filaActiva.precio).toBe("number");
    expect(filaActiva.precio).toBe(123.45);

    // El inactivo no desaparece de la lista de administración.
    const filaInactiva = productos.find(
      (fila) => fila.id_producto === inactivo.id_producto,
    );

    expect(filaInactiva).toMatchObject({ activo: false, disponible: true });

    expect(
      categorias.some(
        (categoria) =>
          categoria.id_categoria === idCategoriaInactiva &&
          categoria.activo === false,
      ),
    ).toBe(true);
    expect(
      estaciones.some((estacion) => estacion.id_estacion === idEstacionBase),
    ).toBe(true);
  });
});

/* ==================================================================== crear */
describe("POST /api/productos", () => {
  it("crea con los valores por defecto y lo deja en la bitácora", async () => {
    const nombre = `  ${nuevoNombre("Producto con espacios")}  `;

    const respuesta = await comoGerente(
      request(app).post("/api/productos"),
    ).send({
      ...datosDeProducto(),
      nombre,
      precio: "321.99",
    });

    expect(respuesta.status).toBe(201);

    const creado = respuesta.body.datos;

    expect(creado).toMatchObject({
      nombre: nombre.trim(),
      categoria: "Platos (desarrollo)",
      categoria_activa: true,
      estacion: "Cocina",
      precio: 321.99,
      disponible: true,
      riesgo_agotarse: false,
      activo: true,
    });

    const guardado = await uno(
      `SELECT nombre, precio, disponible, riesgo_agotarse, activo
         FROM producto
        WHERE id_producto = $1`,
      [creado.id_producto],
    );

    expect(guardado).toMatchObject({
      nombre: nombre.trim(),
      precio: 321.99,
      disponible: true,
      riesgo_agotarse: false,
      activo: true,
    });

    const auditoria = await uno(
      `SELECT usuario_nombre, detalle, tabla_afectada
         FROM bitacora
        WHERE tabla_afectada = 'producto'
          AND registro_afectado = $1
        ORDER BY id_bitacora DESC
        LIMIT 1`,
      [String(creado.id_producto)],
    );

    expect(auditoria.usuario_nombre).toBe("gerente");
    expect(auditoria.detalle).toContain("INSERT sobre producto");
  });

  it("no deja repetir el nombre, ni cambiando mayúsculas y minúsculas", async () => {
    const { datos } = await crearProductoPorApi();

    const exacto = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), nombre: datos.nombre });

    expect(exacto.status).toBe(409);
    expect(exacto.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const mayusculas = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), nombre: datos.nombre.toUpperCase() });

    expect(mayusculas.status).toBe(409);
    expect(mayusculas.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const filas = await sql(
      `SELECT count(*)::int AS total
         FROM producto
        WHERE lower(nombre) = lower($1)`,
      [datos.nombre],
    );

    expect(filas[0].total).toBe(1);
  });

  it("rechaza precios vacíos, negativos, sin sentido o con más de dos decimales", async () => {
    const preciosInvalidos = ["", "0", "-5", "abc", "10.999", "10000000000"];

    for (const precio of preciosInvalidos) {
      const respuesta = await comoGerente(
        request(app).post("/api/productos"),
      ).send({ ...datosDeProducto(), precio });

      expect(respuesta.status, `precio ${JSON.stringify(precio)}`).toBe(400);
      expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
      expect(respuesta.body.error.mensaje.toLowerCase()).toContain("precio");
    }
  });

  it("rechaza una categoría o una estación que no existen", async () => {
    const sinCategoria = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), id_categoria: 999999 });

    expect(sinCategoria.status).toBe(400);
    expect(sinCategoria.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(sinCategoria.body.error.mensaje).toContain("categoría");

    const sinEstacion = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), id_estacion: 999999 });

    expect(sinEstacion.status).toBe(400);
    expect(sinEstacion.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(sinEstacion.body.error.mensaje).toContain("estación");
  });

  it("rechaza una categoría inactiva", async () => {
    const respuesta = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), id_categoria: idCategoriaInactiva });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("CATEGORIA_INACTIVA");
  });

  it("exige el nombre, el precio, la categoría y la estación", async () => {
    const respuesta = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ nombre: "Solo el nombre" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.mensaje).toContain("precio");
    expect(respuesta.body.error.mensaje).toContain("id_categoria");
    expect(respuesta.body.error.mensaje).toContain("id_estacion");
  });

  it("rechaza un nombre de más de 80 caracteres", async () => {
    const respuesta = await comoGerente(
      request(app).post("/api/productos"),
    ).send({ ...datosDeProducto(), nombre: "x".repeat(81) });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* =================================================================== editar */
describe("PATCH /api/productos/:id", () => {
  it("edita nombre, precio, categoría y estación sin tocar los estados", async () => {
    const { producto } = await crearProductoPorApi();

    const nuevos = {
      nombre: nuevoNombre("Producto editado"),
      precio: "999.99",
      id_categoria: idCategoriaAlterna,
      id_estacion: idEstacionAlterna,
    };

    const respuesta = await comoGerente(
      request(app).patch(`/api/productos/${producto.id_producto}`),
    ).send(nuevos);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({
      ...nuevos,
      precio: 999.99,
      categoria: nombreCategoriaAlterna,
      estacion: nombreEstacionAlterna,
      disponible: true,
      activo: true,
    });

    const guardado = await uno(
      `SELECT nombre, precio, id_categoria, id_estacion, disponible, activo
         FROM producto
        WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardado).toMatchObject({
      nombre: nuevos.nombre,
      precio: 999.99,
      id_categoria: idCategoriaAlterna,
      id_estacion: idEstacionAlterna,
      disponible: true,
      activo: true,
    });
  });

  it("permite cambiar un solo campo y deja lo demás igual", async () => {
    const { producto } = await crearProductoPorApi();

    const respuesta = await comoGerente(
      request(app).patch(`/api/productos/${producto.id_producto}`),
    ).send({ precio: "200.00" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({
      nombre: producto.nombre,
      precio: 200,
      id_categoria: producto.id_categoria,
      id_estacion: producto.id_estacion,
      disponible: true,
      activo: true,
    });
  });

  it("no deja poner un nombre que ya tiene otro producto", async () => {
    const primero = await crearProductoPorApi();
    const segundo = await crearProductoPorApi();

    const respuesta = await comoGerente(
      request(app).patch(`/api/productos/${segundo.producto.id_producto}`),
    ).send({ nombre: primero.datos.nombre });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const guardado = await uno(
      `SELECT nombre FROM producto WHERE id_producto = $1`,
      [segundo.producto.id_producto],
    );

    expect(guardado.nombre).toBe(segundo.datos.nombre);
  });

  it("rechaza mover un producto a una categoría inactiva", async () => {
    const { producto } = await crearProductoPorApi();

    const respuesta = await comoGerente(
      request(app).patch(`/api/productos/${producto.id_producto}`),
    ).send({ id_categoria: idCategoriaInactiva });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("CATEGORIA_INACTIVA");

    const guardado = await uno(
      `SELECT id_categoria FROM producto WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardado.id_categoria).toBe(producto.id_categoria);
  });

  it("rechaza un id que no existe y un cuerpo vacío", async () => {
    const inexistente = await comoGerente(
      request(app).patch("/api/productos/999999"),
    ).send({ precio: "100.00" });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");

    const { producto } = await crearProductoPorApi();

    const vacio = await comoGerente(
      request(app).patch(`/api/productos/${producto.id_producto}`),
    ).send({});

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* ============================================================= disponibilidad */
describe("PATCH /api/productos/:id/disponibilidad", () => {
  it("marca agotado y disponible, y lo guarda", async () => {
    const { producto } = await crearProductoPorApi();

    const agotado = await cambiarDisponibilidad(
      producto.id_producto,
      false,
    );

    expect(agotado.status).toBe(200);
    expect(agotado.body.datos).toMatchObject({
      disponible: false,
      activo: true,
    });

    const guardadoAgotado = await uno(
      `SELECT disponible FROM producto WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardadoAgotado.disponible).toBe(false);

    const disponible = await cambiarDisponibilidad(
      producto.id_producto,
      true,
    );

    expect(disponible.status).toBe(200);
    expect(disponible.body.datos.disponible).toBe(true);
  });

  it("no cambia la disponibilidad de un producto inactivo", async () => {
    const { producto } = await crearProductoPorApi();

    await darDeBaja(producto.id_producto).expect(200);

    const respuesta = await cambiarDisponibilidad(
      producto.id_producto,
      false,
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PRODUCTO_INACTIVO");

    const guardado = await uno(
      `SELECT disponible FROM producto WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardado.disponible).toBe(true);
  });

  it("rechaza un id inexistente y un cuerpo inválido", async () => {
    const inexistente = await cambiarDisponibilidad(999999, false);

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");

    const { producto } = await crearProductoPorApi();

    const invalido = await comoGerente(
      request(app).patch(
        `/api/productos/${producto.id_producto}/disponibilidad`,
      ),
    ).send({ disponible: "no" });

    expect(invalido.status).toBe(400);
    expect(invalido.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* ============================================================== baja/reactivar */
describe("baja y reactivación", () => {
  it("la baja es lógica, conserva la disponibilidad y se puede deshacer", async () => {
    const { producto } = await crearProductoPorApi();

    await cambiarDisponibilidad(producto.id_producto, false).expect(200);

    const baja = await darDeBaja(producto.id_producto);

    expect(baja.status).toBe(200);
    expect(baja.body.datos).toMatchObject({
      activo: false,
      disponible: false,
    });

    const otraBaja = await darDeBaja(producto.id_producto);

    expect(otraBaja.status).toBe(409);
    expect(otraBaja.body.error.codigo).toBe("PRODUCTO_YA_INACTIVO");

    // Sigue en la base: no se borró.
    const guardado = await uno(
      `SELECT activo, disponible FROM producto WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardado).toMatchObject({ activo: false, disponible: false });

    const vuelta = await reactivar(producto.id_producto);

    expect(vuelta.status).toBe(200);
    expect(vuelta.body.datos).toMatchObject({
      activo: true,
      disponible: false,
    });

    const otraVuelta = await reactivar(producto.id_producto);

    expect(otraVuelta.status).toBe(409);
    expect(otraVuelta.body.error.codigo).toBe("PRODUCTO_YA_ACTIVO");
  });

  it("no reactiva un producto cuya categoría está inactiva", async () => {
    const categoria = await crearCategoriaPorApi();
    const { producto } = await crearProductoPorApi({
      id_categoria: categoria.id_categoria,
    });

    await darDeBaja(producto.id_producto).expect(200);

    const desactivar = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ activo: false });

    expect(desactivar.status).toBe(200);
    expect(desactivar.body.datos.activo).toBe(false);

    const bloqueada = await reactivar(producto.id_producto);

    expect(bloqueada.status).toBe(409);
    expect(bloqueada.body.error.codigo).toBe("CATEGORIA_INACTIVA");

    // Se cambia a una categoría activa y ahora sí vuelve.
    const mover = await comoGerente(
      request(app).patch(`/api/productos/${producto.id_producto}`),
    ).send({ id_categoria: idCategoriaBase });

    expect(mover.status).toBe(200);

    const vuelta = await reactivar(producto.id_producto);

    expect(vuelta.status).toBe(200);
    expect(vuelta.body.datos.activo).toBe(true);
  });

  it("rechaza baja y reactivación de un producto inexistente", async () => {
    const baja = await darDeBaja(999999);
    const vuelta = await reactivar(999999);

    expect(baja.status).toBe(404);
    expect(baja.body.error.codigo).toBe("NO_ENCONTRADO");
    expect(vuelta.status).toBe(404);
    expect(vuelta.body.error.codigo).toBe("NO_ENCONTRADO");
  });
});

/* ================================================================ categorías */
describe("categorías", () => {
  it("crea una categoría activa y rechaza nombres repetidos", async () => {
    const nombre = nuevoNombre("Categoría nueva");

    const respuesta = await comoGerente(
      request(app).post("/api/productos/categorias"),
    ).send({ nombre: `  ${nombre}  ` });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({
      nombre,
      activo: true,
    });

    const guardada = await uno(
      `SELECT nombre, activo FROM categoria WHERE id_categoria = $1`,
      [respuesta.body.datos.id_categoria],
    );

    expect(guardada).toMatchObject({ nombre, activo: true });

    const repetida = await comoGerente(
      request(app).post("/api/productos/categorias"),
    ).send({ nombre });

    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const mayusculas = await comoGerente(
      request(app).post("/api/productos/categorias"),
    ).send({ nombre: nombre.toUpperCase() });

    expect(mayusculas.status).toBe(409);
    expect(mayusculas.body.error.codigo).toBe("NOMBRE_DUPLICADO");
  });

  it("rechaza categorías sin nombre o con más de 50 caracteres", async () => {
    const vacia = await comoGerente(
      request(app).post("/api/productos/categorias"),
    ).send({ nombre: "   " });

    expect(vacia.status).toBe(400);
    expect(vacia.body.error.codigo).toBe("DATOS_INVALIDOS");

    const larga = await comoGerente(
      request(app).post("/api/productos/categorias"),
    ).send({ nombre: "x".repeat(51) });

    expect(larga.status).toBe(400);
    expect(larga.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("renombra una categoría y no deja chocar con otra", async () => {
    const categoria = await crearCategoriaPorApi();
    const nuevo = nuevoNombre("Categoría renombrada");

    const respuesta = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ nombre: nuevo });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({
      id_categoria: categoria.id_categoria,
      nombre: nuevo,
      activo: true,
    });

    const otra = await crearCategoriaPorApi();

    const choque = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ nombre: otra.nombre });

    expect(choque.status).toBe(409);
    expect(choque.body.error.codigo).toBe("NOMBRE_DUPLICADO");
  });

  it("desactiva y vuelve a activar una categoría vacía", async () => {
    const categoria = await crearCategoriaPorApi();

    const off = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ activo: false });

    expect(off.status).toBe(200);
    expect(off.body.datos.activo).toBe(false);

    const on = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ activo: true });

    expect(on.status).toBe(200);
    expect(on.body.datos.activo).toBe(true);
  });

  it("no desactiva una categoría que tiene productos activos", async () => {
    const categoria = await crearCategoriaPorApi();
    const { producto } = await crearProductoPorApi({
      id_categoria: categoria.id_categoria,
    });

    const respuesta = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ activo: false });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe(
      "CATEGORIA_CON_PRODUCTOS_ACTIVOS",
    );

    const guardada = await uno(
      `SELECT activo FROM categoria WHERE id_categoria = $1`,
      [categoria.id_categoria],
    );
    const productoGuardado = await uno(
      `SELECT activo FROM producto WHERE id_producto = $1`,
      [producto.id_producto],
    );

    expect(guardada.activo).toBe(true);
    expect(productoGuardado.activo).toBe(true);
  });

  it("sí desactiva una categoría cuyos productos están todos inactivos", async () => {
    const categoria = await crearCategoriaPorApi();
    const { producto } = await crearProductoPorApi({
      id_categoria: categoria.id_categoria,
    });

    await darDeBaja(producto.id_producto).expect(200);

    const respuesta = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({ activo: false });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.activo).toBe(false);

    const lista = await comoGerente(request(app).get("/api/productos"));

    const fila = lista.body.datos.productos.find(
      (item) => item.id_producto === producto.id_producto,
    );

    expect(fila.categoria_activa).toBe(false);

    const vuelta = await reactivar(producto.id_producto);

    expect(vuelta.status).toBe(409);
    expect(vuelta.body.error.codigo).toBe("CATEGORIA_INACTIVA");
  });

  it("rechaza una categoría inexistente y un cuerpo vacío", async () => {
    const inexistente = await comoGerente(
      request(app).patch("/api/productos/categorias/999999"),
    ).send({ activo: false });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");

    const categoria = await crearCategoriaPorApi();

    const vacio = await comoGerente(
      request(app).patch(
        `/api/productos/categorias/${categoria.id_categoria}`,
      ),
    ).send({});

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* ================================================================ estaciones */
describe("estaciones", () => {
  it("crea una estación y rechaza nombres repetidos", async () => {
    const nombre = nuevoNombre("Estación nueva");

    const respuesta = await comoGerente(
      request(app).post("/api/productos/estaciones"),
    ).send({ nombre: `  ${nombre}  ` });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({ nombre });

    const guardada = await uno(
      `SELECT nombre FROM estacion WHERE id_estacion = $1`,
      [respuesta.body.datos.id_estacion],
    );

    expect(guardada.nombre).toBe(nombre);

    const repetida = await comoGerente(
      request(app).post("/api/productos/estaciones"),
    ).send({ nombre });

    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("NOMBRE_DUPLICADO");

    const mayusculas = await comoGerente(
      request(app).post("/api/productos/estaciones"),
    ).send({ nombre: nombre.toUpperCase() });

    expect(mayusculas.status).toBe(409);
    expect(mayusculas.body.error.codigo).toBe("NOMBRE_DUPLICADO");
  });

  it("rechaza estaciones sin nombre o con más de 30 caracteres", async () => {
    const vacia = await comoGerente(
      request(app).post("/api/productos/estaciones"),
    ).send({ nombre: "   " });

    expect(vacia.status).toBe(400);
    expect(vacia.body.error.codigo).toBe("DATOS_INVALIDOS");

    const larga = await comoGerente(
      request(app).post("/api/productos/estaciones"),
    ).send({ nombre: "x".repeat(31) });

    expect(larga.status).toBe(400);
    expect(larga.body.error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("renombra una estación y el producto ve el nombre nuevo", async () => {
    const estacion = await crearEstacionPorApi();
    const { producto } = await crearProductoPorApi({
      id_estacion: estacion.id_estacion,
    });
    const nuevo = nuevoNombre("Estación");

    const respuesta = await comoGerente(
      request(app).patch(
        `/api/productos/estaciones/${estacion.id_estacion}`,
      ),
    ).send({ nombre: nuevo });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({
      id_estacion: estacion.id_estacion,
      nombre: nuevo,
    });

    const lista = await comoGerente(request(app).get("/api/productos"));

    const fila = lista.body.datos.productos.find(
      (item) => item.id_producto === producto.id_producto,
    );

    expect(fila.estacion).toBe(nuevo);

    const otra = await crearEstacionPorApi();

    const choque = await comoGerente(
      request(app).patch(
        `/api/productos/estaciones/${estacion.id_estacion}`,
      ),
    ).send({ nombre: otra.nombre });

    expect(choque.status).toBe(409);
    expect(choque.body.error.codigo).toBe("NOMBRE_DUPLICADO");
  });

  it("rechaza una estación inexistente y un cuerpo vacío", async () => {
    const inexistente = await comoGerente(
      request(app).patch("/api/productos/estaciones/999999"),
    ).send({ nombre: "Nueva" });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");

    const estacion = await crearEstacionPorApi();

    const vacio = await comoGerente(
      request(app).patch(
        `/api/productos/estaciones/${estacion.id_estacion}`,
      ),
    ).send({});

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});
