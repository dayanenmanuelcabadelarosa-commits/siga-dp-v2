/*
  herramientas/datos-de-demostracion.js — llena la base de desarrollo con una
  jornada completa del asadero, para presentar el sistema.
  ---------------------------------------------------------------------------
  Uso:
    npm run datos:demo

  Qué hace:
    · Zonas, mesas, personal, catálogo, inventario, ofertas y reservas.
    · Una jornada de ayer (cerrada, con corte de caja) y la de hoy (en curso):
      pedidos, comandas, cuentas, cobros, propinas, descuentos, una cortesía,
      una cuenta dividida por comensales, ventas de canal y comprobantes.
    · Todo se arma con las funciones de la base (fn_abrir_pedido, fn_generar_cuenta,
      fn_cobrar_cuenta, fn_cobrar_comensal, fn_emitir_comprobante, fn_cerrar_corte),
      así los totales, el corte y la bitácora salen como los calcula PostgreSQL.

  Cuidado:
    · Solo para la base de DESARROLLO. Si la base es la de pruebas, se niega a
      correr (las pruebas comparan contra una base limpia).
    · Borra los datos de operación que haya y los vuelve a construir.
*/

import "dotenv/config";

import pg from "pg";

import { cifrarClave } from "../src/acceso/claves.js";
import { datosConexion, nombreBase } from "./comun.js";

/* ------------------------------------------------------------------ seguridad */

const nombreDeLaBase = nombreBase();

if (/prueba/i.test(nombreDeLaBase)) {
  console.error(
    `Esta herramienta es solo para la base de desarrollo. La base "${nombreDeLaBase}" es la de pruebas: no se toca.`,
  );
  process.exit(1);
}

const config = datosConexion(nombreDeLaBase);

const cliente = new pg.Client(config);

await cliente.connect();

console.log(`\n  Llenando la base de desarrollo "${config.database}"...\n`);

/* --------------------------------------------------------------------- util */

async function uno(texto, valores = []) {
  const resultado = await cliente.query(texto, valores);
  return resultado.rows[0];
}

async function varios(texto, valores = []) {
  const resultado = await cliente.query(texto, valores);
  return resultado.rows;
}

async function sql(texto, valores = []) {
  await cliente.query(texto, valores);
}

/** La clave de todos los usuarios de prueba: la misma que usa el sistema. */
function hash(contrasena) {
  return cifrarClave(contrasena);
}

/* ------------------------------------------------------------------- limpiar */

await sql(`
  TRUNCATE mesa, reserva, corte_caja, comprobante, descuento, propina, pago,
    asignacion_persona, linea_cuenta, cuenta, linea_comanda, comanda, linea_pedido,
    pedido, movimiento_inventario, existencia, insumo, proveedor, punto_acceso,
    promocion, producto, categoria, estacion, mesa, zona, usuario, empleado
  RESTART IDENTITY CASCADE
`);
await sql(`DELETE FROM bitacora`);
await sql(`UPDATE producto SET id_categoria = id_categoria`);

/* --------------------------------------------------------------- parámetros */

await sql(
  `UPDATE parametro SET
     nombre_empresa = 'ASADERO DOÑA PULA',
     rnc = '131-59982-6',
     direccion = 'Calle Lic. Agustin Acevedo No. G-25, Jardines Metropolitanos, Santiago',
     telefono = '829-770-2834',
     tasa_impuesto = 18,
     tasa_cambio_usd = 60,
     cuenta_pagos = 'paga-donapula@asadero.do'
   WHERE id_parametro = 1
`);

/* ------------------------------------------------------------------- roles */

const roles = {};
for (const rol of await varios(`SELECT id_rol, codigo FROM rol`)) {
  roles[rol.codigo] = rol.id_rol;
}

/* ------------------------------------------------------------------ personal */

const personal = [
  ["Dayan Caba de La Rosa", "dueno", "00101010101"],
  ["Rosa Almonte", "gerente", "00101010102"],
  ["Miguel Santos", "capitan", "00101010103"],
  ["Yokasta Peña", "cajero", "00101010104"],
  ["Wandy Gil", "cajero", "00101010105"],
  ["Héctor Tavárez", "mesero", "00101010106"],
  ["Altagracia Díaz", "mesero", "00101010107"],
  ["Junior Beltré", "mesero", "00101010108"],
  ["Yaritza Núñez", "mesero", "00101010113"],
  ["Wilfredo Peña", "mesero", "00101010114"],
  ["Solange Batista", "mesero", "00101010115"],
  ["María Fernanda", "anfitrion", "00101010109"],
  ["Luis Chase", "cocina", "00101010110"],
  ["Pedro Ureña", "cocina", "00101010111"],
  ["Carmen Rosario", "almacen", "00101010112"],
];

