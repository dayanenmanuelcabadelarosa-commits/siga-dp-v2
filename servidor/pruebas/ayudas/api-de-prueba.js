/*
  api-de-prueba.js — hablarle a la API de verdad, con PostgreSQL de verdad.
  ------------------------------------------------------------------------

  Diferencia importante con base-de-prueba.js:

    · base-de-prueba.js corre cada prueba DENTRO de una transacción que se
      deshace al terminar. Sirve para probar la base directamente.

    · Aquí no se puede hacer eso. Una petición HTTP la atiende otra conexión del
      grupo, y esa otra conexión NO ve los datos que la prueba todavía no ha
      confirmado. Por eso, lo que estas pruebas preparan, lo prepare con COMMIT
      (sentencias sueltas en `sql()`), y se limpia al final del archivo.

  Cómo se deja todo limpio
    Al terminar el archivo se borra lo que se haya creado y se vuelve a cargar la
    semilla, así que la base de pruebas queda igual que recién creada.

    El borrado se hace con TRUNCATE y no con DELETE por un motivo que vale la pena
    tener presente: desde la migración 010, un disparador impide borrar empleados
    (RN-16). TRUNCATE no dispara esos disparadores por fila, que es justo lo que
    aquí se necesita.
*/

import fs from "node:fs";
import path from "node:path";

import pg from "pg";
import request from "supertest";

import { sembrarBase } from "../../herramientas/semilla.js";
import { carpetaMigraciones, nombreBaseDePrueba } from "../../herramientas/comun.js";
import { cifrarClave } from "../../src/acceso/claves.js";
import { crearApp } from "../../src/app.js";
import { configuracion } from "../../src/db/conexion.js";

export const baseDePrueba = nombreBaseDePrueba();

/*
  La matriz de permisos vive en la migración 011. Las pruebas que la tocan (por
  ejemplo, apagando una casilla para comprobar que entonces no deja pasar) tienen
  que devolverla a su estado al terminar; si no, dejarían la base de pruebas con
  una autorización que nadie aprobó.

  Por eso se guarda el nombre del archivo en un solo lugar: para que la ayuda y la
  migración no se puedan separar.
*/
export const ARCHIVOS_DE_LA_MATRIZ = [
  "011_matriz_de_permisos.sql",
  "014_permiso_reportar_agotado.sql",
  "016_cortesia_solo_dueno.sql",
];

/** La clave del gerente que deja la semilla de desarrollo. */
export const CLAVE_DE_DESARROLLO = "gerente";

/*
  La aplicación de verdad. Los frenos de peticiones se ponen altísimos para que
  no estorben: las pruebas que quieren comprobar el freno arman su propia
  aplicación con el límite bajo (ver `appConFrenos`).
*/
export function appDePrueba(opciones = {}) {
  return crearApp({
    limites: { peticiones: 100000, ingresos: 100000, ...(opciones.limites ?? {}) },
  });
}

/** Una aplicación con los frenos que se le digan. Para probar el rate limiting. */
export function appConFrenos(limites) {
  return crearApp({ limites });
}

const pool = new pg.Pool({ ...configuracion({ database: baseDePrueba }), max: 2 });

/** Ejecuta SQL y devuelve las filas. Se confirma (COMMIT) de inmediato. */
export async function sql(texto, valores = []) {
  return (await pool.query(texto, valores)).rows;
}

/** Igual, pero para cuando solo se espera una fila. */
export async function uno(texto, valores = []) {
  return (await pool.query(texto, valores)).rows[0] ?? null;
}

/** Cierra el grupo de conexiones de este archivo de pruebas. */
export async function cerrarAyudas() {
  await pool.end();
}

/**
 * Vuelve a dejar la matriz de permisos exactamente como la dejó la migración 011.
 * Se vacía la tabla y se vuelve a aplicar el archivo aprobado, que es la única
 * fuente de verdad: así una prueba no puede dejar una autorización inventada.
 */
export async function restaurarLaMatriz() {
  await pool.query("TRUNCATE rol_permiso");

  /*
    No basta con la 011: la 014 agregó la operación 28 y sus casillas. Si aquí
    solo se aplicara la 011, la cocina perdería `REPORTAR_AGOTADO` después de
    cada `dejarLaBaseComoNueva()` y las pruebas de esa ruta darían 403. Se
    aplican en orden, igual que lo haría el migrador.
  */
  for (const nombre of ARCHIVOS_DE_LA_MATRIZ) {
    const archivo = path.join(carpetaMigraciones, nombre);
    const sql = fs.readFileSync(archivo, "utf8");
    await pool.query(sql);
  }
}

/**
 * Deja la base de pruebas como recién creada: borra lo que hayan dejado las
 * pruebas y vuelve a cargar la semilla y la matriz de permisos.
 */
export async function dejarLaBaseComoNueva() {
  await sql("TRUNCATE usuario, empleado, rol_permiso RESTART IDENTITY CASCADE");
  await sembrarBase({ base: baseDePrueba, avisar: () => {} });
  await restaurarLaMatriz();
}

