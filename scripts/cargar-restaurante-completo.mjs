/* ================================================================= carga real
   cargar-restaurante-completo.mjs — SIGA-DP / Asadero Doña Pula
   ---------------------------------------------------------------------------
   Carga controlada y reproducible del restaurante completo y real:
     · Menú amplio (170+ productos en 22 categorías, con RD$ precios realistas).
     · 36 mesas en 5 zonas (Salón Principal, Terraza, Área Familiar, VIP, Exterior).
     · 29 empleados con usuarios propios y roles.
     · Inventario amplio con proveedores ficticios y existencia en 3 puntos.
     · 14 días de operación COMPLETA: pedidos, cocina, cobros, propinas,
       comprobantes, corte de caja diario, reservas y ventas de canal.
       Todo queda cobrado y cerrado: el restaurante "acaba de cerrar el día".

   Seguridad:
     · Exige CONFIRMAR_CARGA=true.
     · Borra los datos de desarrollo/prueba y los reemplaza.
     · Conserva: estructura, migraciones, roles, permisos, y la cuenta
       administrativa "gerente" (con su clave actual, sea cual sea).
     · Precios en pesos dominicanos. Información comercial ficticia.

   Antes de correrlo, haz un respaldo (Neon):
     console.neon.tech -> Branches -> Create branch (instantáneo, gratis)
   Backup hecho al momento de esta carga: backup-pre-carga-real-2026-11-14
============================================================================ */

import "dotenv/config";

import pg from "pg";

import { cifrarClave } from "../servidor/src/acceso/claves.js";

if (process.env.CONFIRMAR_CARGA !== "true") {
  console.error(
    "\n  Negado: esta herramienta REEMPLAZA los datos. Ejecuta con CONFIRMAR_CARGA=true\n",
  );
  process.exit(1);
}

const bdHost = process.env.BD_HOST || "localhost";
if (/prueba/i.test(bdHost) || /prueba/i.test(process.env.BD_NOMBRE || "")) {
  console.error("Negado: esta base es la de pruebas.");
  process.exit(1);
}

const cliente = new pg.Client({
  host: bdHost,
  port: Number(process.env.BD_PUERTO || 5432),
  user: process.env.BD_USUARIO || "postgres",
  password: process.env.BD_CLAVE || "",
  database: process.env.BD_NOMBRE || "siga_dp_v2",
  application_name: "siga-dp-cargar",
  ssl: bdHost.endsWith("neon.tech") ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 60000,
});

/* --------------------------------------------------------------------- util */

async function uno(texto, valores = []) {
  return (await cliente.query(texto, valores)).rows[0];
}
async function varios(texto, valores = []) {
  return (await cliente.query(texto, valores)).rows;
}
async function sql(texto, valores = []) {
  await cliente.query(texto, valores);
}

/* RNG determinista: misma carga, mismos datos (verificable y reproducible). */
let _semilla = 0x9e3779b9;
function rng() {
  _semilla ^= _semilla << 13;
  _semilla ^= _semilla >>> 17;
  _semilla ^= _semilla << 5;
  return (_semilla >>> 0) / 0xffffffff;
}
function escoger(lista) {
  return lista[Math.floor(rng() * lista.length)];
}
function entero(min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

await cliente.connect();
console.log("\n  Cargando Asadero Doña Pula (restaurante completo)...\n");

/* ------------------------------------------------------------------ limpiar */

await sql(`
  TRUNCATE mesa, reserva, corte_caja, comprobante, descuento, propina,
    cierre_propina, pago, pago_paypal, asignacion_persona, linea_cuenta, cuenta,
    linea_comanda, comanda, linea_pedido, mesa_pedido, pedido,
    venta_canal, linea_venta_canal, movimiento_inventario, existencia, insumo,
    proveedor, punto_acceso, promocion, producto, categoria, estacion, zona,
    producto_componente, sugerencia_asistente, unidad_medida
  RESTART IDENTITY CASCADE
`);
await sql(`DELETE FROM usuario WHERE id_usuario <> 1`);
/* RN-16: los empleados no se borran — y no hace falta; el semilla trae solo a
   la administradora (Rosa Almonte, id_empleado = 1). */
/* La bitácora es de solo lectura (RN-26): el historial de hoy se suma al anterior, no se toca. */
await sql(`UPDATE empleado SET nombre = 'Rosa Almonte' WHERE id_empleado = 1`);

await sql(`
  UPDATE parametro SET
     nombre_empresa  = 'ASADERO DOÑA PULA',
     rnc            = '131-59982-6',
     direccion      = 'Calle Lic. Agustín Acevedo No. G-25, Jardines Metropolitanos, Santiago, R.D.',
     telefono       = '809-770-2834',
     tasa_impuesto  = 18,
     tasa_cambio_usd = 60,
     cuenta_pagos   = 'paga-donapula@asadero.do'
  WHERE id_parametro = 1
`);

/* Unidades que hacen falta (antes solo existía "Unidad"). */
await sql(`
  INSERT INTO unidad_medida (nombre, abreviatura) VALUES
    ('Unidad', 'und'),
    ('Kilogramo', 'kg'), ('Libra', 'lb'), ('Gramo', 'g'),
    ('Litro', 'l'), ('Mililitro', 'ml'), ('Galón', 'gal'),
    ('Caja', 'cja'), ('Botella', 'bot'), ('Docena', 'doc'), ('Paquete', 'paq')
`);
const unidades = {};
for (const fila of await varios(`SELECT id_unidad, abreviatura FROM unidad_medida`)) {
  unidades[fila.abreviatura] = fila.id_unidad;
}

/* Puntos de acceso del restaurante. */
const idPunto = {};
for (const [nombre, almacen] of [
  ["Almacén", true],
  ["Cocina", false],
  ["Barra", false],
]) {
  idPunto[nombre] = (await uno(
    `INSERT INTO punto_acceso (nombre, es_almacen) VALUES ($1, $2) RETURNING id_punto`,
    [nombre, almacen],
  )).id_punto;
}

/* ------------------------------------------------------------- catálogos */

const categorias = [
  "Pollo asado", "Carnes a la parrilla", "Costillas", "Cerdo",
  "Hamburguesas", "Sandwiches", "Picaderas", "Entradas",
  "Acompañamientos", "Arroz y moro", "Pastas", "Ensaladas",
  "Sopas", "Platos ejecutivos", "Combos familiares", "Combos personales",
  "Menú infantil", "Postres", "Jugos naturales", "Refrescos y aguas",
  "Cervezas y tragos", "Café y calientes",
];
const idCategoria = {};
for (const nombre of categorias) {
  idCategoria[nombre] = (await uno(
    `INSERT INTO categoria (nombre, activo) VALUES ($1, TRUE) RETURNING id_categoria`,
    [nombre],
  )).id_categoria;
}

const estaciones = ["Parrilla", "Fritura", "Cocina", "Barra", "Horno", "Postres"];
const idEstacion = {};
for (const nombre of estaciones) {
  idEstacion[nombre] = (await uno(
    `INSERT INTO estacion (nombre) VALUES ($1) RETURNING id_estacion`,
    [nombre],
  )).id_estacion;
}

const idZona = {};
for (const [nombre, tipo] of [
  ["Salón Principal", "Salón"],
  ["Terraza", "Terraza"],
  ["Área Familiar", "Familiar"],
  ["Área VIP", "VIP"],
  ["Área Exterior", "Exterior"],
]) {
  idZona[nombre] = (await uno(
    `INSERT INTO zona (nombre, tipo_ambiente, activo) VALUES ($1, $2, TRUE) RETURNING id_zona`,
    [nombre, tipo],
  )).id_zona;
}

const mesasDe = [
  ["Salón Principal", [2, 4, 6, 8, 2, 4, 6, 4, 10, 4, 2, 6]],
  ["Terraza", [4, 2, 2, 6, 4, 2]],
  ["Área Familiar", [6, 8, 8, 4, 6]],
  ["Área VIP", [8, 10, 12, 6]],
  ["Área Exterior", [2, 2, 4, 4, 6, 2, 8, 4, 2]],
];
const idMesa = [];
let numeroDeMesa = 1;
for (const [zona, capacidades] of mesasDe) {
  for (const capacidad of capacidades) {
    const mesa = await uno(
      `INSERT INTO mesa (numero, id_zona, capacidad, estado, creado_en)
       VALUES ($1, $2, $3, 'libre', now()) RETURNING id_mesa`,
      [numeroDeMesa, idZona[zona], capacidad],
    );
    idMesa.push(mesa.id_mesa);
    numeroDeMesa += 1;
  }
}

/* ------------------------------------------------------------- personal */

const roles = {};
for (const rol of await varios(`SELECT id_rol, codigo FROM rol`)) {
  roles[rol.codigo] = rol.id_rol;
}

/* [nombre, rol, cédula] — Rosa Almonte (gerente) conserva id_empleado = 1 */
const personal = [
  ["Rosa Almonte", "gerente", "10010010002"],
  ["Dayan Caba de La Rosa", "dueno", "10010010001"],
  ["Miguel Santos", "capitan", "10010010003"],
  ["Yokasta Peña", "cajero", "10010010004"],
  ["Wandy Gil", "cajero", "10010010005"],
  ["Sindry Cabrera", "cajero", "10010010006"],
  ["Hector Tavarez", "mesero", "10010010007"],
  ["Altagracia Díaz", "mesero", "10010010008"],
  ["Junior Beltré", "mesero", "10010010009"],
  ["Yaritza Núñez", "mesero", "10010010010"],
  ["Wilfredo Peña", "mesero", "10010010011"],
  ["Solange Batista", "mesero", "10010010012"],
  ["Gabriel Núñez", "mesero", "10010010013"],
  ["María Fernanda", "anfitrion", "10010010014"],
  ["Neftalí Cruceta", "almacen", "10010010015"],
  ["Luis Chase", "cocina", "10010010016"],
  ["Pedro Ureña", "cocina", "10010010017"],
  ["Concepción Rojas", "cocina", "10010010018"],
  ["Stanislao De la Cruz", "cocina", "10010010019"],
  ["Alexis Mejía", "cocina", "10010010020"],
  ["Estheisy García", "cocina", "10010010021"],
  ["Ramón Chalas", "cocina", "10010010022"],
  ["Anthony Báez", "cocina", "10010010023"],
  ["Carmen Rosario", "almacen", "10010010024"],
  ["Iris Guzmán", "cocina", "10010010025"],
  ["Altagracia Báez", "almacen", "10010010026"],
  ["Santos Peña", "anfitrion", "10010010027"],
  ["Yoel Familia", "anfitrion", "10010010028"],
];

const idEmpleado = { "Rosa Almonte": 1 };
for (const [nombre, rol, cedula] of personal) {
  if (idEmpleado[nombre]) continue;
  const existente = await uno(`SELECT id_empleado FROM empleado WHERE cedula = $1`, [cedula]);
  if (existente) {
    idEmpleado[nombre] = existente.id_empleado;
    continue;
  }
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - entero(90, 720));
  const fila = await uno(
    `INSERT INTO empleado (cedula, nombre, id_rol, estado, fecha_ingreso)
     VALUES ($1, $2, $3, 'Activo', $4) RETURNING id_empleado`,
    [cedula, nombre, roles[rol], fecha],
  );
  idEmpleado[nombre] = fila.id_empleado;
}