const idEmpleado = {};

for (const [nombre, rol, cedula] of personal) {
  const empleado = await uno(
    `INSERT INTO empleado (cedula, nombre, id_rol, estado, fecha_ingreso)
     VALUES ($1, $2, $3, 'Activo', CURRENT_DATE - 180)
     RETURNING id_empleado`,
    [cedula, nombre, roles[rol]],
  );

  idEmpleado[nombre] = empleado.id_empleado;
}

/* Los usuarios: la clave de todos es la de su rol (la de gerente ya existe). */

const usuarios = [
  ["dueno", "dueno", "Dayan Caba de La Rosa"],
  ["gerente", "gerente", "Rosa Almonte"],
  ["capitan", "capitan", "Miguel Santos"],
  ["cajero", "cajero", "Yokasta Peña"],
  ["cajero2", "cajero", "Wandy Gil"],
  ["mesero1", "mesero", "Héctor Tavárez"],
  ["mesero2", "mesero", "Altagracia Díaz"],
  ["mesero3", "mesero", "Junior Beltré"],
  ["mesero4", "mesero", "Yaritza Núñez"],
  ["mesero5", "mesero", "Wilfredo Peña"],
  ["mesero6", "mesero", "Solange Batista"],
  ["anfitrion", "anfitrion", "María Fernanda"],
  ["cocina", "cocina", "Luis Chase"],
  ["cocina2", "cocina", "Pedro Ureña"],
  ["almacen", "almacen", "Carmen Rosario"],
];

for (const [usuario, , nombre] of usuarios) {
  await sql(
    `INSERT INTO usuario (usuario, clave_hash, id_empleado, estado)
     VALUES ($1, $2, $3, 'Activo')`,
    [usuario, hash(usuario), idEmpleado[nombre]],
  );
}

const meseros = [
  idEmpleado["Héctor Tavárez"],
  idEmpleado["Altagracia Díaz"],
  idEmpleado["Junior Beltré"],
  idEmpleado["Yaritza Núñez"],
  idEmpleado["Wilfredo Peña"],
  idEmpleado["Solange Batista"],
];
const cajeros = [idEmpleado["Yokasta Peña"], idEmpleado["Wandy Gil"]];
const capitan = idEmpleado["Miguel Santos"];

/* ------------------------------------------------------------------- salón */

const zonas = [
  ["Salón Principal", "Salón", [4, 6, 2, 4, 8, 6]],
  ["Terraza", "Terraza", [4, 6, 2]],
  ["Barra", "Barra", [2, 2]],
];

const idMesa = [];

for (const [nombre, tipo, capacidades] of zonas) {
  const zona = await uno(
    `INSERT INTO zona (nombre, tipo_ambiente, activo) VALUES ($1, $2, TRUE) RETURNING id_zona`,
    [nombre, tipo],
  );

  for (const capacidad of capacidades) {
    const mesa = await uno(
      `INSERT INTO mesa (numero, id_zona, capacidad, estado, creado_en)
       VALUES ($1, $2, $3, 'libre', now()) RETURNING id_mesa`,
      [idMesa.length + 1, zona.id_zona, capacidad],
    );
    idMesa.push(mesa.id_mesa);
  }
}

/* ------------------------------------------------------------------ catálogo */

const categorias = [
  "Carnes",
  "Pollos",
  "Entradas",
  "Pescados",
  "Bebidas",
  "Postres",
  "Combos",
  "Platos especiales",
];

const idCategoria = {};
for (const nombre of categorias) {
  const fila = await uno(
    `INSERT INTO categoria (nombre, activo) VALUES ($1, TRUE) RETURNING id_categoria`,
    [nombre],
  );
  idCategoria[nombre] = fila.id_categoria;
}

const estaciones = ["Parrilla", "Fritura", "Cocina", "Barra", "Horno", "Postres"];
const idEstacion = {};
for (const nombre of estaciones) {
  const fila = await uno(
    `INSERT INTO estacion (nombre) VALUES ($1) RETURNING id_estacion`,
    [nombre],
  );
  idEstacion[nombre] = fila.id_estacion;
}

