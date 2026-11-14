/*
  cargar-demo.mjs �?" datos de demostración para una base de DESARROLLO.
  ---------------------------------------------------------------------

  Este archivo NO es parte de la aplicación. Es una herramienta manual para
  dejar una base local con mesas ocupadas, pedidos y cobros de ejemplo.

  Reglas de seguridad:

    �� La conexión sale de servidor/.env o de variables de entorno. Antes había
      una contraseña de Render escrita aquí; eso era un secreto publicado.
    �� Se niega a ejecutarse si NODE_ENV=production o si BD_HOST apunta a Cloud
      SQL, salvo que se pase CONFIRMAR_DEMO=true de forma consciente.
    �� No se ejecuta desde el contenedor: .dockerignore lo excluye.
*/

import crypto from "node:crypto";
import path from "node:path";

import dotenv from "dotenv";
import pg from "pg";

import { configuracionBd } from "./servidor/src/db/configuracion.js";

// Carga el mismo .env que usa el servidor, sin importar desde dónde se lance.
dotenv.config({ path: path.resolve("servidor", ".env"), quiet: true });

const host = process.env.BD_HOST || "localhost";

if (
  (process.env.NODE_ENV === "production" || host.startsWith("/cloudsql/")) &&
  process.env.CONFIRMAR_DEMO !== "true"
) {
  console.error(
    "Negado: esto carga datos de demostración. Si de verdad quieres hacerlo " +
      "en esta base, ejecuta con CONFIRMAR_DEMO=true.",
  );
  process.exit(1);
}

const pool = new pg.Pool({ ...configuracionBd(), max: 2 });