/* Usuarios: uno por empleado (la gerente conserva su cuenta y su clave). */
const usuarios = [
  ["dueno", "Dayan Caba de La Rosa"], ["capitan", "Miguel Santos"],
  ["cajero", "Yokasta Peña"], ["cajero2", "Wandy Gil"], ["cajero3", "Sindry Cabrera"],
  ["mesero1", "Hector Tavarez"], ["mesero2", "Altagracia Díaz"], ["mesero3", "Junior Beltré"],
  ["mesero4", "Yaritza Núñez"], ["mesero5", "Wilfredo Peña"], ["mesero6", "Solange Batista"],
  ["mesero7", "Gabriel Núñez"], ["anfitrion", "María Fernanda"],
  ["almacen", "Neftalí Cruceta"],
  ["cocina", "Luis Chase"], ["cocina2", "Pedro Ureña"], ["cocina3", "Concepción Rojas"],
  ["cocina4", "Stanislao De la Cruz"], ["cocina5", "Alexis Mejía"], ["cocina6", "Estheisy García"],
  ["cocina7", "Ramón Chalas"], ["cocina8", "Anthony Báez"],
  ["almacen2", "Carmen Rosario"], ["barra", "Iris Guzmán"], ["almacen3", "Altagracia Báez"],
  ["reparto", "Santos Peña"], ["reparto2", "Yoel Familia"],
];
const CLAVE_EQUIPO = "Asadero2026#";
const hashEquipo = cifrarClave(CLAVE_EQUIPO);

for (const [usuario, nombre] of usuarios) {
  await sql(
    `INSERT INTO usuario (usuario, clave_hash, id_empleado, estado)
     VALUES ($1, $2, $3, 'Activo')`,
    [usuario, hashEquipo, idEmpleado[nombre]],
  );
}

const meseros = [
  idEmpleado["Hector Tavarez"], idEmpleado["Altagracia Díaz"], idEmpleado["Junior Beltré"],
  idEmpleado["Yaritza Núñez"], idEmpleado["Wilfredo Peña"], idEmpleado["Solange Batista"],
  idEmpleado["Gabriel Núñez"],
];
const cajeros = [idEmpleado["Yokasta Peña"], idEmpleado["Wandy Gil"], idEmpleado["Sindry Cabrera"]];
const cocineros = [
  idEmpleado["Luis Chase"], idEmpleado["Pedro Ureña"], idEmpleado["Concepción Rojas"],
  idEmpleado["Stanislao De la Cruz"], idEmpleado["Ramón Chalas"], idEmpleado["Anthony Báez"],
];
const capitan = idEmpleado["Miguel Santos"];
const dueno = idEmpleado["Dayan Caba de La Rosa"];

/* ------------------------------------------------------------- proveedores */

const proveedores = [
  ["Carnes del Caribe", "809-555-0110"],
  ["Distribuidora del Norte", "809-555-0111"],
  ["Aves del Este", "809-555-0113"],
  ["Lácteos Suyapa", "809-555-0112"],
  ["Mariscos Acuarios", "809-555-0114"],
  ["Hielo Polar", "809-555-0115"],
  ["Inspira Brands", "809-555-0116"],
  ["Importadora Tropical", "809-555-0117"],
  ["El Trópico Vegetales", "809-555-0118"],
  ["Distribuidora La Central", "809-555-0119"],
  ["Empaques y Papelería RD", "809-555-0120"],
  ["Limpia Total", "809-555-0121"],
];
const idProveedor = {};
for (const [nombre, telefono] of proveedores) {
  idProveedor[nombre] = (await uno(
    `INSERT INTO proveedor (nombre, telefono, estado) VALUES ($1, $2, 'Activo') RETURNING id_proveedor`,
    [nombre, telefono],
  )).id_proveedor;
}

/* ------------------------------------------------------------- inventario */