/* [nombre, categoria, estacion, precio, minutos, disponible, riesgo] */
const productos = [
  ["Costilla de res a la parrilla", "Carnes", "Parrilla", 1250, 25, true, false],
  ["Chuletón de res 12 oz", "Carnes", "Parrilla", 1150, 22, true, false],
  ["Tira de res al carbón", "Carnes", "Parrilla", 980, 20, true, true],
  ["Parrillada de chivo", "Carnes", "Parrilla", 1350, 28, true, false],
  ["Pollo a la brasa", "Pollos", "Parrilla", 650, 22, true, false],
  ["Pollo frito con tajadas", "Pollos", "Fritura", 520, 18, true, false],
  ["Pollo al ajillo", "Pollos", "Fritura", 590, 18, true, true],
  ["Chicharrón de cerdo", "Entradas", "Fritura", 480, 15, true, false],
  ["Yuca frita", "Entradas", "Fritura", 220, 12, true, false],
  ["Tostones de plátano", "Entradas", "Fritura", 250, 12, true, true],
  ["Mofongo con queso frito", "Entradas", "Fritura", 320, 15, true, false],
  ["Ceviche de pescado", "Pescados", "Cocina", 780, 15, true, false],
  ["Pescado frito criollo", "Pescados", "Fritura", 850, 20, true, false],
  ["Sancocho de pescado", "Pescados", "Cocina", 690, 25, true, false],
  ["Morro de carnero", "Platos especiales", "Cocina", 890, 30, true, false],
  ["Pastel de carne", "Platos especiales", "Cocina", 450, 20, true, false],
  ["Arroz con habichuela", "Platos especiales", "Cocina", 320, 15, true, false],
  ["Mofongo de guineo", "Platos especiales", "Cocina", 380, 18, true, false],
  ["Jugo de chinola", "Bebidas", "Barra", 180, 5, true, false],
  ["Mora con leche", "Bebidas", "Barra", 200, 5, true, false],
  ["Limonada de menta", "Bebidas", "Barra", 170, 5, true, false],
  ["Cerveza nacional", "Bebidas", "Barra", 220, 3, true, true],
  ["Ron Bacardi", "Bebidas", "Barra", 350, 3, true, false],
  ["Flan de coco", "Postres", "Postres", 210, 8, true, false],
  ["Habichuela con dulce", "Postres", "Postres", 230, 8, true, false],
  ["Café triple", "Postres", "Barra", 120, 5, true, false],
  ["Combo familiar 4 personas", "Combos", "Cocina", 3200, 30, true, false],
  ["Combo Salón 2 personas", "Combos", "Cocina", 1800, 25, true, false],
  ["Plato del día: brisket", "Platos especiales", "Parrilla", 1450, 30, false, false],
  ["Costillas de cerdo BBQ", "Carnes", "Parrilla", 890, 25, false, false],
];

const idProducto = {};

for (const [nombre, categoria, estacion, precio, minutos, disponible, riesgo] of productos) {
  const fila = await uno(
    `INSERT INTO producto
       (nombre, id_categoria, id_estacion, precio, disponible, riesgo_agotarse, activo, tiempo_estimado_minutos)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
     RETURNING id_producto`,
    [nombre, idCategoria[categoria], idEstacion[estacion], precio, disponible, riesgo, minutos],
  );

  idProducto[nombre] = fila.id_producto;
}

/* ----------------------------------------------------------------- inventario */

const puntos = [
  ["Almacén", true],
  ["Cocina", false],
  ["Barra", false],
];

const idPunto = {};
for (const [nombre, almacen] of puntos) {
  const fila = await uno(
    `INSERT INTO punto_acceso (nombre, es_almacen) VALUES ($1, $2) RETURNING id_punto`,
    [nombre, almacen],
  );
  idPunto[nombre] = fila.id_punto;
}

const proveedores = [
  ["Carnes del Caribbean", "809-555-0110"],
  ["Distribuidora del Norte", "809-555-0111"],
  ["Lácteos Suyapa", "809-555-0112"],
  ["Aves del Este", "809-555-0113"],
];

const idProveedor = {};
for (const [nombre, telefono] of proveedores) {
  const fila = await uno(
    `INSERT INTO proveedor (nombre, telefono, estado) VALUES ($1, $2, 'Activo') RETURNING id_proveedor`,
    [nombre, telefono],
  );
  idProveedor[nombre] = fila.id_proveedor;
}

/* Los insumos apuntan a la unidad de inventario (id_unidad). */
const unidades = await varios(`SELECT id_unidad FROM unidad_medida ORDER BY id_unidad LIMIT 3`);
const idUnidad = unidades.length > 0 ? unidades[0].id_unidad : 1;