async function main() {
  try {
    console.log("=== CARGANDO SISTEMA COMPLETO PARA DEMO ===\n");

    // 1. Crear empleados (usuarios)
    const empleados = [
      { cedula: "001-0000001-1", nombre: "María González", telefono: "809-111-1111", id_rol: 4, usuario: "maria", clave: "mesero123" },
      { cedula: "001-0000002-1", nombre: "Carlos Rodríguez", telefono: "809-222-2222", id_rol: 4, usuario: "carlos", clave: "mesero123" },
      { cedula: "001-0000003-1", nombre: "Juan Pérez", telefono: "809-333-3333", id_rol: 6, usuario: "cocina1", clave: "cocina123" },
      { cedula: "001-0000004-1", nombre: "Ana Martínez", telefono: "809-444-4444", id_rol: 7, usuario: "cajera1", clave: "cajero123" },
      { cedula: "001-0000005-1", nombre: "Roberto Silva", telefono: "809-555-5555", id_rol: 3, usuario: "capitan1", clave: "capitan123" },
      { cedula: "001-0000006-1", nombre: "Elena Díaz", telefono: "809-666-6666", id_rol: 4, usuario: "elena", clave: "mesero123" },
    ];

    console.log("1. Creando empleados...");
    for (const e of empleados) {
      const r = await pool.query(
        `INSERT INTO empleado (cedula, nombre, telefono, id_rol, estado_empleado)
         VALUES ($1, $2, $3, $4, 'Activo') RETURNING id_empleado`,
        [e.cedula, e.nombre, e.telefono, e.id_rol],
      );
      const idEmpleado = r.rows[0].id_empleado;

      const sal = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(e.clave, sal, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
      const claveHash = `${sal}$${hash}`;

      await pool.query(
        `INSERT INTO usuario (usuario, clave_hash, id_empleado, estado, intentos_fallidos)
         VALUES ($1, $2, $3, 'Activo', 0)`,
        [e.usuario, claveHash, idEmpleado],
      );
      console.log(`  OK ${e.nombre} (${e.usuario})`);
    }

    // 2. Ocupar mesas 1-15
    console.log("\n2. Ocupando mesas...");
    const personasPorMesa = [4, 2, 3, 4, 2, 3, 2, 4, 2, 3, 2, 4, 2, 3, 2];
    for (let m = 1; m <= 15; m++) {
      await pool.query(
        "UPDATE mesa SET estado = 'ocupada', personas = $1 WHERE id_mesa = $2",
        [personasPorMesa[m - 1], m],
      );
    }
    console.log("  OK 15 mesas ocupadas");

    // 3. Obtener IDs de productos disponibles
    const rProd = await pool.query(
      "SELECT id_producto FROM producto WHERE activo = true AND disponible = true ORDER BY id_producto LIMIT 50",
    );
    const productosDisponibles = rProd.rows.map((r) => r.id_producto);
    console.log(`\n3. Productos disponibles: ${productosDisponibles.length}`);

    // 4. Crear pedidos con líneas para cada mesa
    const mesasComensales = [
      { mesa: 1, comensal: "Juan" },
      { mesa: 2, comensal: "Ana" },
      { mesa: 3, comensal: "Pedro" },
      { mesa: 4, comensal: "Luis" },
      { mesa: 5, comensal: "María" },
      { mesa: 6, comensal: "Sofía" },
      { mesa: 7, comensal: "Carlos" },
      { mesa: 8, comensal: "Lucía" },
      { mesa: 9, comensal: "Miguel" },
      { mesa: 10, comensal: "Andrea" },
      { mesa: 11, comensal: "Diego" },
      { mesa: 12, comensal: "Valentina" },
      { mesa: 13, comensal: "Gabriel" },
      { mesa: 14, comensal: "Carmen" },
      { mesa: 15, comensal: "Ricardo" },
    ];

    console.log("\n4. Creando pedidos y líneas...");
    const pedidosCreados = {};
    for (const m of mesasComensales) {
      const rAbrir = await pool.query(
        "INSERT INTO pedido (id_mesa, id_mesero, estado) VALUES ($1, 1, 'Abierto') RETURNING id_pedido",
        [m.mesa],
      );
      const idPedido = rAbrir.rows[0].id_pedido;
      pedidosCreados[m.mesa] = idPedido;

      // 3-5 líneas aleatorias.
      const prodsSeleccionados = [...productosDisponibles]
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.floor(Math.random() * 3) + 2);

      for (const pid of prodsSeleccionados) {
        const cantidad = Math.floor(Math.random() * 3) + 1;
        const rProdInfo = await pool.query("SELECT precio FROM producto WHERE id_producto = $1", [pid]);
        const precio = rProdInfo.rows[0].precio;
        await pool.query(
          `INSERT INTO linea_pedido (id_pedido, id_producto, cantidad, precio_unitario, estado)
           VALUES ($1, $2, $3, $4, 'Enviada')`,
          [idPedido, pid, cantidad, precio],
        );
      }
      console.log(`  Mesa ${m.mesa} (${m.comensal}): pedido ${idPedido} con ${prodsSeleccionados.length} líneas`);
    }

    // 5. Crear comandas para cada pedido enviado
    console.log("\n5. Creando comandas en cocina...");
    for (let m = 1; m <= 15; m++) {
      const idPedido = pedidosCreados[m];
      const rComanda = await pool.query(
        "INSERT INTO comanda (id_pedido, id_estacion, estado) VALUES ($1, 1, 'Preparado') RETURNING id_comanda",
        [idPedido],
      );
      const idComanda = rComanda.rows[0].id_comanda;

      const rLineas = await pool.query(
        "SELECT id_linea_pedido, id_producto, cantidad FROM linea_pedido WHERE id_pedido = $1 AND estado = 'Enviada'",
        [idPedido],
      );
      for (const lp of rLineas.rows) {
        await pool.query(
          "INSERT INTO linea_comanda (id_comanda, id_linea_pedido, estado) VALUES ($1, $2, 'Preparado')",
          [idComanda, lp.id_linea_pedido],
        );
      }
      console.log(`  Comanda ${idComanda} (Mesa ${m}): Preparada`);
    }

    // 6. Generar cuentas para cada mesa
    console.log("\n6. Generando cuentas...");
    for (let m = 1; m <= 15; m++) {
      await pool.query("SELECT fn_generar_cuenta($1)", [m]);
      console.log(`  Mesa ${m}: cuenta generada`);
    }

    // 7. Cobrar cuentas
    const formasPago = [
      "Efectivo", "Tarjeta", "PayPal", "Crédito",
      "Efectivo", "Tarjeta", "PayPal", "Crédito",
      "Efectivo", "Tarjeta", "PayPal", "Crédito",
      "Efectivo", "Tarjeta", "PayPal",
    ];
    console.log("\n7. Cobrando cuentas...");
    for (let m = 1; m <= 15; m++) {
      const forma = formasPago[m - 1];
      const rTotal = await pool.query(
        "SELECT fn_total_cuenta(id_cuenta) as total FROM cuenta WHERE id_mesa = $1 AND estado = 'Abierta'",
        [m],
      );
      const total = Number(rTotal.rows[0].total || 0);
      const recibido = forma === "Efectivo" ? total + 100 : total;
      const referencia = forma === "Tarjeta" ? `TARJ-${m}` : forma === "PayPal" ? `PP-${m}` : "";

      await pool.query(
        "SELECT fn_cobrar_cuenta($1, $2::forma_pago, $3, $4, $5, $6)",
        [m, forma, recibido, 1, 0, referencia || null],
      );
      console.log(`  Mesa ${m} (${forma}, RD$${total}): Cobrado`);
    }

    console.log("\n=== SISTEMA COMPLETAMENTE CARGADO ===");
    console.log("Todos los pedidos, comandas, cuentas y cobros están listos para demostración.");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

void main();