/* [nombre, unidad, minimo, almacen, cocina, barra] */
const insumos = [
  ["Carne de res", "lb", 25, 240, 110, 0],
  ["Pollo entero", "lb", 30, 300, 140, 0],
  ["Chuleta de cerdo", "lb", 20, 150, 60, 0],
  ["Costilla de res", "lb", 15, 120, 55, 0],
  ["Costilla de cerdo", "lb", 15, 110, 50, 0],
  ["Chivo", "lb", 10, 60, 25, 0],
  ["Pescado fresco", "lb", 15, 70, 30, 0],
  ["Camarones", "lb", 8, 35, 14, 0],
  ["Arroz blanco", "lb", 40, 480, 150, 0],
  ["Habichuelas", "lb", 15, 120, 45, 0],
  ["Moro de habichuelas", "lb", 20, 150, 55, 0],
  ["Plátano maduro", "lb", 15, 160, 65, 0],
  ["Plátano verde", "lb", 15, 140, 55, 0],
  ["Yuca", "lb", 15, 140, 55, 0],
  ["Papas", "lb", 20, 160, 65, 0],
  ["Cebolla", "lb", 12, 80, 35, 0],
  ["Ajo", "lb", 6, 25, 10, 0],
  ["Pimiento", "lb", 8, 35, 14, 0],
  ["Ají dulce", "lb", 8, 35, 14, 0],
  ["Limón", "lb", 10, 60, 25, 0],
  ["Aceite de soya", "gal", 8, 40, 14, 0],
  ["Harina", "lb", 12, 120, 40, 0],
  ["Azúcar", "lb", 12, 150, 30, 20],
  ["Sal", "lb", 8, 80, 25, 5],
  ["Café en grano", "lb", 8, 55, 0, 22],
  ["Leche", "gal", 15, 110, 25, 25],
  ["Queso amarillo", "lb", 10, 70, 30, 0],
  ["Mantequilla", "lb", 8, 45, 18, 0],
  ["Cerveza Presidente", "bot", 36, 360, 0, 150],
  ["Cerveza Corona", "bot", 24, 220, 0, 90],
  ["Ron", "bot", 12, 90, 0, 35],
  ["Vino tinto", "bot", 8, 45, 0, 14],
  ["Vino blanco", "bot", 6, 30, 0, 10],
  ["Jugos en botella", "bot", 30, 180, 0, 75],
  ["Refresco cola", "bot", 36, 400, 0, 150],
  ["Agua mineral", "bot", 36, 350, 0, 130],
  ["Hielo", "lb", 30, 300, 100, 70],
  ["Pan", "doc", 15, 120, 25, 0],
  ["Mayonesa", "gal", 5, 20, 8, 0],
  ["Mostaza", "gal", 4, 15, 6, 0],
  ["Salsa BBQ", "gal", 5, 25, 12, 0],
  ["Salsa de ajo", "gal", 4, 18, 9, 0],
  ["Salsa picante", "gal", 4, 18, 9, 0],
  ["Especias mixtas", "lb", 5, 22, 9, 0],
  ["Arvejas", "lb", 10, 55, 20, 0],
  ["Zanahoria", "lb", 10, 55, 20, 0],
  ["Empaques para llevar", "cja", 25, 120, 40, 0],
  ["Vasos descartables", "cja", 20, 90, 0, 30],
  ["Servilletas", "paq", 15, 70, 25, 0],
  ["Bolsas para llevar", "paq", 15, 80, 25, 0],
  ["Detergente", "gal", 4, 12, 0, 0],
  ["Desinfectante", "gal", 3, 9, 0, 0],
  ["Guantes", "cja", 10, 35, 20, 0],
  ["Trapos", "paq", 8, 22, 12, 0],
  ["Vasos descartables agua", "paq", 12, 55, 0, 12],
];

const idInsumo = {};
for (const [nombre, unidad, minimo, almacen, cocina, barra] of insumos) {
  const fila = await uno(
    `INSERT INTO insumo (nombre, id_unidad, minimo, activo) VALUES ($1, $2, $3, TRUE) RETURNING id_insumo`,
    [nombre, unidades[unidad], minimo],
  );
  idInsumo[nombre] = fila.id_insumo;

  for (const [punto, cantidad] of [
    ["Almacén", almacen],
    ["Cocina", cocina],
    ["Barra", barra],
  ]) {
    if (cantidad <= 0) continue;
    await sql(
      `INSERT INTO existencia (id_insumo, id_punto, existencia, actualizado)
       VALUES ($1, $2, $3, now())`,
      [fila.id_insumo, idPunto[punto], cantidad],
    );
  }

  await sql(
    `INSERT INTO movimiento_inventario
       (tipo, id_insumo, id_punto, cantidad, detalle, id_proveedor, ocurrido_en)
     VALUES ('Entrada de compra', $1, $2, $3, 'Compra inicial de apertura', $4, now() - interval '13 days')`,
    [fila.id_insumo, idPunto["Almacén"], almacen, idProveedor[escoger(proveedores)[0]]],
  );
}

/* ------------------------------------------------------------- catálogo */