const insumos = [
  ["Carne de res", "lb", 40, 120],
  ["Pollo entero", "lb", 30, 90],
  ["Pescado fresco", "lb", 20, 60],
  ["Camarones", "lb", 10, 30],
  ["Papas", "lb", 25, 80],
  ["Cebolla", "lb", 20, 70],
  ["Plátano maduro", "lb", 15, 50],
  ["Aceite de soya", "gal", 8, 25],
  ["Harina", "lb", 12, 40],
  ["Leche", "gal", 10, 30],
  ["Queso amarillo", "lb", 8, 25],
  ["Cerveza (botellas)", "unidad", 60, 200],
  ["Ron (botellas)", "unidad", 12, 40],
  ["Café en grano", "lb", 6, 20],
];

const idInsumo = {};
for (const [nombre, , minimo, existencia] of insumos) {
  const limpio = nombre.replace("=", "");
  const fila = await uno(
    `INSERT INTO insumo (nombre, id_unidad, minimo, activo) VALUES ($1, $2, $3, TRUE) RETURNING id_insumo`,
    [limpio, idUnidad, minimo],
  );

  idInsumo[limpio] = fila.id_insumo;

  /* La existencia vive en el punto donde se guarda: el almacén y, además,
     la cocina y la barra con lo que ya sacaron. */
  for (const [punto, factor] of [
    ["Almacén", 1],
    ["Cocina", 0.7],
    ["Barra", 0.5],
  ]) {
    await sql(
      `INSERT INTO existencia (id_insumo, id_punto, existencia, actualizado)
       VALUES ($1, $2, $3, now())`,
      [fila.id_insumo, idPunto[punto], Math.round(existencia * factor)],
    );
  }

  await sql(
    `INSERT INTO movimiento_inventario
       (tipo, id_insumo, id_punto, cantidad, detalle, id_proveedor, ocurrido_en)
     VALUES ('Entrada de compra', $1, $2, $3, $4, $5, now() - interval '3 days')`,
    [fila.id_insumo, idPunto["Almacén"], existencia, "Compra de apertura de inventario", idProveedor["Distribuidora del Norte"]],
  );
}

/* Salidas por consumo de ayer: la cocina y la barra sacan del almacén. */
for (const [nombre, cantidad] of [
  ["Carne de res", 38],
  ["Pollo entero", 26],
  ["Papas", 12],
  ["Cebolla", 9],
  ["Aceite de soya", 3],
  ["Leche", 4],
  ["Cerveza (botellas)", 54],
  ["Ron (botellas)", 9],
  ["Café en grano", 4],
]) {
  await sql(
    `INSERT INTO movimiento_inventario
       (tipo, id_insumo, id_punto, cantidad, detalle, ocurrido_en)
     VALUES ('Salida por consumo', $1, $2, $3, 'Consumo de la jornada', now() - interval '1 day')`,
    [idInsumo[nombre], idPunto["Almacén"], -cantidad],
  );
}

/* ------------------------------------------------------------------- ofertas */

const ofertas = [
  ["Martes de asado", "10 % de descuento en carnes al carbón", "Porcentaje", 10, true],
  ["Combo Familiar", "RD$300 de descuento en combos familiares", "Monto", 300, true],
  ["Cumpleaños del mes", "20 % de descuento en la cuenta del cumpleañero", "Porcentaje", 20, false],
  ["Almuerzo ejecutivo", "RD$150 de descuento en el menú del día", "Monto", 150, true],
];

for (const [nombre, descripcion, tipoValor, valor, activo] of ofertas) {
  await sql(
    `INSERT INTO promocion (nombre, descripcion, fecha_inicio, fecha_fin, activo, tipo_valor, valor)
     VALUES ($1, $2, CURRENT_DATE - 15, CURRENT_DATE + 15, $3, $4, $5)`,
    [nombre, descripcion, activo, tipoValor, valor],
  );
}

/* ------------------------------------------------------------------ reservas */

const reservas = [
  [2, "19:00", "Familia Ramírez", "809-555-0201", 6, "Abierta"],
  [4, "20:30", "Cumpleaños de Andrés", "809-555-0202", 4, "Pendiente"],
  [5, "18:45", "Cena de negocios Acme", "809-555-0203", 8, "Pendiente"],
];

