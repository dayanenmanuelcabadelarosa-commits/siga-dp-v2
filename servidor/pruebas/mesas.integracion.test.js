/*
  mesas.integracion.test.js — Mesas y reservas contra PostgreSQL.
  ---------------------------------------------------------------

  Qué se demuestra aquí:

    • Sin sesión no se entra (401) y cada operación respeta su permiso de la
      matriz: ver el mapa (VER_MESAS), asignar mesa (ASIGNAR_MESA), gestionar
      reservas (GESTIONAR_RESERVA) y administrar zonas y mesas
      (ADMINISTRAR_MESAS).
    • El mapa sale de la base, con la zona, la capacidad y el estado reales.
    • Las zonas y las mesas se crean, se editan y se eliminan con las reglas de
      la base: nombre y número únicos, una zona con mesas no se borra y una mesa
      con historial tampoco.
    • Las reservas se crean, se listan por fecha, se editan mientras están
      pendientes, se cancelan con motivo y se abren.
    • Abrir una reserva deja la mesa ocupada con sus personas y su hora de
      llegada, y no deja abrirla si la mesa ya está ocupada o en limpieza.
    • Bajar la capacidad de una mesa no puede invalidar una reserva futura
      (RN-20).

  La base es de verdad. Cada prueba empieza con el salón de la semilla (una zona
  y una mesa) y lo vuelve a dejar así al terminar.
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
} from "./ayudas/api-de-prueba.js";

const app = appDePrueba();

/** Una fecha futura y fija: así la prueba no depende del día en que se corre. */
const FECHA = "2030-01-15";

let tokenGerente;
let tokenAnfitrion;
let tokenMesero;

async function mapa(token = tokenGerente) {
  const respuesta = await request(app)
    .get("/api/mesas")
    .set("Authorization", `Bearer ${token}`);

  expect(respuesta.status).toBe(200);
  return respuesta.body.datos;
}

async function crearZona(token, datos = {}) {
  const respuesta = await request(app)
    .post("/api/mesas/zonas")
    .set("Authorization", `Bearer ${token}`)
    .send({
      nombre: "Terraza",
      tipo_ambiente: "Terraza",
      ...datos,
    });

  expect(respuesta.status).toBe(201);
  return respuesta.body.datos;
}

async function crearMesa(token, datos = {}) {
  const { zonas } = await mapa(token);
  const respuesta = await request(app)
    .post("/api/mesas")
    .set("Authorization", `Bearer ${token}`)
    .send({
      numero: 2,
      id_zona: zonas[0].id_zona,
      capacidad: 4,
      ...datos,
    });

  expect(respuesta.status).toBe(201);
  return respuesta.body.datos;
}

async function crearReserva(token, datos = {}) {
  const mesa = await crearMesa(token);
  const respuesta = await request(app)
    .post("/api/mesas/reservas")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fecha: FECHA,
      hora: "19:30",
      nombre_cliente: "Cliente de prueba",
      telefono: "809-555-0101",
      personas: 2,
      id_mesa: mesa.id_mesa,
      ...datos,
    });

  expect(respuesta.status).toBe(201);
  return respuesta.body.datos;
}

function esperarError(respuesta, estado, codigo) {
  expect(respuesta.status).toBe(estado);
  expect(respuesta.body.ok).toBe(false);
  expect(respuesta.body.error.codigo).toBe(codigo);
}

beforeAll(async () => {
  await dejarLaBaseComoNueva();
  await crearCuenta({ usuario: "anfitrion-mesas", rol: "anfitrion" });
  await crearCuenta({ usuario: "mesero-mesas", rol: "mesero" });
});

beforeEach(async () => {
  await reiniciarCuentas();
  await dejarElSalonComoNuevo();

  tokenGerente = await entrarYTomarToken(app, "gerente");
  tokenAnfitrion = await entrarYTomarToken(app, "anfitrion-mesas");
  tokenMesero = await entrarYTomarToken(app, "mesero-mesas");
});