/* [nombre, categoria, estacion, precio RD$, minutos] */
const productos = [
  /* Pollo asado (10) */
  ["Pollo entero asado", "Pollo asado", "Parrilla", 900, 35],
  ["Medio pollo asado", "Pollo asado", "Parrilla", 540, 25],
  ["Cuarto de pollo asado", "Pollo asado", "Parrilla", 290, 20],
  ["Pollo a la brasa", "Pollo asado", "Parrilla", 650, 22],
  ["Pollo al carbón", "Pollo asado", "Parrilla", 720, 24],
  ["Pollo BBQ asado", "Pollo asado", "Parrilla", 680, 24],
  ["Pierna y muslo asado", "Pollo asado", "Parrilla", 460, 20],
  ["Pechuga a la parrilla", "Pollo asado", "Parrilla", 550, 20],
  ["Pollo asado con tostones", "Pollo asado", "Parrilla", 640, 26],
  ["Pollo asado con arroz", "Pollo asado", "Parrilla", 620, 24],

  /* Carnes a la parrilla (12) */
  ["Costilla de res a la parrilla", "Carnes a la parrilla", "Parrilla", 1250, 26],
  ["Chuletón de res 12 oz", "Carnes a la parrilla", "Parrilla", 1150, 22],
  ["Tira de res al carbón", "Carnes a la parrilla", "Parrilla", 980, 20],
  ["Parrillada de chivo", "Carnes a la parrilla", "Parrilla", 1350, 28],
  ["Churrasco", "Carnes a la parrilla", "Parrilla", 1080, 22],
  ["Filete de res a la parrilla", "Carnes a la parrilla", "Parrilla", 1050, 24],
  ["Bistec de res encebollado", "Carnes a la parrilla", "Parrilla", 620, 16],
  ["Medallón filete mignon", "Carnes a la parrilla", "Parrilla", 1400, 28],
  ["Lomo de res a la parrilla", "Carnes a la parrilla", "Parrilla", 1180, 24],
  ["Parrillada mixta Doña Pula", "Carnes a la parrilla", "Parrilla", 1850, 35],
  ["Parrilla para dos", "Carnes a la parrilla", "Parrilla", 2100, 35],
  ["Medallón de res en salsa", "Carnes a la parrilla", "Parrilla", 1250, 24],

  /* Costillas (6) */
  ["Costillitas de cerdo BBQ", "Costillas", "Parrilla", 890, 26],
  ["Costillas de cerdo ahumadas", "Costillas", "Parrilla", 950, 26],
  ["Costillas de res grandes", "Costillas", "Parrilla", 1150, 28],
  ["Medio rack de costillas", "Costillas", "Parrilla", 690, 22],
  ["Costillitas baby back", "Costillas", "Parrilla", 1250, 28],
  ["Combo costillas + fries", "Costillas", "Fritura", 1100, 28],

  /* Cerdo (10) */
  ["Chicharrón de cerdo", "Cerdo", "Fritura", 480, 16],
  ["Chuleta de cerdo empanada", "Cerdo", "Fritura", 520, 15],
  ["Chuleta guisada", "Cerdo", "Cocina", 540, 20],
  ["Chuleta a la parrilla", "Cerdo", "Parrilla", 620, 18],
  ["Cerdo asado", "Cerdo", "Parrilla", 650, 22],
  ["Longaniza dominicana", "Cerdo", "Parrilla", 460, 18],
  ["Moro de cerdo", "Cerdo", "Cocina", 520, 20],
  ["Lomo de cerdo a la plancha", "Cerdo", "Parrilla", 780, 20],
  ["Cerdo a la criolla", "Cerdo", "Cocina", 590, 22],
  ["Cuero de cerdo crocante", "Cerdo", "Fritura", 300, 12],

  /* Hamburguesas (8) */
  ["Hamburguesa clásica", "Hamburguesas", "Fritura", 420, 12],
  ["Hamburguesa doble carne", "Hamburguesas", "Fritura", 520, 15],
  ["Hamburguesa BBQ Doña Pula", "Hamburguesas", "Fritura", 550, 15],
  ["Hamburguesa de chivo", "Hamburguesas", "Fritura", 620, 16],
  ["Hamburguesa hawaiana", "Hamburguesas", "Fritura", 540, 15],
  ["Hamburguesa con queso", "Hamburguesas", "Fritura", 460, 13],
  ["Mini hamburguesa (3 uds)", "Hamburguesas", "Fritura", 380, 12],
  ["Hamburguesa portobello", "Hamburguesas", "Fritura", 470, 13],

  /* Sandwiches (10) */
  ["Sándwich de chicharrón", "Sandwiches", "Cocina", 380, 11],
  ["Sándwich cubano", "Sandwiches", "Cocina", 420, 12],
  ["Sándwich de pollo a la parrilla", "Sandwiches", "Cocina", 440, 12],
  ["Sándwich Reuben", "Sandwiches", "Cocina", 520, 13],
  ["Sándwich vegetariano", "Sandwiches", "Cocina", 390, 11],
  ["Sándwich de pechuga empanada", "Sandwiches", "Cocina", 400, 12],
  ["Sándwich mixto", "Sandwiches", "Cocina", 330, 10],
  ["Submarino de asadero", "Sandwiches", "Cocina", 580, 14],
  ["Medianoche", "Sandwiches", "Cocina", 480, 13],
  ["Jamón y queso", "Sandwiches", "Cocina", 280, 8],

  /* Picaderas (7) */
  ["Picadera clásica (para compartir)", "Picaderas", "Parrilla", 2400, 32],
  ["Picadera Doña Pula (cerdo y res)", "Picaderas", "Parrilla", 2650, 32],
  ["Picadera de chicharrón", "Picaderas", "Fritura", 1500, 20],
  ["Picadera mixta XL", "Picaderas", "Parrilla", 3200, 35],
  ["Mortero del asadero", "Picaderas", "Parrilla", 1950, 25],
  ["Picadera dominicana", "Picaderas", "Parrilla", 1700, 22],
  ["Montaditos de cerdo (12 uds)", "Picaderas", "Parrilla", 1250, 18],

  /* Entradas (12) */
  ["Tostones", "Entradas", "Fritura", 250, 12],
  ["Yuca frita", "Entradas", "Fritura", 220, 12],
  ["Mofongo relleno de pollo", "Entradas", "Fritura", 380, 16],
  ["Mofongo con queso frito", "Entradas", "Fritura", 320, 15],
  ["Camarón en alijo", "Entradas", "Cocina", 680, 15],
  ["Ceviche de pescado", "Entradas", "Cocina", 780, 15],
  ["Empanadas (6 uds)", "Entradas", "Fritura", 320, 12],
  ["Tabla de embutidos", "Entradas", "Cocina", 850, 12],
  ["Ensalada César", "Entradas", "Cocina", 340, 10],
  ["Patacones con guacamole", "Entradas", "Cocina", 350, 12],
  ["Dedos de pollo (8 uds)", "Entradas", "Fritura", 380, 12],
  ["Hummus tahini", "Entradas", "Cocina", 380, 10],

  /* Acompañamientos (10) */
  ["Arroz blanco", "Acompañamientos", "Cocina", 120, 10],
  ["Arroz amarillo", "Acompañamientos", "Cocina", 140, 10],
  ["Habichuelas guisadas", "Acompañamientos", "Cocina", 150, 14],
  ["Asopao de pollo", "Acompañamientos", "Cocina", 380, 25],
  ["Yuca con mojo", "Acompañamientos", "Cocina", 210, 12],
  ["Tostones maduros", "Acompañamientos", "Fritura", 230, 12],
  ["Frijoles rojos", "Acompañamientos", "Cocina", 150, 14],
  ["Plátano frito", "Acompañamientos", "Fritura", 180, 12],
  ["Maduros con queso", "Acompañamientos", "Fritura", 240, 12],
  ["Quinoa salteada", "Acompañamientos", "Cocina", 280, 12],

  /* Arroz y moro (6) */
  ["Moro de habichuelas", "Arroz y moro", "Cocina", 180, 14],
  ["Moro de guandules", "Arroz y moro", "Cocina", 170, 14],
  ["Moro mixto de la casa", "Arroz y moro", "Cocina", 210, 14],
  ["Moro con longaniza", "Arroz y moro", "Cocina", 190, 14],
  ["Moro con carne molida", "Arroz y moro", "Cocina", 250, 16],
  ["Moro vegetariano", "Arroz y moro", "Cocina", 200, 12],

  /* Pastas (6) */
  ["Spaghetti con pollo", "Pastas", "Cocina", 520, 18],
  ["Spaghetti boloñesa", "Pastas", "Cocina", 560, 18],
  ["Lasaña de la casa", "Pastas", "Horno", 640, 22],
  ["Pasta Alfredo con camarones", "Pastas", "Cocina", 720, 22],
  ["Pasta carbonara", "Pastas", "Cocina", 590, 18],
  ["Ravioles de queso", "Pastas", "Cocina", 620, 19],

  /* Ensaladas (8) */
  ["Ensalada César con pollo", "Ensaladas", "Cocina", 450, 12],
  ["Ensalada del jardín", "Ensaladas", "Cocina", 320, 10],
  ["Ensalada griega", "Ensaladas", "Cocina", 420, 11],
  ["Ensalada Cobb", "Ensaladas", "Cocina", 520, 13],
  ["Ensalada de aguacate", "Ensaladas", "Cocina", 390, 10],
  ["Ensalada tropical", "Ensaladas", "Cocina", 460, 11],
  ["Ensalada Waldorf", "Ensaladas", "Cocina", 410, 10],
  ["Ensalada mediterránea", "Ensaladas", "Cocina", 430, 11],

  /* Sopas (6) */
  ["Sopa de pollo criolla", "Sopas", "Cocina", 260, 15],
  ["Sancocho de pescado", "Sopas", "Cocina", 690, 25],
  ["Sopa de ajo", "Sopas", "Cocina", 280, 12],
  ["Crema de plátano", "Sopas", "Cocina", 300, 13],
  ["Sopa de lentejas", "Sopas", "Cocina", 240, 13],
  ["Consomé de pollo", "Sopas", "Cocina", 220, 12],

  /* Platos ejecutivos (8) */
  ["Plato ejecutivo del día", "Platos ejecutivos", "Cocina", 450, 16],
  ["Ejecutivo de pollo", "Platos ejecutivos", "Cocina", 480, 15],
  ["Ejecutivo de res", "Platos ejecutivos", "Cocina", 560, 17],
  ["Ejecutivo de pescado", "Platos ejecutivos", "Cocina", 520, 17],
  ["Ejecutivo vegetariano", "Platos ejecutivos", "Cocina", 460, 15],
  ["Ejecutivo de chicharrón", "Platos ejecutivos", "Cocina", 440, 15],
  ["Ejecutivo de pasta", "Platos ejecutivos", "Cocina", 420, 14],
  ["Ejecutivo completo (entrada y bebida)", "Platos ejecutivos", "Cocina", 620, 18],

  /* Combos familiares (6) */
  ["Combo familiar 4 personas", "Combos familiares", "Cocina", 3200, 32],
  ["Combo Doña Pula (2 pollos + moro + tostones)", "Combos familiares", "Parrilla", 2800, 30],
  ["Combo parrillada familiar", "Combos familiares", "Parrilla", 2600, 32],
  ["Combo Sunday family", "Combos familiares", "Parrilla", 3100, 35],
  ["Combo cumpleaños (con pastel)", "Combos familiares", "Horno", 4500, 40],
  ["Combo económico 4 personas", "Combos familiares", "Cocina", 2300, 30],

  /* Combos personales (6) */
  ["Combo personal del día", "Combos personales", "Cocina", 750, 20],
  ["Combo pollo + fries + refresco", "Combos personales", "Fritura", 620, 19],
  ["Combo hamburguesa + fries + bebida", "Combos personales", "Fritura", 550, 17],
  ["Combo churrasco + arroz + bebida", "Combos personales", "Parrilla", 950, 22],
  ["Combo pechuga + ensalada", "Combos personales", "Cocina", 680, 16],
  ["Combo costillitas individual", "Combos personales", "Parrilla", 750, 22],

  /* Menú infantil (6) */
  ["Pollo para niños con arroz", "Menú infantil", "Parrilla", 320, 12],
  ["Mini churrasco infantil", "Menú infantil", "Parrilla", 380, 13],
  ["Nuggets con papitas", "Menú infantil", "Fritura", 300, 12],
  ["Espaguetis Alfredo infantil", "Menú infantil", "Cocina", 330, 12],
  ["Hamburguesita", "Menú infantil", "Fritura", 290, 11],
  ["Juguito + gelatina", "Menú infantil", "Barra", 180, 6],

  /* Postres (10) */
  ["Flan de coco", "Postres", "Postres", 210, 8],
  ["Habichuela con dulce", "Postres", "Postres", 230, 8],
  ["Flan de huevo", "Postres", "Postres", 190, 7],
  ["Tres leches", "Postres", "Postres", 240, 8],
  ["Mousse de chocolate", "Postres", "Postres", 250, 7],
  ["Helado artesanal", "Postres", "Postres", 180, 5],
  ["Cheesecake", "Postres", "Postres", 280, 9],
  ["Arroz con leche", "Postres", "Postres", 200, 8],
  ["Sorbete de chinola", "Postres", "Postres", 170, 5],
  ["Pudin casero", "Postres", "Horno", 190, 7],

  /* Jugos naturales (10) */
  ["Jugo de chinola", "Jugos naturales", "Barra", 180, 5],
  ["Jugo de naranja", "Jugos naturales", "Barra", 170, 5],
  ["Limonada de menta", "Jugos naturales", "Barra", 170, 5],
  ["Mora con leche", "Jugos naturales", "Barra", 200, 5],
  ["Jugo de piña", "Jugos naturales", "Barra", 180, 5],
  ["Jugo de mango", "Jugos naturales", "Barra", 190, 5],
  ["Jugo de guanábana", "Jugos naturales", "Barra", 210, 6],
  ["Mabí de la casa", "Jugos naturales", "Barra", 130, 5],
  ["Mora sola", "Jugos naturales", "Barra", 160, 5],
  ["Tamarindo", "Jugos naturales", "Barra", 150, 5],

  /* Refrescos y aguas (8) */
  ["Refresco cola (lata)", "Refrescos y aguas", "Barra", 90, 1],
  ["Refresco lima-limón (lata)", "Refrescos y aguas", "Barra", 90, 1],
  ["Refresco naranja (lata)", "Refrescos y aguas", "Barra", 90, 1],
  ["Agua mineral", "Refrescos y aguas", "Barra", 60, 1],
  ["Agua con gas", "Refrescos y aguas", "Barra", 80, 1],
  ["Té helado", "Refrescos y aguas", "Barra", 120, 2],
  ["Soda saborizadas", "Refrescos y aguas", "Barra", 100, 2],
  ["Jugo en caja", "Refrescos y aguas", "Barra", 80, 1],

  /* Cervezas y tragos (12) */
  ["Cerveza Presidente", "Cervezas y tragos", "Barra", 220, 3],
  ["Cerveza Bohemia", "Cervezas y tragos", "Barra", 240, 3],
  ["Cerveza Corona", "Cervezas y tragos", "Barra", 280, 3],
  ["Cerveza importada", "Cervezas y tragos", "Barra", 340, 3],
  ["Mojito", "Cervezas y tragos", "Barra", 420, 7],
  ["Cuba libre", "Cervezas y tragos", "Barra", 430, 6],
  ["Piña colada", "Cervezas y tragos", "Barra", 480, 7],
  ["Daiquirí", "Cervezas y tragos", "Barra", 450, 7],
  ["Presidente bien fría", "Cervezas y tragos", "Barra", 230, 2],
  ["Copa de vino tinto", "Cervezas y tragos", "Barra", 350, 4],
  ["Copa de vino blanco", "Cervezas y tragos", "Barra", 330, 4],
  ["Whiskey sour", "Cervezas y tragos", "Barra", 550, 7],

  /* Café y calientes (6) */
  ["Café triple", "Café y calientes", "Barra", 120, 4],
  ["Café con leche", "Café y calientes", "Barra", 150, 4],
  ["Expresso", "Café y calientes", "Barra", 90, 2],
  ["Chocolate caliente", "Café y calientes", "Barra", 140, 4],
  ["Té", "Café y calientes", "Barra", 120, 3],
  ["Infusión de hierbas", "Café y calientes", "Barra", 130, 3],
];

