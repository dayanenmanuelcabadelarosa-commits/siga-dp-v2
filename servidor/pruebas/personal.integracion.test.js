/*
  personal.integracion.test.js — el módulo de Personal y usuarios, contra PostgreSQL.
  ---------------------------------------------------------------------------------

  Qué se demuestra aquí:

    · Sin sesión no se entra (401) y con un rol sin permiso tampoco (403).
    · Crear un empleado y su cuenta es UNA sola operación: si el usuario se
      repite, el empleado no queda huérfano.
    · La cédula y el usuario son únicos, y el usuario se guarda en minúsculas.
    · Editar el rol surte efecto en la siguiente petición, sin volver a entrar
      (RN-23).
    · Dar de baja deja Inactivos al empleado y a su cuenta, y el token que tenía
      abierto deja de servir en el acto.
    · Reactivar devuelve el acceso.
    · Tres intentos fallidos bloquean (RN-24) y solo un administrador desbloquea.
    · Cambiar la clave no desbloquea por sí solo: son dos acciones distintas.
    · Un gerente no puede administrar al dueño (nivel superior), ni crear un
      dueño, ni cambiarse el rol, ni darse de baja a sí mismo.
    · Ninguna respuesta devuelve el hash de la clave.

  Todo pasa por HTTP y por la base de verdad. No hay dobles de prueba.
*/

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appDePrueba,
  cerrarAyudas,
  crearCuenta,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  pedirEntrar,
  reiniciarCuentas,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let tokenGerente;
let gerente;
let dueno;
let idRolMesero;
let idRolCajero;
let idRolDueno;
let contador = 0;

const CLAVE_DE_PRUEBA = "clave-de-prueba";

/** Pone el token del gerente en una petición. */
function comoGerente(peticion) {
  return peticion.set("Authorization", `Bearer ${tokenGerente}`);
}

/**
 * Datos válidos y únicos para crear un empleado. Cada llamada cambia la cédula
 * y el usuario, para que una prueba no choque con otra.
 */
function datosDeEmpleado(extra = {}) {
  contador += 1;
  const numero = String(contador).padStart(7, "0");

  return {
    cedula: `40-${numero}-1`,
    nombre: `Empleado de prueba ${contador}`,
    telefono: "809-555-0101",
    id_rol: idRolMesero,
    usuario: `empleado${contador}`,
    clave: CLAVE_DE_PRUEBA,
    ...extra,
  };
}

function crearPorApi(datos) {
  return comoGerente(request(app).post("/api/personal")).send(datos);
}

async function crearEmpleadoPorApi(extra = {}) {
  const datos = datosDeEmpleado(extra);
  const respuesta = await crearPorApi(datos);

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el empleado de la prueba (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return { datos, empleado: respuesta.body.datos };
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();

  gerente = await uno(
    `SELECT u.id_usuario, u.id_empleado
       FROM usuario u
      WHERE u.usuario = 'gerente'`,
  );

  dueno = await crearCuenta({ usuario: "dueno-de-prueba", rol: "dueno" });
  await crearCuenta({ usuario: "mesero-de-prueba", rol: "mesero" });

  idRolMesero = (await uno(`SELECT id_rol FROM rol WHERE codigo = 'mesero'`)).id_rol;
  idRolCajero = (await uno(`SELECT id_rol FROM rol WHERE codigo = 'cajero'`)).id_rol;
  idRolDueno = (await uno(`SELECT id_rol FROM rol WHERE codigo = 'dueno'`)).id_rol;
});