/**
 * Deja el catálogo como recién creado: vacía productos, categorías y estaciones
 * y vuelve a cargar la semilla. Se usa en las pruebas del catálogo, que crean
 * datos con COMMIT (no dentro de una transacción) para que la API los vea.
 *
 * El TRUNCATE va en cascada porque varias tablas de ventas apuntan a producto o
 * estación. A esas alturas no hay ventas de verdad: la base de pruebas solo
 * tiene lo que dejaron las pruebas anteriores, y la semilla restaura el catálogo.
 */
export async function dejarElCatalogoComoNuevo() {
  await sql("TRUNCATE producto, categoria, estacion RESTART IDENTITY CASCADE");
  await sembrarBase({ base: baseDePrueba, avisar: () => {} });
}

/**
 * Deja el salón como recién creado: vacía reservas, mesas y zonas y vuelve a
 * cargar la semilla. Se usa en las pruebas de mesas, que crean datos con COMMIT
 * para que la API los vea.
 *
 * El TRUNCATE va en cascada porque las mesas aparecen en pedidos y cuentas de
 * pruebas anteriores. La semilla vuelve a dejar la zona y la mesa mínimas.
 */
export async function dejarElSalonComoNuevo() {
  await sql("TRUNCATE reserva, mesa, zona RESTART IDENTITY CASCADE");
  await sembrarBase({ base: baseDePrueba, avisar: () => {} });
}

/**
 * Deja el inventario como recién creado: vacía movimientos, existencias,
 * insumos y proveedores y vuelve a cargar la semilla. Se usa en las pruebas del
 * inventario, que crean datos con COMMIT para que la API los vea.
 *
 * No se vacían `unidad_medida` ni `punto_acceso`: son catálogos que la semilla
 * deja y que las pruebas pueden ampliar. El TRUNCATE va en cascada porque
 * `producto_componente` (las recetas, de una fase posterior) apunta a `insumo`.
 */
export async function dejarElInventarioComoNuevo() {
  await sql(
    "TRUNCATE movimiento_inventario, existencia, insumo, proveedor RESTART IDENTITY CASCADE",
  );
  await sembrarBase({ base: baseDePrueba, avisar: () => {} });
}

/**
 * Devuelve las cuentas y la matriz a su estado de partida, ANTES de cada prueba.
 * Sin esto, una prueba que bloquea la cuenta del gerente dejaría a las siguientes
 * sin poder entrar, y una que apaga un permiso lo dejaría apagado.
 */
export async function reiniciarCuentas() {
  await sql("UPDATE usuario  SET estado = 'Activo', intentos_fallidos = 0");
  await sql("UPDATE empleado SET estado = 'Activo'");
  await restaurarLaMatriz();
}

/**
 * Crea un empleado con su cuenta de acceso, con la clave ya cifrada.
 * Se confirma de inmediato, para que la API lo vea.
 *
 * @param {object} datos
 * @param {string} datos.usuario  Nombre de usuario.
 * @param {string} datos.rol      Código del rol ('mesero', 'cajero', ...).
 * @param {string} [datos.clave]  Por defecto, la misma del gerente.
 * @param {string} [datos.estado] Estado del empleado y de la cuenta.
 */
export async function crearCuenta({ usuario, rol, clave = CLAVE_DE_DESARROLLO, estado = "Activo" }) {
  const hash = cifrarClave(clave);

  const empleado = await uno(
    `INSERT INTO empleado (cedula, nombre, id_rol, estado)
     SELECT $1, $2, r.id_rol, $4::estado_empleado
       FROM rol r WHERE r.codigo = $3
     RETURNING id_empleado, id_rol`,
    [`00-${usuario}`, `Prueba ${usuario}`, rol, estado],
  );

  if (!empleado) throw new Error(`No existe el rol "${rol}".`);

  const cuenta = await uno(
    `INSERT INTO usuario (usuario, clave_hash, id_empleado, estado)
     VALUES ($1, $2, $3, $4::estado_empleado)
     RETURNING id_usuario`,
    [usuario, hash, empleado.id_empleado, estado],
  );

  return { idUsuario: cuenta.id_usuario, idEmpleado: empleado.id_empleado, usuario, clave };
}

/** Le concede un permiso a un rol. Es como llenar una casilla de la matriz. */
export async function conceder(rol, codigoPermiso, permitido = true) {
  await sql(
    `INSERT INTO rol_permiso (id_rol, id_permiso, permitido)
     SELECT r.id_rol, p.id_permiso, $3
       FROM rol r, permiso p
      WHERE r.codigo = $1 AND p.codigo = $2
     ON CONFLICT (id_rol, id_permiso) DO UPDATE SET permitido = EXCLUDED.permitido`,
    [rol, codigoPermiso, permitido],
  );
}

/** Pide entrar y devuelve la respuesta tal cual, sin interpretarla. */
export function pedirEntrar(app, usuario, clave = CLAVE_DE_DESARROLLO) {
  return request(app).post("/api/acceso/entrar").send({ usuario, clave });
}

/** Pide entrar y devuelve el token. Falla con un mensaje claro si no pudo. */
export async function entrarYTomarToken(app, usuario = "gerente", clave = CLAVE_DE_DESARROLLO) {
  const respuesta = await pedirEntrar(app, usuario, clave);

  if (respuesta.status !== 200) {
    throw new Error(
      `No se pudo entrar como "${usuario}" (${respuesta.status}): ` +
        `${respuesta.body?.error?.mensaje ?? "sin mensaje"}`,
    );
  }

  return respuesta.body.datos.token;
}