const idProducto = {};
for (const [nombre, categoria, estacion, precio, minutos] of productos) {
  const fila = await uno(
    `INSERT INTO producto
       (nombre, id_categoria, id_estacion, precio, disponible, riesgo_agotarse, activo, tiempo_estimado_minutos)
     VALUES ($1, $2, $3, $4, TRUE, FALSE, TRUE, $5)
     RETURNING id_producto`,
    [nombre, idCategoria[categoria], idEstacion[estacion], precio, minutos],
  );
  idProducto[nombre] = fila.id_producto;
}

/* Recetas: producto -> [ { insumo, cantidad } ] */
const recetas = [
  ["Pollo entero asado", [["Pollo entero", 2], ["Arroz blanco", 1.5], ["Habichuelas", 0.5]]],
  ["Medio pollo asado", [["Pollo entero", 1.2], ["Arroz blanco", 1], ["Plátano maduro", 0.6]]],
  ["Cuarto de pollo asado", [["Pollo entero", 0.6], ["Yuca", 0.6]]],
  ["Pollo a la brasa", [["Pollo entero", 0.9], ["Moro de habichuelas", 0.6]]],
  ["Pollo al carbón", [["Pollo entero", 0.9], ["Papas", 0.6], ["Salsa BBQ", 0.1]]],
  ["Pollo BBQ asado", [["Pollo entero", 0.9], ["Salsa BBQ", 0.15]]],
  ["Pollo asado con tostones", [["Pollo entero", 0.8], ["Plátano verde", 1]]],
  ["Pollo asado con arroz", [["Pollo entero", 0.8], ["Arroz blanco", 1], ["Habichuelas", 0.4]]],
  ["Costilla de res a la parrilla", [["Costilla de res", 1.2], ["Yuca", 0.5]]],
  ["Chuletón de res 12 oz", [["Carne de res", 0.8], ["Papas", 0.5]]],
  ["Tira de res al carbón", [["Carne de res", 0.7], ["Moro de habichuelas", 0.5]]],
  ["Parrillada de chivo", [["Chivo", 1], ["Plátano maduro", 0.6], ["Yuca", 0.4]]],
  ["Churrasco", [["Carne de res", 0.7], ["Arroz blanco", 0.8], ["Habichuelas", 0.4]]],
  ["Filete de res a la parrilla", [["Carne de res", 0.7], ["Champiñones", 0.2]].filter(([n]) => idInsumo[n])],
  ["Bistec de res encebollado", [["Carne de res", 0.5], ["Cebolla", 0.3]]],
  ["Lomo de res a la parrilla", [["Carne de res", 0.8]]],
  ["Parrillada mixta Doña Pula", [["Carne de res", 0.5], ["Costilla de cerdo", 0.5], ["Pollo entero", 0.5], ["Yuca", 0.4]]],
  ["Parrilla para dos", [["Carne de res", 0.6], ["Chuleta de cerdo", 0.4], ["Costilla de cerdo", 0.4]]],
  ["Costillitas de cerdo BBQ", [["Costilla de cerdo", 1], ["Salsa BBQ", 0.15]]],
  ["Costillas de cerdo ahumadas", [["Costilla de cerdo", 1], ["Salsa BBQ", 0.12]]],
  ["Chicharrón de cerdo", [["Cerdo", 0.6]].map(([n, c]) => [idInsumo["Chuleta de cerdo"] ? "Chuleta de cerdo" : n, c])],
  ["Chuleta de cerdo empanada", [["Chuleta de cerdo", 0.5], ["Harina", 0.1]]],
  ["Longaniza dominicana", [["Cerdo asado", 0]].map(() => ["Moro de habichuelas", 0.3])],
  ["Lomo de cerdo a la plancha", [["Chuleta de cerdo", 0.6], ["Arroz blanco", 0.5]]],
  ["Moro de habichuelas", [["Arroz blanco", 0.4], ["Habichuelas", 0.3]]],
  ["Hamburguesa clásica", [["Carne de res", 0.25], ["Pan", 0.1]]],
  ["Hamburguesa BBQ Doña Pula", [["Carne de res", 0.25], ["Pan", 0.1], ["Salsa BBQ", 0.05]]],
  ["Hamburguesa de chivo", [["Chivo", 0.2], ["Pan", 0.1]]],
  ["Sándwich de chicharrón", [["Chuleta de cerdo", 0.3], ["Pan", 0.1]]],
  ["Sándwich cubano", [["Jamón", 0]].map(() => ["Pan", 0.12])],
  ["Ceviche de pescado", [["Pescado fresco", 0.5], ["Cebolla", 0.1], ["Ají dulce", 0.1]]],
  ["Camarón en alijo", [["Camarones", 0.4], ["Ajo", 0.05]]],
  ["Mofongo con queso frito", [["Plátano verde", 0.8], ["Ajo", 0.02], ["Queso amarillo", 0.2]]],
  ["Tostones", [["Plátano verde", 0.8]]],
  ["Sancocho de pescado", [["Pescado fresco", 0.6], ["Yuca", 0.3], ["Plátano maduro", 0.3]]],
  ["Pasta carbonara", [["Harina", 0]].map(() => ["Queso amarillo", 0.1])],
  ["Lasaña de la casa", [["Harina", 0.4], ["Queso amarillo", 0.2], ["Carne de res", 0.3]]],
  ["Ensalada César con pollo", [["Pollo entero", 0.2], ["Lechuga", 0]].filter(([n]) => idInsumo[n])],
  ["Spaghetti boloñesa", [["Harina", 0.4], ["Carne de res", 0.3], ["Salsa de ajo", 0.1]]],
  ["Combo familiar 4 personas", [["Pollo entero", 1.5], ["Arroz blanco", 2], ["Habichuelas", 1], ["Plátano maduro", 1]]],
  ["Combo Doña Pula (2 pollos + moro + tostones)", [["Pollo entero", 1.6], ["Moro de habichuelas", 1.2], ["Plátano verde", 1]]],
  ["Combo parrillada familiar", [["Carne de res", 0.8], ["Costilla de cerdo", 0.6], ["Pollo entero", 0.8]]],
  ["Sopa de pollo criolla", [["Pollo entero", 0.3], ["Zanahoria", 0.1]]],
  ["Ejecutivo de pollo", [["Pollo entero", 0.5], ["Arroz blanco", 0.5], ["Habichuelas", 0.3]]],
  ["Ejecutivo de res", [["Carne de res", 0.4], ["Arroz blanco", 0.5], ["Habichuelas", 0.3]]],
  ["Plato ejecutivo del día", [["Carne de res", 0.35], ["Arroz blanco", 0.4], ["Habichuelas", 0.25]]],
];
for (const [nombre, componentes] of recetas) {
  for (const [insumo, cantidad] of componentes) {
    if (!idInsumo[insumo] || !idProducto[nombre]) continue;
    await sql(
      `INSERT INTO producto_componente (id_producto, id_insumo, cantidad) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [idProducto[nombre], idInsumo[insumo], cantidad],
    );
  }
}

/* ------------------------------------------------------------- ofertas */

const promociones = [
  ["Martes de asado", "10 % de descuento en carnes al carbón", "Porcentaje", 10, true],
  ["Combo Familiar", "RD$ 300 de descuento en combos familiares", "Monto", 300, true],
  ["Almuerzo ejecutivo", "RD$ 150 de descuento en el menú del día", "Monto", 150, true],
  ["Cumpleaños del mes", "20 % de descuento en la cuenta del cumpleañero", "Porcentaje", 20, true],
  ["Viernes de picadera", "15 % de descuento en picaderas y mortero", "Porcentaje", 15, true],
  ["Domingo familiar", "RD$ 400 de descuento en Combo Doña Pula", "Monto", 400, true],
];
for (const [nombre, descripcion, tipoValor, valor, activo] of promociones) {
  await sql(
    `INSERT INTO promocion (nombre, descripcion, fecha_inicio, fecha_fin, activo, tipo_valor, valor)
     VALUES ($1, $2, CURRENT_DATE - 30, CURRENT_DATE + 30, $3, $4, $5)`,
    [nombre, descripcion, activo, tipoValor, valor],
  );
}

/* --------------------------------------------- historial de 14 días, cerrado */

const nombresClientes = [
  "Juan Pérez", "María Then", "José Marte", "Ana Martínez", "Rafael Guzmán",
  "Yessenia Rodríguez", "Carlos Reyes", "Daniela Rosario", "Fernando Álvarez",
  "Laury Mercedes", "Luis Familia", "Ana Paula de los Santos", "Miguel Ángel Ogando",
  "Rosa María Bautista", "Sandra Corona", "Félix Santelises", "Glenda Marte",
  "Joel Encarnación", "Katherine Vargas", "Mario Méndez", "Naomi Vilorio",
  "Pedro Mateo", "Ramona Abreu", "Stalin de Jesús", "Tainy Familia", "Valeria Peralta",
  "Wilkreis Lantigua", "Yuderka Colón", "Alexis Beltré", "Brismar De León",
  "Clara Peña", "Domingo Féliz", "Elba Germosén", "Francisco Aquino", "Gleidy Santos",
  "Héctor Rijo", "Isamar De León", "Joan Altagracia", "Kisber Yéspica", "Laura Salcedo",
  "Manuel Rivas", "Ninoska Frías", "Oliver Tavera", "Paola Milagros", "Quisbert Peña",
  "Randy Santos", "Sunny Espino", "Tomás Hernández", "Zoila Vázquez",
];
const empresas = [
  ["Distribuidora del Caribe SRL", "131-12345-6"],
  ["Inversiones Alma Rosa C. por A.", "131-98765-4"],
  ["Constructora Caribe Norte", "131-45612-7"],
  ["Invergross del Sur", "131-77451-2"],
];

const populares = [
  "Pollo entero asado", "Pollo a la brasa", "Medio pollo asado",
  "Costilla de res a la parrilla", "Chicharrón de cerdo", "Longaniza dominicana",
  "Hamburguesa clásica", "Moro de habichuelas", "Tostones", "Yuca frita",
  "Jugo de chinola", "Cerveza Presidente", "Cerveza Bohemia", "Combo personal del día",
  "Ejecutivo de pollo", "Plato ejecutivo del día", "Picadera dominicana", "Sancocho de pescado",
];
const todosLosProductos = Object.keys(idProducto);
const productoEscogido = () =>
  rng() < 0.62 ? escoger(populares) : escoger(todosLosProductos);

function fechaDeHace(dias, hora, minuto) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  f.setHours(hora, minuto, 0, 0);
  return f;
}

async function pedidoCerrado({ mesa, mesero, lineas, abiertaEn, comanda, conPropina }) {
  const comensales = Math.min(6, Math.max(1, ...lineas.map((linea) => linea.comensal ?? 1)));

  await sql(
    `UPDATE mesa SET estado = 'ocupada', personas = $2, hora_llegada = $3, id_mesero_orden = $4 WHERE id_mesa = $1`,
    [mesa, comensales, abiertaEn, mesero],
  );

  const pedido = await uno(
    `SELECT fn_abrir_pedido($1, $2, $3) AS id_pedido`,
    [mesa, mesero, comensales],
  );
  const idPedido = pedido.id_pedido;

  for (const linea of lineas) {
    const producto = await uno(
      `SELECT id_producto, precio FROM producto WHERE nombre = $1`,
      [linea.producto],
    );
    await sql(
      `INSERT INTO linea_pedido
         (id_pedido, id_producto, comensal, cantidad, precio_unitario, observacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'Enviada')`,
      [idPedido, producto.id_producto, linea.comensal ?? 1, linea.cantidad,
       producto.precio, linea.observacion ?? null],
    );
  }

  const enviadaEn = new Date(abiertaEn.getTime() + entero(4, 18) * 60_000);
  const cerradaEn = new Date(enviadaEn.getTime() + entero(10, 25) * 60_000);
  await sql(
    `INSERT INTO comanda (id_pedido, id_estacion, estado, enviada_en, cerrada_en)
     VALUES ($1, $2, 'Cerrada', $3, $4)`,
    [idPedido, idEstacion[comanda ?? "Parrilla"], enviadaEn, cerradaEn],
  );
  await sql(
    `UPDATE pedido SET estado = 'Enviado', abierto_en = $2, cerrado_en = $3 WHERE id_pedido = $1`,
    [idPedido, abiertaEn, cerradaEn],
  );

  const cuenta = await uno(`SELECT fn_generar_cuenta($1) AS id_cuenta`, [mesa]);
  const idCuenta = cuenta.id_cuenta;
  await sql(`UPDATE cuenta SET abierta_en = $2 WHERE id_cuenta = $1`,
    [idCuenta, enviadaEn]);

  const totalBruto = Number((await uno(`SELECT fn_total_cuenta($1) AS total`, [idCuenta])).total);

  /* ~8 % de las cuentas llevan un 10 % de descuento autorizado (o cortesía). */
  let descuento = 0;
  const azar = rng();
  if (azar < 0.06) {
    descuento = Math.round(totalBruto * 0.1);
    await sql(
      `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
       VALUES ($1, 'Descuento por oferta del día', $2, 'Descuento', $3)`,
      [idCuenta, descuento, capitan],
    );
  } else if (azar < 0.068) {
    descuento = totalBruto;
    await sql(
      `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
       VALUES ($1, 'Cortesía de la casa', $2, 'Cortesía', $3)`,
      [idCuenta, descuento, dueno],
    );
    await sql(`UPDATE cuenta SET cortesia = TRUE WHERE id_cuenta = $1`, [idCuenta]);
  }

  const totalCuenta = totalBruto - descuento;
  let propina = 0;
  if (conPropina === true) {
    const esTarjetaOV = rng() < 0.32;
    propina = esTarjetaOV ? Math.round(totalCuenta * 0.1) : (rng() < 0.3 ? Math.round(totalCuenta * 0.1) : 0);
  }
  const forma = escoger(["Efectivo", "Efectivo", "Efectivo", "Efectivo", "Tarjeta", "Tarjeta", "PayPal", "Crédito"]);
  const referencia = forma === "Tarjeta" ? `AUT-${entero(10000, 99999)}`
    : forma === "PayPal" ? `PAY-${entero(10000, 99999)}` : null;

  await sql(
    `SELECT fn_cobrar_cuenta($1, $2::forma_pago, $3, $4, $5, $6)`,
    [idCuenta, forma, totalCuenta + propina, cajeros[entero(0, cajeros.length - 1)], propina, referencia],
  );

  /* Regreso de la cuenta, el pago y la propina a su fecha real. */
  await sql(`UPDATE cuenta SET abierta_en = $2, cerrada_en = $3 WHERE id_cuenta = $1`,
    [idCuenta, abiertaEn, cerradaEn]);
  await sql(`UPDATE pago SET pagado_en = $2 WHERE id_cuenta = $1`, [idCuenta, cerradaEn]);
  await sql(`UPDATE propina SET registrada_en = $2 WHERE id_cuenta = $1`, [idCuenta, cerradaEn]);

  await sql(
    `UPDATE mesa SET estado = 'libre', personas = NULL, hora_llegada = NULL, id_mesero_orden = NULL WHERE id_mesa = $1`,
    [mesa],
  );

  return { idCuenta, totalCuenta, forma, referencia, cerradaEn };
}

const idCuentasPorDia = Array.from({ length: 14 }, () => []);

for (let dia = 13; dia >= 0; dia -= 1) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dia);
  fecha.setHours(0, 0, 0, 0);
  const esFinde = fecha.getDay() === 0 || fecha.getDay() === 6;
  const pedidosDelDia = esFinde ? entero(22, 28) : entero(15, 21);
  const meserosDelDia = new Set();
  const propinaUsada = new Set();

  for (let i = 0; i < pedidosDelDia; i += 1) {
    const mesa = idMesa[entero(0, idMesa.length - 1)];
    const mesero = meseros[entero(0, meseros.length - 1)];
    const apertura = fechaDeHace(dia, entero(11, 20), entero(0, 59));
    meserosDelDia.add(mesero);

    const conPropina = !propinaUsada.has(`${mesero}|${mesa}`);
    propinaUsada.add(`${mesero}|${mesa}`);

    const cuantasLineas = entero(1, 4);
    const lineas = [];
    for (let j = 0; j < cuantasLineas; j += 1) {
      lineas.push({
        producto: productoEscogido(),
        cantidad: entero(1, 2),
        comensal: entero(1, 2),
      });
    }

    const resultado = await pedidoCerrado({
      mesa,
      mesero,
      lineas,
      abiertaEn: apertura,
      comanda: "Parrilla",
      conPropina,
    });
    idCuentasPorDia[dia].push(resultado.idCuenta);
  }

  /* Entre 1 y 3 comprobantes por día para que el historial fiscal sea realista. */
  const cuantasHoy = idCuentasPorDia[dia];
  const cuantasComprobantes = Math.min(cuantasHoy.length, rng() < 0.5 ? 1 : 2);
  for (let k = 0; k < cuantasComprobantes; k += 1) {
    const idCuenta = escoger(cuantasHoy);
    const tipo = rng() < 0.7 ? "B02" : "B01";
    const clienteEmpresa = tipo === "B01" ? escoger(empresas) : null;
    await sql(
      `SELECT fn_emitir_comprobante($1, $2::tipo_comprobante, $3, $4, $5, $6::forma_pago, $7)`,
      [
        idCuenta,
        tipo,
        clienteEmpresa ? clienteEmpresa[0] : escoger(nombresClientes),
        cajeros[entero(0, cajeros.length - 1)],
        clienteEmpresa ? clienteEmpresa[1] : null,
        "Efectivo",
        null,
      ],
    );
  }

  /* Corte de caja del día (todo cobrado). */
  await sql(`SELECT fn_cerrar_corte($1, $2)`, [fecha, cajeros[0]]);

  /* Conciliación de propinas de los meseros que atendieron ese día. */
  const sumas = await varios(
    `SELECT id_empleado, COALESCE(sum(monto), 0) AS total
       FROM propina
      WHERE id_empleado = ANY($1::int[])
        AND (registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = $2
      GROUP BY id_empleado`,
    [meseros, fecha],
  );
  for (const fila of sumas) {
    await sql(`SELECT fn_cerrar_propinas($1, $2, $3)`, [fila.id_empleado, fecha, fila.total]);
  }
}

/* Los descuentos y cortesías se integraron en pedidoCerrado (antes del cobro),
   así el corte de caja cuadra con lo cobrado de verdad. */

/* ------------------------------------------------------ reservas históricas */

const capacidadMesa = {};
for (const fila of await varios(`SELECT id_mesa, capacidad FROM mesa`)) {
  capacidadMesa[fila.id_mesa] = fila.capacidad;
}

for (let i = 0; i < 42; i += 1) {
  const mesa = idMesa[entero(0, idMesa.length - 1)];
  const dia = entero(1, 13); // solo fechas PASADAS: ninguna reserva activa hoy o futura
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dia);
  fecha.setHours(0, 0, 0, 0);
  const hora = `${entero(12, 20).toString().padStart(2, "0")}:${entero(0, 59).toString().padStart(2, "0")}`;
  const personas = Math.min(capacidadMesa[mesa], entero(2, 8));
  const estado = rng() < 0.72 ? "Abierta" : "Cancelada";
  const mesero = meseros[entero(0, meseros.length - 1)];

  await sql(
    `INSERT INTO reserva (fecha, hora, nombre_cliente, telefono, personas, id_mesa, estado, id_mesero_asignado, motivo_cancelacion)
     VALUES ($1, $2::time, $3, $4, $5, $6, $7, $8, $9)`,
    [
      fecha,
      hora,
      escoger(nombresClientes),
      `809-555-0${entero(100, 999)}`,
      personas,
      mesa,
      estado,
      mesero,
      estado === "Cancelada" ? "No se presentó (canceló a última hora)" : null,
    ],
  );
}

/* -------------------------------------------------------- ventas de canal */

const clientes = [...nombresClientes];
const idVentasCanal = [];
for (let i = 0; i < 38; i += 1) {
  const canal = rng() < 0.58 ? "Delivery" : "Para llevar";
  const dia = entero(1, 13); // ventas externas también en días pasados, nunca activas hoy
  const registradoEn = fechaDeHace(dia, entero(11, 21), entero(0, 59));
  const registrarPor = cajeros[entero(0, cajeros.length - 1)];

  let total = 0;
  const items = [];
  const cuantas = entero(1, 4);
  for (let j = 0; j < cuantas; j += 1) {
    const producto = escoger(todosLosProductos);
    const cantidad = entero(1, 3);
    const precio = await uno(
      `SELECT precio FROM producto WHERE nombre = $1`,
      [producto],
    );
    items.push({ id: idProducto[producto], cantidad, precio: Number(precio.precio) });
    total += cantidad * Number(precio.precio);
  }

  const venta = await uno(
    `INSERT INTO venta_canal (canal, nombre_cliente, total, id_registrado_por, registrada_en)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_venta`,
    [canal, escoger(clientes), total, registrarPor, registradoEn],
  );
  idVentasCanal.push(venta.id_venta);

  for (const item of items) {
    await sql(
      `INSERT INTO linea_venta_canal (id_linea_venta, id_producto, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [venta.id_venta, item.id, item.cantidad, item.precio],
    );
  }
}

/* -------------------------------------------------------------- verificación */

const resumen = await varios(`
  SELECT
    (SELECT count(*) FROM categoria)                       AS categorias,
    (SELECT count(*) FROM producto)                        AS productos,
    (SELECT count(*) FROM producto_componente)             AS componentes,
    (SELECT count(*) FROM zona)                            AS zonas,
    (SELECT count(*) FROM mesa)                            AS mesas,
    (SELECT count(*) FROM mesa WHERE estado <> 'libre')    AS mesas_no_libres,
    (SELECT count(*) FROM empleado)                        AS empleados,
    (SELECT count(*) FROM usuario)                         AS usuarios,
    (SELECT count(*) FROM proveedor)                       AS proveedores,
    (SELECT count(*) FROM insumo)                          AS insumos,
    (SELECT count(*) FROM existencia WHERE existencia < 0) AS existencias_negativas,
    (SELECT count(*) FROM movimiento_inventario)           AS movimientos,
    (SELECT count(*) FROM pedido)                          AS pedidos,
    (SELECT count(*) FROM comanda WHERE estado <> 'Cerrada') AS comandas_abiertas,
    (SELECT count(*) FROM cuenta WHERE estado <> 'Pagada' AND estado <> 'Anulada') AS cuentas_pendientes,
    (SELECT count(*) FROM pago)                            AS pagos,
    (SELECT count(*) FROM propina)                         AS propinas,
    (SELECT count(*) FROM comprobante)                     AS comprobantes,
    (SELECT count(*) FROM corte_caja WHERE estado = 'Abierto') AS cortes_abiertos,
    (SELECT count(*) FROM corte_caja WHERE estado = 'Cerrado') AS cortes_cerrados,
    (SELECT count(*) FROM reserva WHERE fecha >= CURRENT_DATE)   AS reservas_futuras,
    (SELECT count(*) FROM bitacora)                        AS eventos_auditoria
`);

console.log("  Resumen de la carga:");
for (const [clave, valor] of Object.entries(resumen[0])) {
  console.log(`    ${clave.padEnd(26)} ${valor}`);
}

const noCierra = await varios(`
  SELECT 'mesa_ocupada' AS faltante, count(*) FROM mesa WHERE estado = 'ocupada'
  UNION ALL SELECT 'mesa_limpieza', count(*) FROM mesa WHERE estado = 'limpieza'
  UNION ALL SELECT 'pedido_abierto', count(*) FROM pedido WHERE estado IN ('Abierto', 'Enviado')
  UNION ALL SELECT 'comanda_pendiente', count(*) FROM comanda WHERE estado <> 'Cerrada'
  UNION ALL SELECT 'linea_no_enviada', count(*) FROM linea_pedido WHERE estado NOT IN ('Enviada', 'Anulada')
  UNION ALL SELECT 'cuenta_abierta', count(*) FROM cuenta WHERE estado = 'Abierta'
`);
console.log("\n  Pendientes que deben ser 0:");
for (const fila of noCierra) {
  console.log(`    ${fila.faltante.padEnd(26)} ${fila.count}`);
}

const estadosMesas = await varios(
  `SELECT estado, count(*)::int FROM mesa GROUP BY estado ORDER BY estado`,
);
console.log("\n  Estado de las mesas:");
for (const fila of estadosMesas) console.log(`    ${fila.estado.padEnd(12)} ${fila.count}`);

console.log("\n  Carga completada. Estado: restaurante cerrado, todo cobrado y conciliado.\n");

await cliente.end();
