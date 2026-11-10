/*
  acceso.integracion.test.js — el núcleo del servidor, probado de verdad.
  ---------------------------------------------------------------------

  Qué demuestra (es el criterio de salida de la Fase 2):

    · sin token se responde 401;
    · con el rol equivocado se responde 403;
    · con datos inválidos se responde 400;
    · con un cuerpo enorme se responde 413 (esto ya lo cubre esqueleto.test.js);
    · un error de verdad dentro de una ruta async no deja la petición colgada
      (lo cubre errores.integracion.test.js);
    · el bloqueo tras tres intentos fallidos (RN-24) y la baja inmediata (RN-23).

  Todo contra PostgreSQL de verdad, y todo a través de la API de verdad: se manda
  la petición HTTP y se mira lo que responde el servidor. No hay dobles de prueba
  ni rutas inventadas para la prueba.
*/

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appConFrenos,
  appDePrueba,
  cerrarAyudas,
  CLAVE_DE_DESARROLLO,
  conceder,
  crearCuenta,
  dejarLaBaseComoNueva,
  entrarYTomarToken,
  pedirEntrar,
  reiniciarCuentas,
  sql,
  uno,
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

let mesero;

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  mesero = await crearCuenta({ usuario: "mesero-de-prueba", rol: "mesero" });
});

beforeEach(async () => {
  await reiniciarCuentas();
});

afterAll(async () => {
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

/* ==================================================================== entrar */
describe("POST /api/acceso/entrar", () => {
  it("con las credenciales de la semilla devuelve un token", async () => {
    const respuesta = await pedirEntrar(app, "gerente", CLAVE_DE_DESARROLLO);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);
    expect(typeof respuesta.body.datos.token).toBe("string");
    expect(respuesta.body.datos.token.length).toBeGreaterThan(20);
    expect(new Date(respuesta.body.datos.expira_en).getTime()).toBeGreaterThan(Date.now());
    expect(respuesta.body.datos.usuario.rol).toBe("gerente");
  });

  it("nunca devuelve el hash de la clave", async () => {
    const respuesta = await pedirEntrar(app, "gerente", CLAVE_DE_DESARROLLO);
    const guardado = await uno("SELECT clave_hash FROM usuario WHERE usuario = 'gerente'");

    expect(JSON.stringify(respuesta.body)).not.toContain(guardado.clave_hash);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/clave_hash|\$[a-f0-9]{64}/i);
  });

  it("con la clave equivocada responde 401 y cuenta el intento", async () => {
    const respuesta = await pedirEntrar(app, "gerente", "equivocada");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
    expect(respuesta.body.error.mensaje).toMatch(/quedan 2 intentos/i);

    const cuenta = await uno("SELECT intentos_fallidos FROM usuario WHERE usuario = 'gerente'");
    expect(cuenta.intentos_fallidos).toBe(1);
  });

  it("no se puede averiguar si un usuario existe: la respuesta es idéntica", async () => {
    const inexistente = await pedirEntrar(app, "no-existe-esta-cuenta", "loquesea");
    const claveMala = await pedirEntrar(app, "gerente", "equivocada");

    expect(inexistente.status).toBe(claveMala.status);
    expect(inexistente.body).toEqual(claveMala.body);
  });

  it("tres intentos fallidos bloquean la cuenta (RN-24)", async () => {
    await pedirEntrar(app, "gerente", "mal-1");
    await pedirEntrar(app, "gerente", "mal-2");
    const tercera = await pedirEntrar(app, "gerente", "mal-3");

    expect(tercera.status).toBe(401);
    expect(tercera.body.error.codigo).toBe("CUENTA_BLOQUEADA");

    const cuenta = await uno("SELECT estado, intentos_fallidos FROM usuario WHERE usuario = 'gerente'");
    expect(cuenta.estado).toBe("Bloqueado");
    expect(cuenta.intentos_fallidos).toBe(3);
  });

  it("una cuenta bloqueada no entra ni con la clave correcta (RN-24)", async () => {
    await pedirEntrar(app, "gerente", "mal-1");
    await pedirEntrar(app, "gerente", "mal-2");
    await pedirEntrar(app, "gerente", "mal-3");

    const correcta = await pedirEntrar(app, "gerente", CLAVE_DE_DESARROLLO);

    expect(correcta.status).toBe(401);
    expect(correcta.body.error.codigo).toBe("CUENTA_BLOQUEADA");
    expect(correcta.body.error.mensaje).toMatch(/administrador/i);
  });

  it("una cuenta dada de baja no entra (RN-23)", async () => {
    await sql("UPDATE usuario SET estado = 'Inactivo' WHERE usuario = 'gerente'");

    const respuesta = await pedirEntrar(app, "gerente", CLAVE_DE_DESARROLLO);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("CUENTA_INACTIVA");
  });

  it("con datos inválidos responde 400 y no llega a la base", async () => {
    const sinClave = await request(app).post("/api/acceso/entrar").send({ usuario: "gerente" });
    const vacio = await request(app).post("/api/acceso/entrar").send({ usuario: "  ", clave: "x" });

    expect(sinClave.status).toBe(400);
    expect(sinClave.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(sinClave.body.error.mensaje).toMatch(/clave/i);

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.mensaje).toMatch(/usuario/i);
  });
});