beforeEach(async () => {
  await reiniciarCuentas();
  tokenGerente = await entrarYTomarToken(app, "gerente");
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ============================================================== autorización */
describe("autorización de /api/personal", () => {
  it("sin sesión responde 401", async () => {
    const respuesta = await request(app).get("/api/personal");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("con un rol sin ADMINISTRAR_PERSONAL responde 403", async () => {
    const token = await entrarYTomarToken(app, "mesero-de-prueba");

    const respuesta = await request(app)
      .get("/api/personal")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("el gerente ve la lista y solo los roles que puede asignar", async () => {
    const respuesta = await comoGerente(request(app).get("/api/personal"));

    expect(respuesta.status).toBe(200);

    const { empleados, roles } = respuesta.body.datos;
    expect(empleados.map((fila) => fila.usuario)).toContain("gerente");
    expect(roles.map((rol) => rol.codigo)).toContain("gerente");
    expect(roles.map((rol) => rol.codigo)).not.toContain("dueno");
    expect(JSON.stringify(respuesta.body)).not.toContain("clave_hash");
  });

  it("el dueño sí ve el rol de dueño", async () => {
    const token = await entrarYTomarToken(app, "dueno-de-prueba");

    const respuesta = await request(app)
      .get("/api/personal")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.roles.map((rol) => rol.codigo)).toContain("dueno");
  });
});

/* ==================================================================== crear */
describe("POST /api/personal", () => {
  it("crea el empleado y su cuenta en una sola operación", async () => {
    const datos = datosDeEmpleado();

    const respuesta = await crearPorApi(datos);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toMatchObject({
      cedula: datos.cedula,
      nombre: datos.nombre,
      usuario: datos.usuario,
      rol: "mesero",
      estado: "Activo",
    });
    expect(respuesta.body.datos.id_empleado).toBeTypeOf("number");
    expect(respuesta.body.datos.id_usuario).toBeTypeOf("number");

    const guardado = await uno(
      `SELECT e.cedula, e.nombre, u.usuario, u.clave_hash
         FROM empleado e
         JOIN usuario u ON u.id_empleado = e.id_empleado
        WHERE e.cedula = $1`,
      [datos.cedula],
    );

    expect(guardado).not.toBeNull();
    expect(guardado.usuario).toBe(datos.usuario);
    expect(guardado.clave_hash).not.toBe(datos.clave);
    expect(guardado.clave_hash).toContain("$");

    // La cuenta nueva puede entrar de verdad.
    const token = await entrarYTomarToken(app, datos.usuario, datos.clave);
    expect(token).toBeTypeOf("string");
  });

  it("guarda el usuario en minúsculas y no deja repetirlo", async () => {
    const datos = datosDeEmpleado();
    datos.usuario = datos.usuario.toUpperCase();

    const respuesta = await crearPorApi(datos);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.usuario).toBe(datos.usuario.toLowerCase());

    const repetido = await crearPorApi(
      datosDeEmpleado({ usuario: datos.usuario.toLowerCase() }),
    );

    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe("USUARIO_DUPLICADO");
  });

  it("rechaza una cédula repetida", async () => {
    const primero = await crearEmpleadoPorApi();

    const repetido = await crearPorApi(
      datosDeEmpleado({ cedula: primero.datos.cedula }),
    );

    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe("CEDULA_DUPLICADA");
  });

  it("si el usuario se repite, el empleado no queda huérfano", async () => {
    const primero = await crearEmpleadoPorApi();

    const datos = datosDeEmpleado({ usuario: primero.empleado.usuario });
    const respuesta = await crearPorApi(datos);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("USUARIO_DUPLICADO");

    const huerfano = await uno(
      `SELECT id_empleado FROM empleado WHERE cedula = $1`,
      [datos.cedula],
    );

    expect(huerfano).toBeNull();
  });

  it("exige una clave de al menos 8 caracteres", async () => {
    const respuesta = await crearPorApi(datosDeEmpleado({ clave: "1234567" }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.mensaje).toMatch(/al menos 8/);
  });

  it("rechaza un usuario con espacios y un teléfono inválido", async () => {
    const conEspacio = await crearPorApi(
      datosDeEmpleado({ usuario: "con espacio" }),
    );
    expect(conEspacio.status).toBe(400);

    const conTelefonoMalo = await crearPorApi(
      datosDeEmpleado({ telefono: "no-es-telefono" }),
    );
    expect(conTelefonoMalo.status).toBe(400);
  });

  it("un gerente no puede crear un dueño", async () => {
    const datos = datosDeEmpleado({ id_rol: idRolDueno });

    const respuesta = await crearPorApi(datos);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");

    const noCreado = await uno(
      `SELECT id_empleado FROM empleado WHERE cedula = $1`,
      [datos.cedula],
    );
    expect(noCreado).toBeNull();
  });

  it("exige elegir un rol que exista", async () => {
    const sinRol = datosDeEmpleado();
    delete sinRol.id_rol;

    const respuesta = await crearPorApi(sinRol);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

/* =================================================================== editar */
describe("PATCH /api/personal/:id", () => {
  it("edita nombre, teléfono y rol", async () => {
    const { empleado } = await crearEmpleadoPorApi();

    const respuesta = await comoGerente(
      request(app).patch(`/api/personal/${empleado.id_empleado}`),
    ).send({
      nombre: "Nombre Corregido",
      telefono: "",
      id_rol: idRolCajero,
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({
      nombre: "Nombre Corregido",
      telefono: null,
      rol: "cajero",
    });

    const guardado = await uno(
      `SELECT e.nombre, e.telefono, r.codigo
         FROM empleado e
         JOIN rol r ON r.id_rol = e.id_rol
        WHERE e.id_empleado = $1`,
      [empleado.id_empleado],
    );

    expect(guardado).toEqual({
      nombre: "Nombre Corregido",
      telefono: null,
      codigo: "cajero",
    });
  });

  it("el cambio de rol surte efecto en la siguiente petición", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();

    const token = await entrarYTomarToken(app, datos.usuario, datos.clave);

    const antes = await request(app)
      .get("/api/acceso/yo")
      .set("Authorization", `Bearer ${token}`);
    expect(antes.body.datos.usuario.rol).toBe("mesero");

    const cambio = await comoGerente(
      request(app).patch(`/api/personal/${empleado.id_empleado}`),
    ).send({ id_rol: idRolCajero });
    expect(cambio.status).toBe(200);

    // El mismo token, sin volver a entrar, ya trae el rol nuevo.
    const despues = await request(app)
      .get("/api/acceso/yo")
      .set("Authorization", `Bearer ${token}`);
    expect(despues.status).toBe(200);
    expect(despues.body.datos.usuario.rol).toBe("cajero");
  });

  it("rechaza un cuerpo vacío y un empleado que no existe", async () => {
    const vacio = await comoGerente(
      request(app).patch(`/api/personal/${gerente.id_empleado}`),
    ).send({});

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.codigo).toBe("DATOS_INVALIDOS");

    const inexistente = await comoGerente(
      request(app).patch("/api/personal/999999"),
    ).send({ nombre: "Nadie" });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");
  });

  it("un gerente no puede editar al dueño", async () => {
    const respuesta = await comoGerente(
      request(app).patch(`/api/personal/${dueno.idEmpleado}`),
    ).send({ nombre: "Nombre cambiado" });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("nadie se cambia su propio rol", async () => {
    const respuesta = await comoGerente(
      request(app).patch(`/api/personal/${gerente.id_empleado}`),
    ).send({ id_rol: idRolMesero });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/ti mismo/);
  });
});

/* ============================================================ baja y reactivar */
describe("baja y reactivación", () => {
  it("dar de baja inactiva al empleado y a su cuenta, y corta el acceso en el acto", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();
    const token = await entrarYTomarToken(app, datos.usuario, datos.clave);

    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/baja`),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe("Inactivo");

    const estados = await uno(
      `SELECT e.estado AS empleado, u.estado AS usuario
         FROM empleado e
         JOIN usuario u ON u.id_empleado = e.id_empleado
        WHERE e.id_empleado = $1`,
      [empleado.id_empleado],
    );

    expect(estados).toEqual({ empleado: "Inactivo", usuario: "Inactivo" });

    // El token que ya estaba abierto deja de servir en la siguiente petición.
    const yo = await request(app)
      .get("/api/acceso/yo")
      .set("Authorization", `Bearer ${token}`);
    expect(yo.status).toBe(401);
    expect(yo.body.error.codigo).toBe("SIN_SESION");

    const entrar = await pedirEntrar(app, datos.usuario, datos.clave);
    expect(entrar.status).toBe(401);
    expect(entrar.body.error.codigo).toBe("CUENTA_INACTIVA");

    const otraVez = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/baja`),
    );
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe("EMPLEADO_YA_INACTIVO");
  });

  it("reactivar devuelve el acceso a la misma cuenta", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();

    await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/baja`),
    );

    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/reactivar`),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe("Activo");

    const token = await entrarYTomarToken(app, datos.usuario, datos.clave);
    expect(token).toBeTypeOf("string");

    const otraVez = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/reactivar`),
    );
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe("EMPLEADO_YA_ACTIVO");
  });

  it("nadie se da de baja a sí mismo", async () => {
    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${gerente.id_empleado}/baja`),
    );

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/ti mismo/);
  });

  it("un gerente no puede dar de baja al dueño", async () => {
    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${dueno.idEmpleado}/baja`),
    );

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
  });
});

/* ================================================================ desbloquear */
describe("POST /api/personal/:id/desbloquear", () => {
  it("tres intentos fallidos bloquean y el gerente puede habilitar la cuenta", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();

    const primero = await pedirEntrar(app, datos.usuario, "clave-mala");
    expect(primero.status).toBe(401);
    expect(primero.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");

    await pedirEntrar(app, datos.usuario, "clave-mala");
    const tercero = await pedirEntrar(app, datos.usuario, "clave-mala");

    expect(tercero.status).toBe(401);
    expect(tercero.body.error.codigo).toBe("CUENTA_BLOQUEADA");

    const conLaClaveBuena = await pedirEntrar(app, datos.usuario, datos.clave);
    expect(conLaClaveBuena.status).toBe(401);
    expect(conLaClaveBuena.body.error.codigo).toBe("CUENTA_BLOQUEADA");

    const lista = await comoGerente(request(app).get("/api/personal"));
    const fila = lista.body.datos.empleados.find(
      (empleadoDeLaLista) => empleadoDeLaLista.id_empleado === empleado.id_empleado,
    );

    expect(fila.estado).toBe("Bloqueado");
    expect(fila.estado_empleado).toBe("Activo");
    expect(fila.estado_usuario).toBe("Bloqueado");
    expect(fila.intentos_fallidos).toBe(3);

    const desbloqueo = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/desbloquear`),
    );

    expect(desbloqueo.status).toBe(200);
    expect(desbloqueo.body.datos.estado).toBe("Activo");

    const otraVez = await pedirEntrar(app, datos.usuario, datos.clave);
    expect(otraVez.status).toBe(200);

    const repetido = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/desbloquear`),
    );
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe("CUENTA_NO_BLOQUEADA");
  });

  it("no desbloquea a un empleado dado de baja", async () => {
    const { empleado } = await crearEmpleadoPorApi();

    await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/baja`),
    );

    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/desbloquear`),
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("EMPLEADO_INACTIVO");
  });

  it("un gerente no puede desbloquear al dueño", async () => {
    await uno(
      `UPDATE usuario
          SET estado = 'Bloqueado', intentos_fallidos = 3
        WHERE id_usuario = $1
        RETURNING id_usuario`,
      [dueno.idUsuario],
    );

    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${dueno.idEmpleado}/desbloquear`),
    );

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
  });

  it("no hay nada que desbloquear en un empleado sin cuenta", async () => {
    const empleado = await uno(
      `INSERT INTO empleado (cedula, nombre, id_rol)
       VALUES ('40-SIN-CUENTA', 'Sin cuenta', $1)
       RETURNING id_empleado`,
      [idRolMesero],
    );

    const desbloqueo = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/desbloquear`),
    );

    expect(desbloqueo.status).toBe(409);
    expect(desbloqueo.body.error.codigo).toBe("SIN_CUENTA");

    const clave = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/clave`),
    ).send({ clave: "otra-clave-123" });

    expect(clave.status).toBe(409);
    expect(clave.body.error.codigo).toBe("SIN_CUENTA");
  });
});