for (const [indiceMesa, hora, cliente, telefono, personas, estado] of reservas) {
  await sql(
    `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa, estado, id_mesero_asignado)
     VALUES (CURRENT_DATE + 1, $1::time, $2, $3, $4, $5, $6, $7)`,
    [hora, cliente, telefono, personas, idMesa[indiceMesa - 1], estado, meseros[0]],
  );
}

/* ------------------------------------------------------- operación de ayer */

/** Abre un pedido, le pone líneas y lo manda a cocina. */
async function pedidoConConsumo({
  mesa,
  mesero,
  lineas,
  abiertaEn = "now() - interval '4 hours'",
}) {
  /* La mesa tiene que estar ocupada para poder abrir pedido (RN-01). */
  const comensales = Math.max(...lineas.map((linea) => linea.comensal ?? 1));

  await sql(
    `UPDATE mesa SET estado = 'ocupada', personas = $2, hora_llegada = now() - interval '30 minutes', id_mesero_orden = $3
      WHERE id_mesa = $1`,
    [mesa, comensales, mesero],
  );

  const pedido = await uno(
    `SELECT fn_abrir_pedido($1, $2, $3) AS id_pedido`,
    [mesa, mesero, comensales],
  );

  await sql(`UPDATE pedido SET abierto_en = ${abiertaEn} WHERE id_pedido = $1`, [pedido.id_pedido]);

  for (const linea of lineas) {
    const producto = await uno(
      `SELECT id_producto, precio FROM producto WHERE nombre = $1`,
      [linea.producto],
    );

    await sql(
      `INSERT INTO linea_pedido
         (id_pedido, id_producto, comensal, cantidad, precio_unitario, observacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'Enviada')`,
      [
        pedido.id_pedido,
        producto.id_producto,
        linea.comensal ?? 1,
        linea.cantidad,
        producto.precio,
        linea.observacion ?? null,
      ],
    );
  }

  await sql(
    `INSERT INTO comanda (id_pedido, id_estacion, estado, enviada_en)
     VALUES ($1, $2, 'Cerrada', ${abiertaEn})`,
    [pedido.id_pedido, idEstacion["Parrilla"]],
  );

  /*
    El pedido queda "Enviado": fn_generar_cuenta lo busca en ese estado y es
    la que lo cierra cuando arma la cuenta.
  */
  await sql(
    `UPDATE pedido SET estado = 'Enviado', cerrado_en = ${abiertaEn} + interval '1 hour' WHERE id_pedido = $1`,
    [pedido.id_pedido],
  );

  return pedido.id_pedido;
}

const ayer = "now() - interval '1 day'";

/* Seis cuentas de ayer, pagadas de distintas formas. */
const pedidosDeAyer = [
  { lineas: [{ producto: "Costilla de res a la parrilla", cantidad: 1 }, { producto: "Jugo de chinola", cantidad: 2 }] },
  { lineas: [{ producto: "Pollo a la brasa", cantidad: 2 }, { producto: "Mofongo con queso frito", cantidad: 1 }] },
  { lineas: [{ producto: "Ceviche de pescado", cantidad: 1 }, { producto: "Cerveza nacional", cantidad: 2 }] },
  { lineas: [{ producto: "Chicharrón de cerdo", cantidad: 1 }, { producto: "Flan de coco", cantidad: 2 }] },
  { lineas: [{ producto: "Pastel de carne", cantidad: 1 }, { producto: "Jugo de chinola", cantidad: 1 }] },
  { lineas: [{ producto: "Sancocho de pescado", cantidad: 1 }, { producto: "Arroz con habichuela", cantidad: 1 }] },
];

const formasDeAyer = [
  ["Efectivo", 300, 120],
  ["Tarjeta", 0, 0],
  ["Efectivo", 150, 60],
  ["Crédito", 0, 0],
  ["PayPal", 0, 0],
  ["Efectivo", 200, 80],
];

const cuentasDeAyer = [];

for (let i = 0; i < pedidosDeAyer.length; i += 1) {
  const mesa = idMesa[i];
  const mesero = meseros[i % meseros.length];
  await pedidoConConsumo({
    mesa,
    mesero,
    lineas: pedidosDeAyer[i].lineas,
    abiertaEn: ayer + ` + interval '${10 + i * 2} minutes'`,
  });

  await sql(`UPDATE mesa SET estado = 'ocupada', personas = 2 WHERE id_mesa = $1`, [mesa]);

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);
  cuentasDeAyer.push(cuenta.id_cuenta);

  const [forma, propina, recibidoExtra] = formasDeAyer[i];
  const total = await uno(`SELECT fn_total_cuenta($1) AS total`, [cuenta.id_cuenta]);

  const referencia =
    forma === "Tarjeta" ? `AUT-${1000 + i}` : forma === "PayPal" ? `PAY-${2000 + i}` : null;

  await sql(
    `SELECT fn_cobrar_cuenta($1, $2::forma_pago, $3, $4, $5, $6)`,
    [
      cuenta.id_cuenta,
      forma,
      Number(total.total) + propina + recibidoExtra,
      cajeros[i % cajeros.length],
      propina,
      referencia,
    ],
  );

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );
}

