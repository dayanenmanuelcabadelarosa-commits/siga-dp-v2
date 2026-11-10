/*
  pedidos.js (rutas) — Pedidos (Fase 5, módulo 1).
  -------------------------------------------------

  Endpoints:
    GET    /api/pedidos/:mesa            pedido abierto de una mesa
    GET    /api/pedidos                  todos los pedidos abiertos
    POST   /api/pedidos/:mesa/abrir      abrir un pedido en una mesa ocupada
    POST   /api/pedidos/:mesa/lineas     agregar una línea al pedido
    PATCH  /api/pedidos/lineas/:id       editar cantidad u observación
    DELETE /api/pedidos/lineas/:id       anular una línea (con motivo)
    POST   /api/pedidos/:mesa/enviar     enviar el pedido a cocina
    POST   /api/pedidos/:mesa/pedir-cuenta   avisar al cajero que piden la cuenta
    DELETE /api/pedidos/:mesa/pedir-cuenta   retirar ese aviso

  Permiso: CAPTURAR_PEDIDO (dueño, gerente, mesero).

  Reglas:
    · RN-01: un pedido abierto por mesa (índice único parcial).
    · RN-02: precio y nombre se copian al pedir.
    · fn_abrir_pedido valida que la mesa esté ocupada.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import {
  esquemaAbrirPedido,
  esquemaAgregarLinea,
  esquemaAnularLinea,
  esquemaEditarLinea,
} from "../validaciones/pedidos.js";
import { validar } from "../validaciones/validar.js";

const SELECT_LINEAS = `
  SELECT lp.id_linea_pedido AS id,
         lp.id_producto     AS "productoId",
         pr.nombre          AS nombre,
         lp.precio_unitario AS precio,
         lp.cantidad,
         COALESCE(lp.observacion, '') AS observacion,
         lp.comensal        AS persona,
         lp.estado
    FROM linea_pedido lp
    JOIN producto pr ON pr.id_producto = lp.id_producto`;

/*
  El seguimiento que ve el mesero: las comandas que salieron de este pedido,
  con su estación, su estado y lo que lleva cada una. No es la pantalla de
  cocina; es una lectura para que el mesero sepa si el plato sigue pendiente, se
  está preparando o ya está listo. La escribe la cocina; el mesero solo la lee.
*/
const SELECT_COMANDAS = `
  SELECT c.id_comanda,
         c.numero,
         c.estado,
         e.nombre AS estacion,
         to_char(c.enviada_en, 'HH24:MI') AS enviada,
         COALESCE(
           json_agg(
             json_build_object(
               'producto', pr.nombre,
               'cantidad', lc.cantidad,
               'estado',   lc.estado
             ) ORDER BY lc.id_linea_comanda
           ) FILTER (WHERE lc.id_linea_comanda IS NOT NULL),
           '[]'::JSON
         ) AS lineas
    FROM comanda c
    JOIN estacion e        ON e.id_estacion        = c.id_estacion
    LEFT JOIN linea_comanda lc ON lc.id_comanda    = c.id_comanda
    LEFT JOIN linea_pedido lp  ON lp.id_linea_pedido = lc.id_linea_pedido
    LEFT JOIN producto pr      ON pr.id_producto   = lp.id_producto
   WHERE c.id_pedido = $1
   GROUP BY c.id_comanda, c.numero, c.estado, e.nombre, c.enviada_en
   ORDER BY c.id_comanda`;

async function pedidoDe(consultarUno, consultar, mesaNumero) {
  const cabecera = await consultarUno(
    `SELECT p.id_pedido,
            m.numero  AS mesa,
            e.nombre  AS mesero,
            p.estado,
            m.cuenta_pedida_en,
            to_char(p.abierto_en, 'HH24:MI') AS hora
       FROM pedido p
       JOIN mesa m     ON m.id_mesa = p.id_mesa
       JOIN empleado e ON e.id_empleado = p.id_mesero
      WHERE m.numero = $1 AND p.estado IN ('Abierto', 'Enviado')
      ORDER BY p.id_pedido DESC LIMIT 1`,
    [mesaNumero],
  );
  if (!cabecera) return null;

  const lineas = await consultar(
    `${SELECT_LINEAS} WHERE lp.id_pedido = $1 AND lp.estado <> 'Anulada' ORDER BY lp.id_linea_pedido`,
    [cabecera.id_pedido],
  );

  const comandas = await consultar(SELECT_COMANDAS, [cabecera.id_pedido]);

  return { ...cabecera, lineas, comandas };
}

function idDeLaRuta(req, que) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", `El identificador de ${que} no es válido.`);
  }
  return id;
}