afterAll(async () => {
  await dejarElSalonComoNuevo();
  await dejarLaBaseComoNueva();
  await cerrarAyudas();
});

describe("seguridad y permisos", () => {
  it("sin sesión no deja ver el mapa", async () => {
    const respuesta = await request(app).get("/api/mesas");

    esperarError(respuesta, 401, "SIN_SESION");
  });

  it("el mesero ve el mapa pero no gestiona reservas ni configura el salón", async () => {
    const verMapa = await request(app)
      .get("/api/mesas")
      .set("Authorization", `Bearer ${tokenMesero}`);

    expect(verMapa.status).toBe(200);

    const verReservas = await request(app)
      .get(`/api/mesas/reservas?fecha=${FECHA}`)
      .set("Authorization", `Bearer ${tokenMesero}`);

    esperarError(verReservas, 403, "SIN_PERMISO");

    const crear = await request(app)
      .post("/api/mesas/zonas")
      .set("Authorization", `Bearer ${tokenMesero}`)
      .send({ nombre: "No puede", tipo_ambiente: "Salón" });

    esperarError(crear, 403, "SIN_PERMISO");
  });

  it("el anfitrión gestiona reservas y mesas, pero no crea zonas ni mesas", async () => {
    const mesa = await crearMesa(tokenGerente);
    const respuestaReserva = await request(app)
      .post("/api/mesas/reservas")
      .set("Authorization", `Bearer ${tokenAnfitrion}`)
      .send({
        fecha: FECHA,
        hora: "19:30",
        nombre_cliente: "Cliente del anfitrión",
        telefono: "809-555-0505",
        personas: 2,
        id_mesa: mesa.id_mesa,
      });

    expect(respuestaReserva.status).toBe(201);
    expect(respuestaReserva.body.datos.estado).toBe("Pendiente");

    const zonaSinPermiso = await request(app)
      .post("/api/mesas/zonas")
      .set("Authorization", `Bearer ${tokenAnfitrion}`)
      .send({ nombre: "No puede", tipo_ambiente: "Salón" });

    esperarError(zonaSinPermiso, 403, "SIN_PERMISO");

    const mesaSinPermiso = await request(app)
      .post("/api/mesas")
      .set("Authorization", `Bearer ${tokenAnfitrion}`)
      .send({
        numero: 99,
        id_zona: (await mapa(tokenAnfitrion)).zonas[0].id_zona,
        capacidad: 2,
      });

    esperarError(mesaSinPermiso, 403, "SIN_PERMISO");
  });
});

describe("mapa de mesas", () => {
  it("devuelve la zona y la mesa de la semilla con su estado", async () => {
    const datos = await mapa();

    expect(datos.zonas).toHaveLength(1);
    expect(datos.zonas[0].nombre).toContain("Salón");
    expect(datos.mesas).toHaveLength(1);
    expect(datos.mesas[0].numero).toBe(1);
    expect(datos.mesas[0].capacidad).toBe(4);
    expect(datos.mesas[0].estado).toBe("libre");
    expect(datos.mesas[0].personas).toBeNull();
  });
});

