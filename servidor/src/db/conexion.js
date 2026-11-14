/*
  conexion.js — la conexión con PostgreSQL.
  -----------------------------------------

  Todo lo que el servidor sabe de la base de datos está aquí. Las rutas y los
  servicios llaman a estas funciones y nunca escriben SQL suelto.

  Reglas del plan que se cumplen en este archivo:
    · Regla de oro 5: la base de datos es la fuente única de verdad.
    · Los montos (NUMERIC) llegan a JavaScript como números, no como texto.
    · Las consultas van parametrizadas ($1, $2). Nunca se arma SQL con texto.

  Nota de diseño sobre "quién opera":
    La bitácora de la base de datos lee el usuario de la variable de sesión
    "app.usuario". Ese valor NO se guarda en una variable del módulo, porque con
    dos peticiones a la vez una pisaría a la otra y la bitácora acabaría
    atribuyendo el trabajo al usuario equivocado. Se fija dentro de la
    transacción con set_config(..., es_local => true), que dura lo que dura la
    transacción y solo en esa conexión.
*/

import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

import { configuracionBd, numeroDelEntorno } from "./configuracion.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizServidor = path.resolve(aqui, "..", "..");

// Se carga el .env del servidor por ruta explícita, para que funcione igual si
// el proceso se arranca desde la raíz del proyecto o desde servidor/.
dotenv.config({ path: path.join(raizServidor, ".env"), quiet: true });

const { Pool, types } = pg;

/*
  PostgreSQL devuelve los NUMERIC como texto para no perder decimales. Aquí se
  convierten a número, que es lo que necesita el cliente. Para el tamaño de este
  sistema (montos con dos decimales) no hay pérdida real.
*/
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

/*
  Los enteros grandes (BIGINT, tipo 20) también llegan como texto, para no perder
  precisión. Aquí se convierten a número.

  Por qué se hace: los BIGINT de este sistema son identificadores (id de bitácora,
  de movimiento de inventario), conteos (count(*)) y los correlativos de la
  secuencia de comprobantes. Si llegan como texto, una resta como
  "ultimo_numero + 1" concatena en vez de sumar y el error es silencioso: aparece
  mucho después y donde no se lo espera.

  El límite: JavaScript pierde precisión por encima de 9 007 199 254 740 991. Aquí
  no se llega ni de lejos. Si algún día se guardara un número más grande (no es el
  caso de nada de este sistema), habría que revisar esta línea.
*/
types.setTypeParser(20, (valor) => (valor === null ? null : Number(valor)));

// El tipo DATE (1082) llega como texto "2026-10-07", que es lo que queremos.
types.setTypeParser(1082, (valor) => valor);

/**
 * Los datos de conexión, tal como los lee el entorno.
 *
 * Se mantiene el nombre `configuracion` porque las pruebas y las herramientas
 * ya lo importaban así. La lógica real vive en configuracion.js.
 */
export function configuracion(extra = {}) {
  return configuracionBd(extra);
}

/** Crea un grupo de conexiones. Se usa el de abajo, salvo en las herramientas. */
export function crearPool(extra = {}) {
  const grupo = new Pool({
    ...configuracion(extra),
    // En Cloud Run se comparte una instancia pequeña de Cloud SQL entre pocas
    // instancias. BD_MAX_CONEXIONES permite bajarlo sin tocar el código.
    max: numeroDelEntorno("BD_MAX_CONEXIONES", 10),
    idleTimeoutMillis: numeroDelEntorno("BD_TIEMPO_INACTIVIDAD_MS", 30000),
    connectionTimeoutMillis: numeroDelEntorno("BD_TIEMPO_CONEXION_MS", 10000),
    statement_timeout: numeroDelEntorno("BD_TIEMPO_SENTENCIA_MS", 30000),
  });

  grupo.on("error", (error) => {
    console.error("[db] error inesperado en una conexión:", error.message);
  });

  return grupo;
}

const pool = crearPool();

/** Comprueba que la base exista y esté viva. Se llama al arrancar el servidor. */
export async function revisarConexion() {
  const { rows } = await pool.query("SELECT now() AS momento");
  return rows[0].momento;
}

/** Una consulta normal. Devuelve las filas. */
export async function consultar(texto, valores = []) {
  const { rows } = await pool.query(texto, valores);
  return rows;
}

/** Cuando solo se espera una fila. Devuelve null si no hay ninguna. */
export async function consultarUno(texto, valores = []) {
  const filas = await consultar(texto, valores);
  return filas[0] ?? null;
}

/** Cuando solo se espera un número (un id, un total, un conteo). */
export async function consultarNumero(texto, valores = []) {
  const fila = await consultarUno(texto, valores);
  return fila === null ? null : Number(Object.values(fila)[0]);
}

/**
 * Para las operaciones que tienen que salir bien enteras (cobrar una cuenta,
 * emitir un comprobante, aplicar un descuento) se usa conTransaccion. Si algo
 * falla en el medio, se deshace todo.
 *
 * `usuario` es el nombre de usuario que quedará en la bitácora.
 */
export async function conTransaccion(trabajo, { usuario = null } = {}) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    if (usuario) {
      // es_local => true: el valor dura lo que dura la transacción.
      await cliente.query("SELECT set_config('app.usuario', $1, true)", [usuario]);
    }

    const ayudas = {
      cliente,
      consultar: async (texto, valores = []) => (await cliente.query(texto, valores)).rows,
      consultarUno: async (texto, valores = []) =>
        (await cliente.query(texto, valores)).rows[0] ?? null,
      consultarNumero: async (texto, valores = []) => {
        const fila = (await cliente.query(texto, valores)).rows[0];
        return fila ? Number(Object.values(fila)[0]) : null;
      },
    };

    const resultado = await trabajo(ayudas);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/** Cierra el grupo de conexiones. Se usa al apagar el servidor. */
export async function cerrarConexion() {
  await pool.end();
}

export default pool;