/*
  Las cuentas de ayer se fechan hacia atrás: la base las guarda con la hora de
  ahora, y para que el corte de ayer y los reportes del día salir bien, la
  cuenta, el pago y la propina tienen que quedar de ayer.
*/
for (const id of cuentasDeAyer) {
  await sql(
    `UPDATE cuenta SET abierta_en = now() - interval '26 hours', cerrada_en = now() - interval '25 hours' WHERE id_cuenta = $1`,
    [id],
  );
  await sql(`UPDATE pago SET pagado_en = now() - interval '25 hours' WHERE id_cuenta = $1`, [id]);
  await sql(
    `UPDATE propina SET registrada_en = now() - interval '25 hours' WHERE id_cuenta = $1`,
    [id],
  );
}

/* El corte de caja de ayer, cerrado de verdad. */
await sql(`SELECT fn_cerrar_corte(CURRENT_DATE - 1, $1)`, [cajeros[0]]);
await sql(`SELECT fn_cerrar_propinas($1, CURRENT_DATE - 1, $2)`, [meseros[0], 0]);

/* ------------------------------------------------------- operación de hoy */

const pedidosDeHoy = [
  { lineas: [{ producto: "Chuletón de res 12 oz", cantidad: 1, comensal: 1 }, { producto: "Tostones de plátano", cantidad: 1, comensal: 1 }] },
  { lineas: [{ producto: "Pollo frito con tajadas", cantidad: 2, comensal: 1 }, { producto: "Mora con leche", cantidad: 2, comensal: 2 }] },
  { lineas: [{ producto: "Combo Salón 2 personas", cantidad: 1, comensal: 1 }] },
  { lineas: [{ producto: "Pescado frito criollo", cantidad: 1, comensal: 1 }, { producto: "Ron Bacardi", cantidad: 2, comensal: 2 }] },
  { lineas: [{ producto: "Yuca frita", cantidad: 1, comensal: 1 }] },
];

const formasDeHoy = [
  ["Efectivo", 150, 100],
  ["Tarjeta", 80, 0],
  ["Efectivo", 60, 60],
  ["PayPal", 0, 0],
  ["Efectivo", 40, 0],
];

for (let i = 0; i < pedidosDeHoy.length; i += 1) {
  const mesa = idMesa[i];
  const mesero = meseros[i % meseros.length];
  await pedidoConConsumo({
    mesa,
    mesero,
    lineas: pedidosDeHoy[i].lineas,
    abiertaEn: `now() - interval '${40 + i * 25} minutes'`,
  });

  await sql(`UPDATE mesa SET estado = 'ocupada', personas = 2 WHERE id_mesa = $1`, [mesa]);

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);

  const [forma, propina, recibidoExtra] = formasDeHoy[i];
  const total = await uno(`SELECT fn_total_cuenta($1) AS total`, [cuenta.id_cuenta]);

  const referencia =
    forma === "Tarjeta" ? `AUT-9001` : forma === "PayPal" ? `PAY-9002` : null;

  await sql(
    `SELECT fn_cobrar_cuenta($1, $2::forma_pago, $3, $4, $5, $6)`,
    [
      cuenta.id_cuenta,
      forma,
      Number(total.total) + propina + recibidoExtra,
      cajeros[i % cajeros.length],
      propina,
      referencia,
    ],
  );

  /* Los dos primeros llevan comprobante local (para que el historial tenga datos). */
  if (i < 2) {
    await sql(
      `SELECT fn_emitir_comprobante($1, $2::tipo_comprobante, $3, $4, $5, $6::forma_pago, $7)`,
      [
        cuenta.id_cuenta,
        i === 0 ? "B01" : "B02",
        i === 0 ? "Distribuidora del Caribe SRL" : "Walk-in",
        cajeros[i % cajeros.length],
        i === 0 ? "1311234567" : null,
        forma,
        referencia,
      ],
    );
  }

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );
}