describe("zonas", () => {
  it("crea una zona y rechaza el mismo nombre con otras mayúsculas", async () => {
    const zona = await crearZona(tokenGerente, {
      nombre: "Terraza",
      tipo_ambiente: "Terraza",
    });

    expect(zona.activo).toBe(true);

    const repetida = await request(app)
      .post("/api/mesas/zonas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ nombre: "TERRAZA", tipo_ambiente: "Terraza" });

    esperarError(repetida, 409, "NOMBRE_DUPLICADO");
  });

  it("edita el nombre y el tipo de ambiente", async () => {
    const zona = await crearZona(tokenGerente);

    const respuesta = await request(app)
      .patch(`/api/mesas/zonas/${zona.id_zona}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ nombre: "Terraza norte", tipo_ambiente: "Privado" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.nombre).toBe("Terraza norte");
    expect(respuesta.body.datos.tipo_ambiente).toBe("Privado");
  });

  it("no elimina una zona que todavía tiene mesas", async () => {
    const { zonas } = await mapa();
    const respuesta = await request(app)
      .delete(`/api/mesas/zonas/${zonas[0].id_zona}`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    esperarError(respuesta, 409, "ZONA_CON_MESAS");
  });

  it("elimina una zona vacía", async () => {
    const zona = await crearZona(tokenGerente);
    const respuesta = await request(app)
      .delete(`/api/mesas/zonas/${zona.id_zona}`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.id_zona).toBe(zona.id_zona);
    expect((await mapa()).zonas.some((z) => z.id_zona === zona.id_zona)).toBe(false);
  });
});

describe("mesas", () => {
  it("crea una mesa en una zona existente", async () => {
    const mesa = await crearMesa(tokenGerente, {
      numero: 7,
      capacidad: 6,
    });

    expect(mesa.numero).toBe(7);
    expect(mesa.capacidad).toBe(6);
    expect(mesa.estado).toBe("libre");
  });

  it("rechaza un número de mesa repetido", async () => {
    const { zonas } = await mapa();
    const respuesta = await request(app)
      .post("/api/mesas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ numero: 1, id_zona: zonas[0].id_zona, capacidad: 4 });

    esperarError(respuesta, 409, "NUMERO_DUPLICADO");
  });

  it("rechaza una zona que no existe", async () => {
    const respuesta = await request(app)
      .post("/api/mesas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ numero: 8, id_zona: 999999, capacidad: 4 });

    esperarError(respuesta, 400, "DATOS_INVALIDOS");
  });

  it("edita número, zona y capacidad", async () => {
    const mesa = await crearMesa(tokenGerente);
    const zona = await crearZona(tokenGerente, {
      nombre: "Barra",
      tipo_ambiente: "Barra",
    });

    const respuesta = await request(app)
      .patch(`/api/mesas/${mesa.id_mesa}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ numero: 10, id_zona: zona.id_zona, capacidad: 8 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.numero).toBe(10);
    expect(respuesta.body.datos.zona).toBe("Barra");
    expect(respuesta.body.datos.capacidad).toBe(8);
  });

  it("no elimina una mesa con reservas", async () => {
    const reserva = await crearReserva(tokenGerente);

    const respuesta = await request(app)
      .delete(`/api/mesas/${reserva.id_mesa}`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    esperarError(respuesta, 409, "MESA_CON_HISTORIAL");
  });

  it("elimina una mesa sin historial", async () => {
    const mesa = await crearMesa(tokenGerente);
    const respuesta = await request(app)
      .delete(`/api/mesas/${mesa.id_mesa}`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(respuesta.status).toBe(200);
    expect((await mapa()).mesas.some((m) => m.id_mesa === mesa.id_mesa)).toBe(false);
  });

  it("no baja la capacidad por debajo de una reserva futura", async () => {
    const reserva = await crearReserva(tokenGerente, { personas: 4 });

    const respuesta = await request(app)
      .patch(`/api/mesas/${reserva.id_mesa}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ capacidad: 2 });

    esperarError(respuesta, 409, "CAPACIDAD_MENOR_QUE_RESERVAS");
  });
});

describe("reservas", () => {
  it("crea una reserva y la lista por su fecha", async () => {
    const reserva = await crearReserva(tokenGerente, {
      nombre_cliente: "Ana Pérez",
      telefono: "809-555-0202",
      personas: 3,
    });

    expect(reserva.fecha).toBe(FECHA);
    expect(reserva.hora).toBe("19:30");
    expect(reserva.estado).toBe("Pendiente");
    expect(reserva.mesa_numero).toBe(2);

    const respuesta = await request(app)
      .get(`/api/mesas/reservas?fecha=${FECHA}`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.reservas).toHaveLength(1);
    expect(respuesta.body.datos.reservas[0].nombre_cliente).toBe("Ana Pérez");
  });

  it("no lista reservas de otra fecha", async () => {
    await crearReserva(tokenGerente, { fecha: FECHA });

    const respuesta = await request(app)
      .get("/api/mesas/reservas?fecha=2030-01-16")
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.reservas).toHaveLength(0);
  });

  it("rechaza dos reservas vivas para la misma mesa, fecha y hora (RN-21)", async () => {
    const reserva = await crearReserva(tokenGerente, { hora: "20:00" });

    const respuesta = await request(app)
      .post("/api/mesas/reservas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({
        fecha: FECHA,
        hora: "20:00",
        nombre_cliente: "Otro cliente",
        telefono: "809-555-0303",
        personas: 2,
        id_mesa: reserva.id_mesa,
      });

    esperarError(respuesta, 409, "RESERVA_DUPLICADA");
  });

  it("rechaza una reserva que supera la capacidad (RN-20)", async () => {
    const mesa = await crearMesa(tokenGerente, { capacidad: 2 });

    const respuesta = await request(app)
      .post("/api/mesas/reservas")
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({
        fecha: FECHA,
        hora: "21:00",
        nombre_cliente: "Grupo grande",
        telefono: "809-555-0404",
        personas: 3,
        id_mesa: mesa.id_mesa,
      });

    esperarError(respuesta, 409, "CAPACIDAD_EXCEDIDA");
  });

  it("edita una reserva pendiente", async () => {
    const reserva = await crearReserva(tokenGerente);

    const respuesta = await request(app)
      .patch(`/api/mesas/reservas/${reserva.id_reserva}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({
        hora: "20:30",
        nombre_cliente: "Cliente corregido",
        personas: 3,
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.hora).toBe("20:30");
    expect(respuesta.body.datos.nombre_cliente).toBe("Cliente corregido");
    expect(respuesta.body.datos.personas).toBe(3);
    expect(respuesta.body.datos.estado).toBe("Pendiente");
  });

  it("cancela una reserva pendiente y exige el motivo", async () => {
    const reserva = await crearReserva(tokenGerente);

    const sinMotivo = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/cancelar`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ motivo_cancelacion: "   " });

    esperarError(sinMotivo, 400, "DATOS_INVALIDOS");

    const respuesta = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/cancelar`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ motivo_cancelacion: "El cliente no puede llegar." });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe("Cancelada");
    expect(respuesta.body.datos.motivo_cancelacion).toBe(
      "El cliente no puede llegar.",
    );
  });

  it("no edita ni cancela una reserva ya abierta", async () => {
    const reserva = await crearReserva(tokenGerente);

    await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .expect(200);

    const editar = await request(app)
      .patch(`/api/mesas/reservas/${reserva.id_reserva}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ personas: 1 });

    esperarError(editar, 409, "RESERVA_NO_EDITABLE");

    const cancelar = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/cancelar`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ motivo_cancelacion: "Ya llegó." });

    esperarError(cancelar, 409, "RESERVA_NO_CANCELABLE");
  });
});

describe("abrir una reserva", () => {
  it("deja la reserva abierta y la mesa ocupada con sus personas", async () => {
    const reserva = await crearReserva(tokenGerente, { personas: 3 });

    const respuesta = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.reserva.estado).toBe("Abierta");
    expect(respuesta.body.datos.mesa.estado).toBe("ocupada");
    expect(respuesta.body.datos.mesa.personas).toBe(3);
    expect(respuesta.body.datos.mesa.hora_llegada).not.toBeNull();
  });

  it("no abre una reserva si la mesa ya está ocupada", async () => {
    const reserva = await crearReserva(tokenGerente);

    const ocupar = await request(app)
      .patch(`/api/mesas/${reserva.id_mesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "ocupada", personas: 2 });

    expect(ocupar.status).toBe(200);

    const respuesta = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    esperarError(respuesta, 409, "MESA_OCUPADA");
  });

  it("no abre una reserva si quedó un pedido abierto de un servicio anterior", async () => {
    const reserva = await crearReserva(tokenGerente);
    const empleados = await sql(
      "SELECT id_empleado FROM empleado ORDER BY id_empleado LIMIT 1",
    );

    // La API no deja liberar una mesa con servicio abierto. Aquí se fuerza el
    // estado para comprobar la defensa de la ruta de abrir, que es la última
    // barrera antes de pisar un servicio que quedó colgando.
    await sql(
      `UPDATE mesa
          SET estado = 'ocupada', personas = 2, hora_llegada = now()
        WHERE id_mesa = $1`,
      [reserva.id_mesa],
    );
    await sql("SELECT fn_abrir_pedido($1::int, $2::int, 2::smallint)", [
      reserva.id_mesa,
      empleados[0].id_empleado,
    ]);
    await sql(
      `UPDATE mesa
          SET estado = 'libre', personas = NULL, hora_llegada = NULL
        WHERE id_mesa = $1`,
      [reserva.id_mesa],
    );

    const respuesta = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    esperarError(respuesta, 409, "MESA_CON_SERVICIO_ABIERTO");
  });

  it("no abre dos veces la misma reserva", async () => {
    const reserva = await crearReserva(tokenGerente);

    await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .expect(200);

    const respuesta = await request(app)
      .post(`/api/mesas/reservas/${reserva.id_reserva}/abrir`)
      .set("Authorization", `Bearer ${tokenGerente}`);

    esperarError(respuesta, 409, "RESERVA_NO_ABRIBLE");
  });
});

describe("estado de la mesa", () => {
  it("ocupa una mesa libre con personas", async () => {
    const { mesas } = await mapa();
    const mesa = mesas[0];

    const respuesta = await request(app)
      .patch(`/api/mesas/${mesa.id_mesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "ocupada", personas: 4 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe("ocupada");
    expect(respuesta.body.datos.personas).toBe(4);
    expect(respuesta.body.datos.hora_llegada).not.toBeNull();
  });

  it("rechaza más personas que la capacidad (RN-20)", async () => {
    const { mesas } = await mapa();

    const respuesta = await request(app)
      .patch(`/api/mesas/${mesas[0].id_mesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "ocupada", personas: 5 });

    esperarError(respuesta, 409, "CAPACIDAD_EXCEDIDA");
  });

  it("manda una mesa a limpieza y después la libera", async () => {
    const { mesas } = await mapa();
    const idMesa = mesas[0].id_mesa;

    await request(app)
      .patch(`/api/mesas/${idMesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "ocupada", personas: 2 })
      .expect(200);

    const limpieza = await request(app)
      .patch(`/api/mesas/${idMesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "limpieza" });

    expect(limpieza.status).toBe(200);
    expect(limpieza.body.datos.estado).toBe("limpieza");
    expect(limpieza.body.datos.personas).toBeNull();

    const libre = await request(app)
      .patch(`/api/mesas/${idMesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "libre" });

    expect(libre.status).toBe(200);
    expect(libre.body.datos.estado).toBe("libre");
    expect(libre.body.datos.hora_llegada).toBeNull();
  });

  it("no ocupa una mesa que está en limpieza", async () => {
    const { mesas } = await mapa();
    const idMesa = mesas[0].id_mesa;

    await sql("UPDATE mesa SET estado = 'limpieza' WHERE id_mesa = $1", [idMesa]);

    const respuesta = await request(app)
      .patch(`/api/mesas/${idMesa}/estado`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ estado: "ocupada", personas: 2 });

    esperarError(respuesta, 409, "MESA_EN_LIMPIEZA");
  });
});
