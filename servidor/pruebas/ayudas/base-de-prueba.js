/*
  base-de-prueba.js — conectar y fabricar datos para las pruebas.
  ---------------------------------------------------------------

  Regla del plan (sección 4): las pruebas van contra una base de datos de prueba
  REAL, no contra dobles de prueba ("mocks"). Este archivo es lo que hace eso
  cómodo.

  Cómo se aísla cada prueba
    Cada prueba corre dentro de una transacción. Al terminar se le hace ROLLBACK
    y no queda ni rastro: no hay que limpiar tablas ni ordenar los datos entre
    pruebas, y dos pruebas nunca se pisan.

  Cómo se comprueba que una regla rechaza algo
    La función `viola(...)` abre un punto de guardado ("savepoint"), intenta la
    operación prohibida, comprueba que falla y vuelve al punto de guardado. Sin el
    punto de guardado, el primer error dejaría la transacción entera de mal humor
    y no se podría seguir probando.
*/

import crypto from "node:crypto";

import pg from "pg";

import { nombreBaseDePrueba } from "../../herramientas/comun.js";
import { cifrarClave } from "../../src/acceso/claves.js";
// Se importa para que queden instalados los conversores de tipos (NUMERIC -> número).
import { configuracion } from "../../src/db/conexion.js";

export const baseDePrueba = nombreBaseDePrueba();

export const pool = new pg.Pool({ ...configuracion({ database: baseDePrueba }), max: 2 });

let contador = 0;
function nuevo(prefijo) {
  contador += 1;
  return `${prefijo}-${contador}`;
}