/* Una cuenta con descuento de una oferta. */
{
  const mesa = idMesa[6];
  await pedidoConConsumo({
    mesa,
    mesero: meseros[1],
    lineas: [{ producto: "Costilla de res a la parrilla", cantidad: 2, comensal: 1 }],
    abiertaEn: "now() - interval '90 minutes'",
  });

  await sql(`UPDATE mesa SET estado = 'ocupada', personas = 4 WHERE id_mesa = $1`, [mesa]);

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);

  const total = await uno(`SELECT fn_total_cuenta($1) AS total`, [cuenta.id_cuenta]);

  await sql(
    `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
     VALUES ($1, 'Oferta: Martes de asado', $2, 'Descuento', $3)`,
    [cuenta.id_cuenta, Math.round(Number(total.total) * 0.1), capitan],
  );

  await sql(
    `SELECT fn_cobrar_cuenta($1, 'Efectivo', $2, $3, 0, NULL)`,
    [cuenta.id_cuenta, Number(total.total) * 0.9, cajeros[0]],
  );

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );
}

/* Una cortesía (la autoriza el dueño). */
{
  const mesa = idMesa[7];
  await pedidoConConsumo({
    mesa,
    mesero: meseros[2],
    lineas: [{ producto: "Flan de coco", cantidad: 1, comensal: 1 }],
    abiertaEn: "now() - interval '70 minutes'",
  });

  await sql(`UPDATE mesa SET estado = 'ocupada', personas = 2 WHERE id_mesa = $1`, [mesa]);

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);
  const total = await uno(`SELECT fn_total_cuenta($1) AS total`, [cuenta.id_cuenta]);

  await sql(
    `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
     VALUES ($1, 'Cortesía por DUI del mes', $2, 'Cortesía', $3)`,
    [cuenta.id_cuenta, total.total, idEmpleado["Dayan Caba de La Rosa"]],
  );

  await sql(`UPDATE cuenta SET cortesia = TRUE WHERE id_cuenta = $1`, [cuenta.id_cuenta]);

  await sql(
    `SELECT fn_cobrar_cuenta($1, 'Efectivo', $2, $3, 0, NULL)`,
    [cuenta.id_cuenta, 0, cajeros[1]],
  );

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );
}