/* ============================================================= cambio de clave */
describe("POST /api/personal/:id/clave", () => {
  it("cambia la clave: la vieja deja de servir y la nueva entra", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();

    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/clave`),
    ).send({ clave: "clave-nueva-123" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.mensaje).toContain(datos.nombre);

    const conLaVieja = await pedirEntrar(app, datos.usuario, datos.clave);
    expect(conLaVieja.status).toBe(401);
    expect(conLaVieja.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");

    const conLaNueva = await pedirEntrar(app, datos.usuario, "clave-nueva-123");
    expect(conLaNueva.status).toBe(200);
  });

  it("exige mínimo 8 caracteres y un empleado que exista", async () => {
    const { empleado } = await crearEmpleadoPorApi();

    const corta = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/clave`),
    ).send({ clave: "corta" });

    expect(corta.status).toBe(400);
    expect(corta.body.error.mensaje).toMatch(/al menos 8/);

    const inexistente = await comoGerente(
      request(app).post("/api/personal/999999/clave"),
    ).send({ clave: "clave-nueva-123" });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe("NO_ENCONTRADO");
  });

  it("cambiar la clave no desbloquea la cuenta por sí solo", async () => {
    const { datos, empleado } = await crearEmpleadoPorApi();

    await pedirEntrar(app, datos.usuario, "clave-mala");
    await pedirEntrar(app, datos.usuario, "clave-mala");
    const bloqueada = await pedirEntrar(app, datos.usuario, "clave-mala");
    expect(bloqueada.body.error.codigo).toBe("CUENTA_BLOQUEADA");

    const cambio = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/clave`),
    ).send({ clave: "clave-nueva-123" });
    expect(cambio.status).toBe(200);

    const sigueBloqueada = await pedirEntrar(
      app,
      datos.usuario,
      "clave-nueva-123",
    );
    expect(sigueBloqueada.status).toBe(401);
    expect(sigueBloqueada.body.error.codigo).toBe("CUENTA_BLOQUEADA");

    const desbloqueo = await comoGerente(
      request(app).post(`/api/personal/${empleado.id_empleado}/desbloquear`),
    );
    expect(desbloqueo.status).toBe(200);

    const yaEntra = await pedirEntrar(app, datos.usuario, "clave-nueva-123");
    expect(yaEntra.status).toBe(200);
  });

  it("un gerente no puede cambiarle la clave al dueño", async () => {
    const respuesta = await comoGerente(
      request(app).post(`/api/personal/${dueno.idEmpleado}/clave`),
    ).send({ clave: "clave-nueva-123" });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");

    // La clave del dueño sigue siendo la de siempre.
    const token = await entrarYTomarToken(app, "dueno-de-prueba");
    expect(token).toBeTypeOf("string");
  });
});