/* =================================================================== sesión */
describe("La sesión viaja en el encabezado Authorization", () => {
  it("sin token responde 401 SIN_SESION", async () => {
    const respuesta = await request(app).get("/api/acceso/yo");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("con un token inventado responde 401", async () => {
    const respuesta = await request(app)
      .get("/api/acceso/yo")
      .set("Authorization", "Bearer esto-no-es-un-token");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("con un token alterado (un carácter cambiado) responde 401", async () => {
    const token = await entrarYTomarToken(app);
    const [cuerpo, firma] = token.split(".");

    /*
      Se cambia el PRIMER carácter de la firma, no el último. No es un detalle: en
      base64url los últimos bits del último carácter son de relleno, así que hay
      cambios de ese carácter que no cambian ni un byte al decodificar, y el token
      seguiría siendo válido. Cambiar el primero siempre altera un byte de verdad.
    */
    const alterado = `${cuerpo}.${firma[0] === "A" ? "B" : "A"}${firma.slice(1)}`;

    const respuesta = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${alterado}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("con un token firmado para una cuenta que no existe responde 401", async () => {
    // Se firma con la clave de verdad, para un usuario que no está en la base.
    const { firmarToken } = await import("../src/acceso/sesion.js");
    const token = firmarToken({ idUsuario: 999999 });

    const respuesta = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("el token por la barra de direcciones NO sirve", async () => {
    // La auditoría (sección 7) manda eliminar el token por query string. Aquí se
    // comprueba que de verdad no se lee de ahí.
    const token = await entrarYTomarToken(app);

    const respuesta = await request(app).get(`/api/acceso/yo?token=${token}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("con una sesión válida devuelve quién soy, con rol y permisos", async () => {
    const token = await entrarYTomarToken(app);

    const respuesta = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario.usuario).toBe("gerente");
    expect(respuesta.body.datos.usuario.rol).toBe("gerente");
    // El gerente tiene las 28 operaciones, según la matriz que aprobó el dueño.
    expect(respuesta.body.datos.permisos).toHaveLength(27);
    expect(respuesta.body.datos.permisos).toContain("CAPTURAR_PEDIDO");
  });

  it("si dan de baja al empleado, la sesión se corta en el acto (RN-23)", async () => {
    const token = await entrarYTomarToken(app);

    const antes = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);
    expect(antes.status).toBe(200);

    await sql("UPDATE empleado SET estado = 'Inactivo' WHERE nombre = 'Gerente de desarrollo'");

    const despues = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);
    expect(despues.status).toBe(401);
    expect(despues.body.error.codigo).toBe("SIN_SESION");
  });

  it("cerrar sesión responde 200", async () => {
    const token = await entrarYTomarToken(app);

    const respuesta = await request(app)
      .post("/api/acceso/salir")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);
  });
});

/* ================================================================== permisos */
describe("Autorización por rol", () => {
  const RUTA = "/api/parametros";

  it("sin sesión, la ruta protegida responde 401 y no 403", async () => {
    const respuesta = await request(app).get(RUTA);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("SIN_SESION");
  });

  it("el gerente, que tiene el permiso en la matriz, responde 200", async () => {
    const token = await entrarYTomarToken(app);

    const respuesta = await request(app).get(RUTA).set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.ok).toBe(true);
    expect(respuesta.body.datos.tasa_impuesto).toBe(18);
    expect(respuesta.body.datos.rnc).toBeTruthy();
  });

  it("el mesero, que no lo tiene, responde 403 y el mensaje dice su rol", async () => {
    const token = await entrarYTomarToken(app, mesero.usuario);

    const respuesta = await request(app).get(RUTA).set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.ok).toBe(false);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISO");
    expect(respuesta.body.error.mensaje).toMatch(/mesero/i);
  });

  it("apagar la casilla en la matriz deja fuera al gerente", async () => {
    await conceder("gerente", "ADMINISTRAR_PARAMETROS", false);
    const token = await entrarYTomarToken(app);

    const respuesta = await request(app).get(RUTA).set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it("encender la casilla deja pasar al mesero: manda la matriz, no el código", async () => {
    await conceder("mesero", "ADMINISTRAR_PARAMETROS");
    const token = await entrarYTomarToken(app, mesero.usuario);

    const respuesta = await request(app).get(RUTA).set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
  });

  it("cada rol tiene lo suyo: apagarle algo al mesero no se lo quita al gerente", async () => {
    await conceder("mesero", "ADMINISTRAR_PARAMETROS", false);
    const tokenDelGerente = await entrarYTomarToken(app);
    const tokenDelMesero = await entrarYTomarToken(app, mesero.usuario);

    const gerente = await request(app).get(RUTA).set("Authorization", `Bearer ${tokenDelGerente}`);
    const delMesero = await request(app)
      .get(RUTA)
      .set("Authorization", `Bearer ${tokenDelMesero}`);

    expect(gerente.status).toBe(200);
    expect(delMesero.status).toBe(403);
  });

  it("el permiso aparece en /api/acceso/yo según la matriz del rol", async () => {
    const token = await entrarYTomarToken(app, mesero.usuario);

    const respuesta = await request(app).get("/api/acceso/yo").set("Authorization", `Bearer ${token}`);
    const permisos = respuesta.body.datos.permisos;

    // El mesero tiene 6 operaciones, y ninguna de administración.
    expect(permisos).toHaveLength(6);
    expect(permisos).toContain("CAPTURAR_PEDIDO");
    expect(permisos).not.toContain("ADMINISTRAR_PERSONAL");
    expect(permisos).not.toContain("ADMINISTRAR_PARAMETROS");
  });
});

/* ==================================================================== frenos */
describe("Límite de peticiones", () => {
  it("corta los intentos de ingreso cuando se pasa del límite", async () => {
    const appConPoco = appConFrenos({ peticiones: 100000, ingresos: 2 });

    await pedirEntrar(appConPoco, "gerente", CLAVE_DE_DESARROLLO);
    await pedirEntrar(appConPoco, "gerente", CLAVE_DE_DESARROLLO);
    const tercera = await pedirEntrar(appConPoco, "gerente", CLAVE_DE_DESARROLLO);

    expect(tercera.status).toBe(429);
    expect(tercera.body.ok).toBe(false);
    expect(tercera.body.error.codigo).toBe("DEMASIADAS_PETICIONES");
  });

  it("corta las peticiones generales cuando se pasa del límite", async () => {
    const appConPoco = appConFrenos({ peticiones: 3, ingresos: 100000 });

    await request(appConPoco).get("/api/no-existe");
    await request(appConPoco).get("/api/no-existe");
    await request(appConPoco).get("/api/no-existe");
    const cuarta = await request(appConPoco).get("/api/no-existe");

    expect(cuarta.status).toBe(429);
    expect(cuarta.body.error.codigo).toBe("DEMASIADAS_PETICIONES");
  });

  it("no frena la ruta de salud: un chequeo automático no puede quedar bloqueado", async () => {
    const appConPoco = appConFrenos({ peticiones: 1, ingresos: 100000 });

    await request(appConPoco).get("/api/salud");
    const segunda = await request(appConPoco).get("/api/salud");

    expect(segunda.status).toBe(200);
  });
});