/* Una cuenta dividida: cada comensal paga su parte. */
{
  const mesa = idMesa[8];
  await pedidoConConsumo({
    mesa,
    mesero: meseros[0],
    lineas: [
      { producto: "Parrillada de chivo", cantidad: 1, comensal: 1 },
      { producto: "Chuletón de res 12 oz", cantidad: 1, comensal: 2 },
      { producto: "Cerveza nacional", cantidad: 2, comensal: 2 },
    ],
    abiertaEn: "now() - interval '50 minutes'",
  });

  await sql(`UPDATE mesa SET estado = 'ocupada', personas = 2 WHERE id_mesa = $1`, [mesa]);

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);

  /* Cada línea se asigna a alguien: la cerveza se reparte entre los dos. */
  const lineasDeLaCuenta = await varios(
    `SELECT lc.id_linea_cuenta, lc.cantidad, lc.precio_unitario, lc.comensal, lc.descripcion
       FROM linea_cuenta lc
      WHERE lc.id_cuenta = $1`,
    [cuenta.id_cuenta],
  );

  for (const linea of lineasDeLaCuenta) {
    const esCerveza = linea.descripcion === "Cerveza nacional";

    if (esCerveza) {
      for (const comensal of [1, 2]) {
        await sql(
          `INSERT INTO asignacion_persona (id_cuenta, comensal, id_linea_cuenta, cantidad, monto_asignado)
           VALUES ($1, $2, $3, 1, $4)`,
          [cuenta.id_cuenta, comensal, linea.id_linea_cuenta, Number(linea.precio_unitario)],
        );
      }
      continue;
    }

    await sql(
      `INSERT INTO asignacion_persona (id_cuenta, comensal, id_linea_cuenta, cantidad, monto_asignado)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        cuenta.id_cuenta,
        linea.comensal,
        linea.id_linea_cuenta,
        linea.cantidad,
        Number(linea.precio_unitario) * Number(linea.cantidad),
      ],
    );
  }

  for (const comensal of [1, 2]) {
    const total = await uno(`SELECT fn_total_comensal($1, $2) AS total`, [
      cuenta.id_cuenta,
      comensal,
    ]);

    await sql(
      `SELECT fn_cobrar_comensal($1::integer, $2::smallint, 'Efectivo'::forma_pago, $3::dinero, $4::integer, $5::dinero, NULL::text)`,
      [cuenta.id_cuenta, comensal, Number(total.total), cajeros[0], 0],
    );
  }

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );
}

/* Pedidos que siguen abiertos (mesa ocupada y cocina trabajando). */
for (let i = 0; i < 2; i += 1) {
  const mesa = idMesa[9 + i];
  const mesero = meseros[i];

  await sql(
    `UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() - interval '15 minutes' WHERE id_mesa = $1`,
    [mesa],
  );

  const pedido = await uno(
    `SELECT fn_abrir_pedido($1::integer, $2::integer, $3::smallint) AS id_pedido`,
    [mesa, mesero, 2],
  );
  await sql(`UPDATE pedido SET abierto_en = now() - interval '12 minutes' WHERE id_pedido = $1`, [pedido.id_pedido]);

  const producto = await uno(`SELECT id_producto, precio FROM producto WHERE nombre = $1`, [
    i === 0 ? "Parrillada de chivo" : "Pollo al ajillo",
  ]);

  await sql(
    `INSERT INTO linea_pedido (id_pedido, id_producto, comensal, cantidad, precio_unitario, estado)
     VALUES ($1, $2, 1, 1, $3, 'Enviada')`,
    [pedido.id_pedido, producto.id_producto, producto.precio],
  );

  await sql(
    `INSERT INTO comanda (id_pedido, id_estacion, estado, enviada_en, iniciada_en)
     VALUES ($1, $2, 'En preparación', now() - interval '10 minutes', now() - interval '8 minutes')`,
    [pedido.id_pedido, idEstacion["Parrilla"]],
  );

  await sql(
    `UPDATE mesa SET estado = 'ocupada', personas = 2, hora_llegada = now() - interval '15 minutes', id_mesero_orden = $2 WHERE id_mesa = $1`,
    [mesa, mesero],
  );
}
/* Una mesa en limpieza y otra reservada, para que se vea el estado del salón. */
await sql(`UPDATE mesa SET estado = 'limpieza' WHERE id_mesa = $1`, [idMesa[2]]);

/* --------------------------------------------------------- ventas de canal */

const ventas = [
  ["Delivery", "Cliente Delivery", 1450, cajeros[0]],
  ["Para llevar", "Cliente Para Llevar", 890, cajeros[1]],
  ["Delivery", "Restaurante Al lado", 2340, cajeros[0]],
];

for (const [canal, cliente, total, registradoPor] of ventas) {
  await sql(
    `INSERT INTO venta_canal (canal, nombre_cliente, total, id_registrado_por, registrada_en)
     VALUES ($1, $2, $3, $4, now() - interval '2 hours')`,
    [canal, cliente, total, registradoPor],
  );
}

/* ------------------------------------------------------------------- resumen */

const resumen = await varios(`
  SELECT
    (SELECT count(*) FROM mesa)                  AS mesas,
    (SELECT count(*) FROM producto)              AS productos,
    (SELECT count(*) FROM usuario)              AS usuarios,
    (SELECT count(*) FROM insumo)                AS insumos,
    (SELECT count(*) FROM promocion)            AS ofertas,
    (SELECT count(*) FROM cuenta WHERE estado = 'Pagada') AS cuentas_pagadas,
    (SELECT count(*) FROM pedido WHERE estado = 'Abierto') AS pedidos_abiertos,
    (SELECT count(*) FROM pago)                  AS pagos,
    (SELECT count(*) FROM comprobante)           AS comprobantes,
    (SELECT count(*) FROM venta_canal)           AS ventas_canal,
    (SELECT count(*) FROM corte_caja)            AS cortes
`);

console.log("  Datos de demostración listos:\n");

for (const [clave, valor] of Object.entries(resumen[0])) {
  console.log(`   · ${clave.replace(/_/g, " ")}: ${valor}`);
}

const ventasTotal = await uno(`SELECT COALESCE(SUM(total), 0) AS total FROM venta_canal`);
const cuentasTotal = await uno(
  `SELECT COALESCE(SUM(fn_total_cuenta(id_cuenta)), 0) AS total FROM cuenta WHERE estado = 'Pagada'`,
);

console.log(`\n   · total de las cuentas pagadas: RD$${Number(cuentasTotal.total).toFixed(2)}`);
console.log(`   · total de las ventas de canal: RD$${Number(ventasTotal.total).toFixed(2)}`);
console.log(`\n  Los usuarios de prueba usan su nombre como clave (gerente/gerente, mesero1/mesero1...).\n`);

await cliente.end();