/*
  Las funciones de la base levantan P0001 con mensajes escritos para la persona
  que usa el sistema (por ejemplo, "Envía primero a cocina..."). P0002 es una
  mesa que no existe. Cualquier otro error sigue su camino al manejador global.
*/
function errorDeLaCuenta(fallo) {
  if (fallo instanceof ErrorDeApi) return fallo;
  if (fallo?.code === "P0002") {
    return new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
  }
  if (fallo?.code === "P0001") {
    return new ErrorDeApi(409, "CONFLICTO_DE_ESTADO", fallo.message);
  }
  return fallo;
}

export function rutasDePedidos() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // GET /api/pedidos/:mesa
  rutas.get(
    "/:mesa",
    requierePermiso("CAPTURAR_PEDIDO"),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }
      const pedido = await pedidoDe(consultarUno, consultar, mesa);
      exito(res, pedido);
    }),
  );

  // GET /api/pedidos
  /*
    La lista de todos los pedidos, con filtros opcionales por estado y por
    fecha. El total sale de la base (cantidad por precio congelado), nunca de
    una suma hecha en JavaScript.
  */
  rutas.get(
    "/",
    requierePermiso("CAPTURAR_PEDIDO"),
    asyncHandler(async (req, res) => {
      const condiciones = [];
      const valores = [];

      const estado = req.query.estado;
      if (typeof estado === "string" && estado !== "" && estado !== "Todos") {
        valores.push(estado);
        condiciones.push(`p.estado = $${valores.length}`);
      }

      const fecha = req.query.fecha;
      if (typeof fecha === "string" && fecha !== "") {
        valores.push(fecha);
        condiciones.push(
          `(p.abierto_en AT TIME ZONE 'America/Santo_Domingo')::date = $${valores.length}::date`,
        );
      }

      const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

      const pedidos = await consultar(
        `SELECT p.id_pedido,
                m.numero AS mesa,
                e.nombre AS mesero,
                p.estado,
                m.cuenta_pedida_en,
                to_char(
                  p.abierto_en AT TIME ZONE 'America/Santo_Domingo',
                  'HH24:MI'
                ) AS hora,
                COALESCE(
                  SUM(lp.cantidad * lp.precio_unitario)
                    FILTER (WHERE lp.estado <> 'Anulada'),
                  0
                )::FLOAT8 AS total
           FROM pedido p
           JOIN mesa m ON m.id_mesa = p.id_mesa
           JOIN empleado e ON e.id_empleado = p.id_mesero
           LEFT JOIN linea_pedido lp ON lp.id_pedido = p.id_pedido
           ${where}
          GROUP BY p.id_pedido, m.numero, e.nombre, p.estado,
                   m.cuenta_pedida_en, p.abierto_en
          ORDER BY p.abierto_en DESC
          LIMIT 200`,
        valores,
      );

      for (const pedido of pedidos) {
        pedido.lineas = await consultar(
          `${SELECT_LINEAS} WHERE lp.id_pedido = $1 AND lp.estado <> 'Anulada' ORDER BY lp.id_linea_pedido`,
          [pedido.id_pedido],
        );
        pedido.comandas = await consultar(SELECT_COMANDAS, [pedido.id_pedido]);
      }

      exito(res, pedidos);
    }),
  );

  // POST /api/pedidos/:mesa/pedir-cuenta
  /*
    El mesero avisa que la mesa quiere la cuenta. No genera la cuenta: solo
    deja `mesa.cuenta_pedida_en` para que el cajero la vea en su cola. La
    función de la base comprueba que el consumo esté enviado y que la cuenta
    no exista todavía.
  */
  rutas.post(
    "/:mesa/pedir-cuenta",
    requierePermiso("CAPTURAR_PEDIDO"),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }

      try {
        await conTransaccion(
          async ({ consultarUno }) => {
            const filaMesa = await consultarUno(
              "SELECT id_mesa FROM mesa WHERE numero = $1",
              [mesa],
            );
            if (!filaMesa) {
              throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
            }

            await consultarUno("SELECT fn_pedir_cuenta($1)", [filaMesa.id_mesa]);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (fallo) {
        throw errorDeLaCuenta(fallo);
      }

      const pedido = await pedidoDe(consultarUno, consultar, mesa);
      exito(res, {
        pedido,
        mensaje: "La mesa pidió la cuenta. El cajero ya la ve en su lista.",
      });
    }),
  );

  // DELETE /api/pedidos/:mesa/pedir-cuenta
  rutas.delete(
    "/:mesa/pedir-cuenta",
    requierePermiso("CAPTURAR_PEDIDO"),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }

      try {
        await conTransaccion(
          async ({ consultarUno }) => {
            const filaMesa = await consultarUno(
              "SELECT id_mesa FROM mesa WHERE numero = $1",
              [mesa],
            );
            if (!filaMesa) {
              throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
            }

            await consultarUno("SELECT fn_quitar_cuenta_pedida($1)", [
              filaMesa.id_mesa,
            ]);
          },
          { usuario: req.sesion.usuario },
        );
      } catch (fallo) {
        throw errorDeLaCuenta(fallo);
      }

      const pedido = await pedidoDe(consultarUno, consultar, mesa);
      exito(res, {
        pedido,
        mensaje: "El aviso de cuenta se retiró.",
      });
    }),
  );

  // POST /api/pedidos/:mesa/abrir
  rutas.post(
    "/:mesa/abrir",
    requierePermiso("CAPTURAR_PEDIDO"),
    validar(esquemaAbrirPedido),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }
      const { mesero, comensales } = req.datos;

      const idPedido = await conTransaccion(async ({ consultarUno }) => {
        const filaMesa = await consultarUno("SELECT id_mesa FROM mesa WHERE numero = $1", [mesa]);
        if (!filaMesa) {
          throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
        }

        let meseroId = req.sesion.idEmpleado;
        if (mesero) {
          const emp = await consultarUno("SELECT id_empleado FROM empleado WHERE nombre = $1", [mesero]);
          if (emp) meseroId = emp.id_empleado;
        }
        if (!meseroId) {
          throw new ErrorDeApi(400, "DATOS_INVALIDOS", "No se sabe qué mesero abre el pedido.");
        }

        let resultado;
        try {
          resultado = await consultarUno("SELECT fn_abrir_pedido($1, $2, $3) AS id", [
            filaMesa.id_mesa,
            meseroId,
            comensales,
          ]);
        } catch {
          throw new ErrorDeApi(
            409,
            "CONFLICTO_DE_ESTADO",
            "Solo se puede abrir un pedido en una mesa ocupada.",
          );
        }

        await consultarUno(
          "UPDATE mesa SET id_mesero_orden = $1, estado_pedido = 'Tomando pedido' WHERE id_mesa = $2",
          [meseroId, filaMesa.id_mesa],
        );

        return resultado.id;
      }, { usuario: req.sesion.usuario });

      const pedido = await pedidoDe(consultarUno, consultar, mesa);
      exito(res, { id: idPedido, pedido, mensaje: "Pedido abierto." }, 201);
    }),
  );

  // POST /api/pedidos/:mesa/lineas
  rutas.post(
    "/:mesa/lineas",
    requierePermiso("CAPTURAR_PEDIDO"),
    validar(esquemaAgregarLinea),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }
      const { productoId, cantidad, observacion, persona } = req.datos;

      const idLinea = await conTransaccion(async ({ consultarUno }) => {
        const pedido = await consultarUno(
          `SELECT p.id_pedido FROM pedido p JOIN mesa m ON m.id_mesa = p.id_mesa
            WHERE m.numero = $1 AND p.estado IN ('Abierto', 'Enviado') ORDER BY p.id_pedido DESC LIMIT 1`,
          [mesa],
        );
        if (!pedido) {
          throw new ErrorDeApi(400, "CONFLICTO_DE_ESTADO", "La mesa no tiene un pedido abierto.");
        }

        const producto = await consultarUno(
          "SELECT precio, disponible, nombre FROM producto WHERE id_producto = $1",
          [productoId],
        );
        if (!producto) {
          throw new ErrorDeApi(404, "NO_ENCONTRADO", "Ese producto no existe.");
        }
        if (!producto.disponible) {
          throw new ErrorDeApi(409, "PRODUCTO_AGOTADO", `"${producto.nombre}" está agotado por ahora.`);
        }

        const linea = await consultarUno(
          `INSERT INTO linea_pedido (id_pedido, id_producto, comensal, cantidad, precio_unitario, observacion, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 'Guardada')
           RETURNING id_linea_pedido`,
          [pedido.id_pedido, productoId, persona, cantidad, producto.precio, observacion],
        );

        await consultarUno(
          "UPDATE mesa SET estado_pedido = 'Tomando pedido' WHERE id_mesa = (SELECT id_mesa FROM mesa WHERE numero = $1)",
          [mesa],
        );

        return linea.id_linea_pedido;
      }, { usuario: req.sesion.usuario });

      const pedido = await pedidoDe(consultarUno, consultar, mesa);
      exito(res, { id: idLinea, pedido }, 201);
    }),
  );

  // PATCH /api/pedidos/lineas/:id
  rutas.patch(
    "/lineas/:id",
    requierePermiso("CAPTURAR_PEDIDO"),
    validar(esquemaEditarLinea),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "línea");
      const { cantidad, observacion } = req.datos;

      const actual = await consultarUno("SELECT * FROM linea_pedido WHERE id_linea_pedido = $1", [id]);
      if (!actual) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa línea no existe.");
      }
      if (actual.estado === "Anulada") {
        throw new ErrorDeApi(409, "CONFLICTO_DE_ESTADO", "Esa línea ya está anulada.");
      }

      await consultarUno(
        `UPDATE linea_pedido
            SET cantidad = COALESCE($1, cantidad),
                observacion = COALESCE($2, observacion)
          WHERE id_linea_pedido = $3`,
        [cantidad ?? null, observacion ?? null, id],
      );

      const linea = await consultarUno(`${SELECT_LINEAS} WHERE lp.id_linea_pedido = $1`, [id]);
      exito(res, linea);
    }),
  );

  // DELETE /api/pedidos/lineas/:id
  rutas.delete(
    "/lineas/:id",
    requierePermiso("CAPTURAR_PEDIDO"),
    validar(esquemaAnularLinea, "cuerpo"),
    asyncHandler(async (req, res) => {
      const id = idDeLaRuta(req, "línea");
      const { motivo } = req.datos;

      const resultado = await consultarUno(
        `UPDATE linea_pedido SET estado = 'Anulada', motivo_anulacion = $1
          WHERE id_linea_pedido = $2 AND estado <> 'Anulada' RETURNING id_linea_pedido`,
        [motivo ?? "El mesero quitó el producto del pedido", id],
      );
      if (!resultado) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa línea no existe o ya estaba anulada.");
      }
      exito(res, { mensaje: "Línea anulada." });
    }),
  );

  // POST /api/pedidos/:mesa/enviar
  rutas.post(
    "/:mesa/enviar",
    requierePermiso("CAPTURAR_PEDIDO"),
    asyncHandler(async (req, res) => {
      const mesa = Number(req.params.mesa);
      if (!Number.isInteger(mesa) || mesa <= 0) {
        throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
      }

      const numeros = await conTransaccion(async ({ consultarUno, consultar }) => {
        const pedido = await consultarUno(
          `SELECT p.id_pedido FROM pedido p JOIN mesa m ON m.id_mesa = p.id_mesa
            WHERE m.numero = $1 AND p.estado IN ('Abierto', 'Enviado') ORDER BY p.id_pedido DESC LIMIT 1`,
          [mesa],
        );
        if (!pedido) {
          throw new ErrorDeApi(400, "CONFLICTO_DE_ESTADO", "La mesa no tiene un pedido abierto.");
        }

        const pendientes = await consultar(
          "SELECT id_linea_pedido FROM linea_pedido WHERE id_pedido = $1 AND estado = 'Guardada'",
          [pedido.id_pedido],
        );
        if (pendientes.length === 0) {
          throw new ErrorDeApi(400, "CONFLICTO_DE_ESTADO", "No hay nada nuevo que enviar.");
        }

        const estaciones = await consultar(
          `SELECT DISTINCT e.id_estacion, e.nombre
             FROM linea_pedido lp
             JOIN producto pr ON pr.id_producto = lp.id_producto
             JOIN estacion e  ON e.id_estacion = pr.id_estacion
            WHERE lp.id_pedido = $1 AND lp.estado = 'Guardada'`,
          [pedido.id_pedido],
        );

        const numerosComanda = [];
        for (const est of estaciones) {
          const comanda = await consultarUno(
            "INSERT INTO comanda (id_pedido, id_estacion) VALUES ($1, $2) RETURNING id_comanda, numero",
            [pedido.id_pedido, est.id_estacion],
          );
          numerosComanda.push(comanda.numero);

          const lineas = await consultar(
            `SELECT lp.id_linea_pedido, lp.cantidad
               FROM linea_pedido lp
               JOIN producto pr ON pr.id_producto = lp.id_producto
              WHERE lp.id_pedido = $1 AND lp.estado = 'Guardada' AND pr.id_estacion = $2`,
            [pedido.id_pedido, est.id_estacion],
          );

          for (const linea of lineas) {
            await consultarUno(
              "INSERT INTO linea_comanda (id_comanda, id_linea_pedido, cantidad) VALUES ($1, $2, $3)",
              [comanda.id_comanda, linea.id_linea_pedido, linea.cantidad],
            );
            await consultarUno(
              "UPDATE linea_pedido SET estado = 'Enviada' WHERE id_linea_pedido = $1",
              [linea.id_linea_pedido],
            );
          }
        }

        await consultarUno(
          "UPDATE pedido SET estado = 'Enviado' WHERE id_pedido = $1",
          [pedido.id_pedido],
        );

        await consultarUno(
          "UPDATE mesa SET estado_pedido = 'En preparación' WHERE id_mesa = (SELECT id_mesa FROM mesa WHERE numero = $1)",
          [mesa],
        );

        return numerosComanda;
      }, { usuario: req.sesion.usuario });

      exito(res, { comandas: numeros, mensaje: `Comanda ${numeros.join(", ")} enviada(s).` });
    }),
  );

  return rutas;
}