/** Un identificador irrepetible, para nombres y cédulas que son únicos. */
function unico() {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Corre `trabajo` dentro de una transacción que se deshace al terminar.
 * El trabajo recibe las ayudas de abajo (ayudas.sql, ayudas.viola, ...).
 */
export async function conBaseDePrueba(trabajo) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(crearAyudas(cliente));
    await cliente.query("ROLLBACK");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/** Cierra el grupo de conexiones. Se llama al terminar todas las pruebas. */
export async function cerrarPool() {
  await pool.end();
}

function crearAyudas(cliente) {
  const sql = async (texto, valores = []) => (await cliente.query(texto, valores)).rows;

  const uno = async (texto, valores = []) => (await sql(texto, valores))[0] ?? null;

  const numero = async (texto, valores = []) => {
    const fila = await uno(texto, valores);
    return fila === null ? null : Number(Object.values(fila)[0]);
  };

  /**
   * Intenta una operación que la base DEBE rechazar. Devuelve el error para que
   * la prueba pueda mirar su código. Si la base la acepta, la prueba falla con
   * un mensaje claro.
   */
  const viola = async (texto, valores = [], queEsperaba = "que la base rechazara la operación") => {
    await cliente.query("SAVEPOINT intento");
    try {
      await cliente.query(texto, valores);
    } catch (error) {
      await cliente.query("ROLLBACK TO SAVEPOINT intento");
      await cliente.query("RELEASE SAVEPOINT intento");
      return error;
    }
    await cliente.query("RELEASE SAVEPOINT intento");
    throw new Error(`Se esperaba ${queEsperaba}, pero la base la aceptó.`);
  };

  // ------------------------------------------------------------------ catálogos

  const ayudas = {
    sql,
    uno,
    numero,
    viola,

    async zona(nombre = nuevo("Zona")) {
      return numero("INSERT INTO zona (nombre, tipo_ambiente) VALUES ($1, 'Salón') RETURNING id_zona", [
        nombre,
      ]);
    },

    async estacion(nombre = nuevo("Estación")) {
      return numero("INSERT INTO estacion (nombre) VALUES ($1) RETURNING id_estacion", [nombre]);
    },

    async categoria(nombre = nuevo("Categoría")) {
      return numero("INSERT INTO categoria (nombre) VALUES ($1) RETURNING id_categoria", [nombre]);
    },

    async unidad(nombre = nuevo("Unidad")) {
      return numero(
        "INSERT INTO unidad_medida (nombre, abreviatura) VALUES ($1, 'u') RETURNING id_unidad",
        [nombre],
      );
    },

    async punto(nombre = nuevo("Punto"), esAlmacen = false) {
      return numero(
        "INSERT INTO punto_acceso (nombre, es_almacen) VALUES ($1, $2) RETURNING id_punto",
        [nombre, esAlmacen],
      );
    },

    async proveedor({ nombre = nuevo("Proveedor") } = {}) {
      return numero(
        "INSERT INTO proveedor (nombre, telefono) VALUES ($1, '809-000-0000') RETURNING id_proveedor",
        [nombre],
      );
    },

    async insumo({ nombre = nuevo("Insumo"), idUnidad, minimo = 10 } = {}) {
      const unidad = idUnidad ?? (await ayudas.unidad());
      return numero(
        "INSERT INTO insumo (nombre, id_unidad, minimo) VALUES ($1, $2, $3) RETURNING id_insumo",
        [nombre, unidad, minimo],
      );
    },

    async producto({ nombre = nuevo("Producto"), idCategoria, idEstacion, precio = 100 } = {}) {
      const categoria = idCategoria ?? (await ayudas.categoria());
      const estacion = idEstacion ?? (await ayudas.estacion());
      return numero(
        `INSERT INTO producto (nombre, id_categoria, id_estacion, precio)
         VALUES ($1, $2, $3, $4) RETURNING id_producto`,
        [nombre, categoria, estacion, precio],
      );
    },

    async empleado({ rol = "mesero", nombre = nuevo("Empleado"), cedula } = {}) {
      const idRol = await numero("SELECT id_rol FROM rol WHERE codigo = $1", [rol]);
      if (idRol === null) throw new Error(`No existe el rol "${rol}" en la base de pruebas.`);

      return numero(
        `INSERT INTO empleado (cedula, nombre, id_rol) VALUES ($1, $2, $3) RETURNING id_empleado`,
        [cedula ?? `C-${unico()}`, nombre, idRol],
      );
    },

    async usuario({ idEmpleado, nombre = nuevo("usuario"), clave = "prueba" } = {}) {
      const empleado = idEmpleado ?? (await ayudas.empleado());
      return numero(
        `INSERT INTO usuario (usuario, clave_hash, id_empleado) VALUES ($1, $2, $3) RETURNING id_usuario`,
        [nombre, cifrarClave(clave), empleado],
      );
    },

    // -------------------------------------------------------------------- salón

    async mesa({ idZona, numero: numeroMesa, capacidad = 8 } = {}) {
      const zona = idZona ?? (await ayudas.zona());
      // Los números de prueba empiezan en 1000 para no chocar con la mesa 1 de
      // la semilla, y suben con el contador para que no se repitan.
      const n = numeroMesa ?? 1000 + contador;
      contador += 1;
      return numero(
        "INSERT INTO mesa (numero, id_zona, capacidad) VALUES ($1, $2, $3) RETURNING id_mesa",
        [n, zona, capacidad],
      );
    },

    /** Deja la mesa ocupada, que es el requisito para abrirle un pedido. */
    async ocupar(idMesa, personas = 2) {
      await sql(
        `UPDATE mesa SET estado = 'ocupada', personas = $2, hora_llegada = now()
          WHERE id_mesa = $1`,
        [idMesa, personas],
      );
    },

    // ---------------------------------------------------------------- servicio

    /**
     * Monta un servicio completo: mesa ocupada, pedido abierto con sus comensales,
     * una comanda y las líneas ya enviadas a la estación. Es el punto de partida
     * de casi todas las reglas de la operación.
     */
    async servicio({ comensales = 1, cuantasLineas = 1, precios } = {}) {
      const idZona = await ayudas.zona();
      const idMesa = await ayudas.mesa({ idZona, capacidad: 10 });
      const idMesero = await ayudas.empleado({ rol: "mesero" });
      const idCajero = await ayudas.empleado({ rol: "cajero" });
      const idCapitan = await ayudas.empleado({ rol: "capitan" });
      const idEstacion = await ayudas.estacion();
      const idCategoria = await ayudas.categoria();

      const productos = [];
      for (let i = 0; i < cuantasLineas; i += 1) {
        const precio = precios?.[i] ?? 100 * (i + 1);
        const idProducto = await ayudas.producto({ idCategoria, idEstacion, precio });
        productos.push({ idProducto, precio });
      }

      await ayudas.ocupar(idMesa, comensales);
      const idPedido = await numero("SELECT fn_abrir_pedido($1, $2, $3)", [
        idMesa,
        idMesero,
        comensales,
      ]);

      const idComanda = await numero(
        "INSERT INTO comanda (id_pedido, id_estacion) VALUES ($1, $2) RETURNING id_comanda",
        [idPedido, idEstacion],
      );

      const lineas = [];
      for (const producto of productos) {
        const idLineaPedido = await numero(
          `INSERT INTO linea_pedido (id_pedido, id_producto, comensal, cantidad, precio_unitario, estado)
           VALUES ($1, $2, 1, 1, $3, 'Enviada') RETURNING id_linea_pedido`,
          [idPedido, producto.idProducto, producto.precio],
        );

        await sql(
          `INSERT INTO linea_comanda (id_comanda, id_linea_pedido, cantidad, estado)
           VALUES ($1, $2, 1, 'Pendiente')`,
          [idComanda, idLineaPedido],
        );

        lineas.push({ idLineaPedido, ...producto });
      }

      return {
        idZona,
        idMesa,
        idMesero,
        idCajero,
        idCapitan,
        idEstacion,
        idCategoria,
        idPedido,
        idComanda,
        comensales,
        lineas,
        /** El total que debería dar la cuenta: la suma de las líneas. */
        total: lineas.reduce((suma, linea) => suma + linea.precio, 0),
      };
    },

    /** Genera la cuenta del servicio. Devuelve el id de la cuenta. */
    async generarCuenta(idMesa) {
      return numero("SELECT fn_generar_cuenta($1)", [idMesa]);
    },
  };

  return ayudas;
}
