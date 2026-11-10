/*
  cuentas.js (rutas) — Cuenta y detalle de cuenta (Fase 6, módulo 1).
  -------------------------------------------------------------------

  Endpoints:
    GET  /api/cuentas              cuentas abiertas y mesas por facturar
    GET  /api/cuentas/:mesa        detalle de la cuenta abierta de una mesa
    POST /api/cuentas/:mesa/generar  arma la cuenta desde el pedido

  Permiso: GENERAR_CUENTA (dueño, gerente, capitán y cajero). Es el mismo
  permiso para las tres rutas porque las tres son parte de la misma tarea:
  saber qué hay que cobrar y generar la cuenta que se va a cobrar.

  Reglas:
    · RN-05: una sola cuenta abierta por mesa. La ruta es idempotente: si ya
      hay una, devuelve la que existe en vez de crear otra.
    · El total NO se calcula en JavaScript. Sale de `fn_total_cuenta`, la
      función de PostgreSQL que suma las líneas y resta los descuentos.
    · El detalle copia las líneas enviadas y no anuladas que ya guardó
      `fn_generar_cuenta`; esta ruta solo las lee.
    · Si el pedido tiene líneas sin enviar, la ruta responde 409. La función de
      la base genera una cuenta de RD$ 0 en ese caso (decisión 5); mientras el
      dueño no decida corregir la función, la ruta impide que eso llegue a la
      pantalla.

  Esta ruta no cobra, no aplica descuentos ni emite comprobantes. Eso son los
  módulos siguientes de la Fase 6.
*/

import express from "express";

import { requierePermiso, requiereSesion } from "../acceso/middleware.js";
import { puede } from "../acceso/autenticacion.js";
import { conTransaccion, consultar, consultarUno } from "../db/conexion.js";
import { asyncHandler, ErrorDeApi } from "../errores.js";
import { exito } from "../respuesta.js";
import { emitirFacturaElectronica } from "../servicios/facturacion.js";
import {
  esquemaAplicarCortesia,
  esquemaAplicarDescuento,
  esquemaAsignarLinea,
  esquemaCobrarCuenta,
  esquemaEmitirComprobante,
} from "../validaciones/cuentas.js";
import { esquemaAplicarOferta } from "../validaciones/ofertas.js";
import { validar } from "../validaciones/validar.js";

const SELECT_CUENTA = `
  SELECT c.id_cuenta      AS id,
         c.numero,
         m.numero         AS mesa,
         z.nombre         AS zona,
         e.nombre         AS mesero,
         c.estado,
         c.cortesia,
         fn_total_cuenta(c.id_cuenta) AS total,
         fn_servicio_de_la_cuenta(c.id_cuenta)::FLOAT8 AS servicio,
         c.abierta_en     AS "abiertaEn",
         to_char(c.abierta_en AT TIME ZONE 'America/Santo_Domingo', 'HH24:MI') AS hora
    FROM cuenta c
    JOIN mesa m     ON m.id_mesa = c.id_mesa
    JOIN zona z     ON z.id_zona = m.id_zona
    JOIN empleado e ON e.id_empleado = c.id_mesero
`;

const SELECT_LINEAS_DE_CUENTA = `
  SELECT lc.id_linea_cuenta AS id,
         lc.descripcion     AS producto,
         lc.cantidad,
         COALESCE((
           SELECT SUM(ap.cantidad)
             FROM asignacion_persona ap
            WHERE ap.id_linea_cuenta = lc.id_linea_cuenta
         ), 0)::INT AS "cantidadAsignada",
         lc.precio_unitario AS precio,
         lc.importe,
         lc.comensal        AS persona
    FROM linea_cuenta lc
   WHERE lc.id_cuenta = $1
   ORDER BY lc.id_linea_cuenta
`;

/**
 * La cuenta abierta de una mesa, con sus líneas. Devuelve `null` si la mesa no
 * tiene cuenta abierta. El total lo calcula PostgreSQL.
 */
async function cuentaDeMesa(consultarUna, consultarVarias, mesaNumero) {
  const cabecera = await consultarUna(
    `${SELECT_CUENTA}
      WHERE m.numero = $1
        AND c.estado = 'Abierta'
      ORDER BY c.id_cuenta DESC
      LIMIT 1`,
    [mesaNumero],
  );

  if (!cabecera) return null;

  const lineas = await consultarVarias(SELECT_LINEAS_DE_CUENTA, [cabecera.id]);
  const descuentos = await consultarVarias(
    `SELECT d.id_descuento   AS id,
            d.concepto,
            d.monto,
            d.tipo,
            e.nombre          AS "autorizadoPor",
            to_char(
              d.aplicado_en AT TIME ZONE 'America/Santo_Domingo',
              'HH24:MI'
            ) AS hora
       FROM descuento d
       JOIN empleado e ON e.id_empleado = d.id_autorizado_por
      WHERE d.id_cuenta = $1
      ORDER BY d.id_descuento`,
    [cabecera.id],
  );

  const asignaciones = await consultarVarias(
    `SELECT ap.comensal,
            COALESCE(SUM(ap.cantidad), 0)::INT AS cantidad,
            fn_total_comensal($1, ap.comensal)::FLOAT8 AS total,
            fn_servicio_del_comensal($1, ap.comensal)::FLOAT8 AS servicio,
            EXISTS (
              SELECT 1 FROM pago pg
               WHERE pg.id_cuenta = $1 AND pg.comensal = ap.comensal
            ) AS pagado
       FROM asignacion_persona ap
      WHERE ap.id_cuenta = $1
      GROUP BY ap.comensal
      ORDER BY ap.comensal`,
    [cabecera.id],
  );

  /*
    Los cobros de la cuenta con el comprobante que tienen (si lo tienen).
    Sirve para poder emitir el comprobante de un cobro que ya se hizo: si la
    emisión falló o el cajero siguió de largo, tiene que haber una forma de
    volver a intentarlo sin volver a cobrar.
  */
  const pagos = await consultarVarias(
    `SELECT pg.id_pago AS id,
            pg.comensal,
            pg.forma_pago AS forma,
            pg.referencia,
            (pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total,
            cb.id_comprobante AS "comprobanteId",
            cb.numero_ncf     AS "comprobanteNcf"
       FROM pago pg
       LEFT JOIN comprobante cb ON cb.id_pago = pg.id_pago
      WHERE pg.id_cuenta = $1
      ORDER BY pg.id_pago`,
    [cabecera.id],
  );

  return { ...cabecera, lineas, descuentos, asignaciones, pagos };
}

/** Lee el número de mesa de la dirección y lo valida. */
function numeroDeMesa(valor) {
  const mesa = Number(valor);

  if (!Number.isInteger(mesa) || mesa <= 0) {
    throw new ErrorDeApi(400, "DATOS_INVALIDOS", "El número de mesa no es válido.");
  }

  return mesa;
}

export function rutasDeCuentas() {
  const rutas = express.Router();
  rutas.use(requiereSesion);

  // GET /api/cuentas
  rutas.get(
    "/",
    requierePermiso("GENERAR_CUENTA"),
    asyncHandler(async (_req, res) => {
      const abiertas = await consultar(
        `${SELECT_CUENTA}
          WHERE c.estado = 'Abierta'
          ORDER BY c.abierta_en`,
      );

      /*
        Las mesas con pedido abierto que todavía no tienen cuenta. Se incluyen
        los conteos para que la pantalla pueda decir, sin adivinar, si falta
        enviar algo a cocina o si ya se puede generar la cuenta. La ruta que
        genera vuelve a comprobarlo todo.
      */
      const porGenerar = await consultar(
        `WITH pedidos_abiertos AS (
           SELECT DISTINCT ON (p.id_mesa)
                  p.id_pedido,
                  p.id_mesa,
                  p.id_mesero,
                  p.abierto_en
             FROM pedido p
            WHERE p.estado IN ('Abierto', 'Enviado')
            ORDER BY p.id_mesa, p.id_pedido DESC
         )
         SELECT m.id_mesa  AS "idMesa",
                m.numero,
                z.nombre   AS zona,
                m.personas,
                e.nombre   AS mesero,
                pa.id_pedido AS "idPedido",
                m.cuenta_pedida_en AS "cuentaPedidaEn",
                to_char(
                  pa.abierto_en AT TIME ZONE 'America/Santo_Domingo',
                  'HH24:MI'
                ) AS hora,
                to_char(
                  m.cuenta_pedida_en AT TIME ZONE 'America/Santo_Domingo',
                  'HH24:MI'
                ) AS "horaPedida",
                COUNT(lp.id_linea_pedido) FILTER (
                  WHERE lp.estado = 'Guardada'
                )::INT AS "lineasPendientes",
                COUNT(lp.id_linea_pedido) FILTER (
                  WHERE lp.estado = 'Enviada'
                    AND NOT EXISTS (
                          SELECT 1
                            FROM linea_comanda lc
                           WHERE lc.id_linea_pedido = lp.id_linea_pedido
                             AND lc.estado = 'Anulada'
                        )
                )::INT AS "lineasFacturables"
           FROM pedidos_abiertos pa
           JOIN mesa m     ON m.id_mesa = pa.id_mesa
           JOIN zona z     ON z.id_zona = m.id_zona
           JOIN empleado e ON e.id_empleado = pa.id_mesero
           LEFT JOIN linea_pedido lp ON lp.id_pedido = pa.id_pedido
          WHERE NOT EXISTS (
                  SELECT 1
                    FROM cuenta c
                   WHERE c.id_mesa = m.id_mesa
                     AND c.estado = 'Abierta'
                )
          GROUP BY m.id_mesa, m.numero, z.nombre, m.personas,
                   e.nombre, pa.id_pedido, pa.abierto_en, m.cuenta_pedida_en
          ORDER BY m.numero`,
      );

      /*
        La cola del cajero tiene dos grupos: las mesas que ya pidieron la cuenta
        y las que todavía no. El grupo se decide por el aviso que dejó el mesero
        (`cuenta_pedida_en`), no por adivinar en la pantalla.
      */
      const pedidas = porGenerar.filter(
        (mesa) => mesa.cuentaPedidaEn !== null,
      );
      const sinPedir = porGenerar.filter(
        (mesa) => mesa.cuentaPedidaEn === null,
      );

      exito(res, { abiertas, pedidas, porGenerar: sinPedir });
    }),
  );

  /*
    GET /api/cuentas/comprobantes-pendientes

    Los cobros que ya se hicieron y que todavía no tienen comprobante fiscal.
    Hace falta porque, si la emisión falla (o el cajero sigue de largo), el
    comprobante se tiene que poder emitir DESPUÉS, sin volver a cobrar. Va
    antes que "/:mesa" para que no lo se coma esa ruta.
  */
  rutas.get(
    "/comprobantes-pendientes",
    requierePermiso("EMITIR_COMPROBANTE"),
    asyncHandler(async (_req, res) => {
      const pendientes = await consultar(
        `SELECT pg.id_pago AS id,
                c.numero AS "numeroCuenta",
                m.numero AS mesa,
                pg.comensal,
                pg.forma_pago AS forma,
                pg.referencia,
                (pg.monto_recibido - COALESCE(pg.cambio, 0))::FLOAT8 AS total,
                to_char(
                  pg.pagado_en AT TIME ZONE 'America/Santo_Domingo',
                  'DD/MM/YYYY HH24:MI'
                ) AS fecha
           FROM pago pg
           JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
           JOIN mesa m ON m.id_mesa = c.id_mesa
          WHERE NOT EXISTS (
                  SELECT 1 FROM comprobante cb WHERE cb.id_pago = pg.id_pago
                )
          ORDER BY pg.pagado_en DESC
          LIMIT 50`,
      );

      exito(res, pendientes);
    }),
  );

  // GET /api/cuentas/:mesa
  rutas.get(
    "/:mesa",
    requierePermiso("GENERAR_CUENTA"),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);
      const cuenta = await cuentaDeMesa(consultarUno, consultar, mesa);
      exito(res, cuenta);
    }),
  );

  // POST /api/cuentas/:mesa/generar
  rutas.post(
    "/:mesa/generar",
    requierePermiso("GENERAR_CUENTA"),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);

      const resultado = await conTransaccion(
        async ({ consultar: consultarEnTransaccion, consultarUno: uno }) => {
          /*
            Se bloquea la mesa para que dos cobradores que pulsen "Generar" a
            la vez no intenten crear dos cuentas. El índice parcial
            uq_cuenta_abierta_por_mesa también lo impide, pero este bloqueo
            convierte la carrera en una espera corta y una respuesta clara.
          */
          const filaMesa = await uno(
            "SELECT id_mesa FROM mesa WHERE numero = $1 FOR UPDATE",
            [mesa],
          );

          if (!filaMesa) {
            throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no existe.");
          }

          const abierta = await uno(
            `SELECT id_cuenta
               FROM cuenta
              WHERE id_mesa = $1 AND estado = 'Abierta'
              LIMIT 1`,
            [filaMesa.id_mesa],
          );

          if (abierta) {
            const cuenta = await cuentaDeMesa(uno, consultarEnTransaccion, mesa);
            return { id: abierta.id_cuenta, creada: false, cuenta };
          }

          const pedido = await uno(
            `SELECT id_pedido
               FROM pedido
              WHERE id_mesa = $1 AND estado IN ('Abierto', 'Enviado')
              ORDER BY id_pedido DESC
              LIMIT 1`,
            [filaMesa.id_mesa],
          );

          if (!pedido) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `La mesa ${mesa} no tiene un pedido abierto para facturar.`,
            );
          }

          const conteo = await uno(
            `SELECT COUNT(*) FILTER (
                      WHERE lp.estado = 'Guardada'
                    )::INT AS pendientes,
                    COUNT(*) FILTER (
                      WHERE lp.estado = 'Enviada'
                        AND NOT EXISTS (
                              SELECT 1
                                FROM linea_comanda lc
                               WHERE lc.id_linea_pedido = lp.id_linea_pedido
                                 AND lc.estado = 'Anulada'
                            )
                    )::INT AS facturables
               FROM linea_pedido lp
              WHERE lp.id_pedido = $1`,
            [pedido.id_pedido],
          );

          if (conteo.pendientes > 0) {
            const cuantas = conteo.pendientes === 1 ? "una línea" : `${conteo.pendientes} líneas`;
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `La mesa ${mesa} tiene ${cuantas} sin enviar. Envíalas a cocina antes de generar la cuenta.`,
            );
          }

          if (conteo.facturables === 0) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `La mesa ${mesa} no tiene consumo enviado que cobrar.`,
            );
          }

          let generada;

          try {
            generada = await uno("SELECT fn_generar_cuenta($1) AS id", [
              filaMesa.id_mesa,
            ]);
          } catch {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `No se pudo generar la cuenta de la mesa ${mesa}. Refresca y vuelve a intentarlo.`,
            );
          }

          const cuenta = await cuentaDeMesa(uno, consultarEnTransaccion, mesa);

          if (!cuenta) {
            // No debería pasar: la función acaba de crear la cuenta.
            throw new ErrorDeApi(
              500,
              "ERROR_INTERNO",
              "La cuenta se generó, pero no se pudo leer. Usa Refrescar.",
            );
          }

          return { id: generada.id, creada: true, cuenta };
        },
        { usuario: req.sesion.usuario },
      );

      exito(
        res,
        {
          ...resultado,
          mensaje: resultado.creada
            ? `Cuenta ${resultado.cuenta.numero} generada para la mesa ${mesa}.`
            : `La mesa ${mesa} ya tenía la cuenta ${resultado.cuenta.numero} abierta.`,
        },
        resultado.creada ? 201 : 200,
      );
    }),
  );

  // POST /api/cuentas/:mesa/ofertas
  /*
    Aplica una oferta (un descuento que definió la gerencia) a la cuenta. El
    descuento se guarda en la tabla `descuento`, de donde `fn_total_cuenta` lo
    descuenta: la cuenta se recalcula sola, en la base. Aquí no interviene la IA.
  */
  rutas.post(
    "/:mesa/ofertas",
    requierePermiso("REGISTRAR_PAGO"),
    validar(esquemaAplicarOferta),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);
      const { idOferta } = req.datos;

      const resultado = await conTransaccion(
        async ({ consultarUno: uno, consultar: consultarEnTransaccion }) => {
          const cuenta = await uno(
            `SELECT c.id_cuenta, c.estado
               FROM cuenta c
               JOIN mesa m ON m.id_mesa = c.id_mesa
              WHERE m.numero = $1
                AND c.estado = 'Abierta'
              FOR UPDATE OF c`,
            [mesa],
          );

          if (!cuenta) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Esa mesa no tiene una cuenta abierta.",
            );
          }

          const oferta = await uno(
            `SELECT p.nombre, p.tipo_valor, p.valor::FLOAT8 AS valor
               FROM promocion p
              WHERE p.id_promocion = $1
                AND p.activo
                AND (p.fecha_inicio IS NULL
                     OR p.fecha_inicio <= (now() AT TIME ZONE 'America/Santo_Domingo')::date)
                AND (p.fecha_fin IS NULL
                     OR p.fecha_fin >= (now() AT TIME ZONE 'America/Santo_Domingo')::date)`,
            [idOferta],
          );

          if (!oferta) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "Esa oferta no está activa o ya no está de plazo.",
            );
          }

          const totalFila = await uno(
            "SELECT fn_total_cuenta($1)::FLOAT8 AS total FROM cuenta WHERE id_cuenta = $1",
            [cuenta.id_cuenta],
          );
          const total = Number(totalFila?.total ?? 0);

          const monto =
            oferta.tipo_valor === "Porcentaje"
              ? Math.round(((total * Number(oferta.valor)) / 100) * 100) / 100
              : Number(oferta.valor);

          if (monto <= 0) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "La oferta no aplica a esta cuenta.",
            );
          }

          if (monto > total) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "El descuento de la oferta es mayor que el total de la cuenta.",
            );
          }

          await uno(
            `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
             VALUES ($1, $2, $3, 'Descuento', $4)`,
            [cuenta.id_cuenta, oferta.nombre, monto, req.sesion.idEmpleado],
          );

          const cuentaActualizada = await cuentaDeMesa(
            uno,
            consultarEnTransaccion,
            mesa,
          );

          return {
            cuenta: cuentaActualizada,
            mensaje: `Oferta "${oferta.nombre}" aplicada.`,
          };
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, resultado, 201);
    }),
  );

  // POST /api/cuentas/:mesa/descuentos
  rutas.post(
    "/:mesa/descuentos",
    requierePermiso("APLICAR_DESCUENTO"),
    validar(esquemaAplicarDescuento),
    asyncHandler(async (req, res) => {
      await aplicarDescuentoOCortesia(req, res, "Descuento");
    }),
  );

  // POST /api/cuentas/:mesa/cortesias
  rutas.post(
    "/:mesa/cortesias",
    requierePermiso("APLICAR_CORTESIA"),
    validar(esquemaAplicarCortesia),
    asyncHandler(async (req, res) => {
      await aplicarDescuentoOCortesia(req, res, "Cortesía");
    }),
  );

  // POST /api/cuentas/:mesa/asignaciones
  rutas.post(
    "/:mesa/asignaciones",
    requierePermiso("DIVIDIR_CUENTA"),
    validar(esquemaAsignarLinea),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);
      const { idLineaCuenta, comensal, cantidad } = req.datos;

      const resultado = await conTransaccion(
        async ({ consultar: consultarEnTransaccion, consultarUno: uno }) => {
          const cuenta = await uno(
            `SELECT c.id_cuenta, c.estado
               FROM cuenta c
               JOIN mesa m ON m.id_mesa = c.id_mesa
              WHERE m.numero = $1
                AND c.estado = 'Abierta'
              FOR UPDATE OF c`,
            [mesa],
          );

          if (!cuenta) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Esa mesa no tiene una cuenta abierta.",
            );
          }

          if (
            await uno(
              "SELECT EXISTS (SELECT 1 FROM pago WHERE id_cuenta = $1) AS tiene_pagos",
              [cuenta.id_cuenta],
            ).then((fila) => fila.tiene_pagos)
          ) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "No se puede cambiar la división después de registrar un pago.",
            );
          }

          const linea = await uno(
            `SELECT lc.id_linea_cuenta, lc.importe, lc.cantidad, lc.precio_unitario
               FROM linea_cuenta lc
              WHERE lc.id_linea_cuenta = $1
                AND lc.id_cuenta = $2`,
            [idLineaCuenta, cuenta.id_cuenta],
          );

          if (!linea) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Esa línea no pertenece a la cuenta.",
            );
          }

          const cantidadExistente = await uno(
            `SELECT COALESCE(SUM(cantidad), 0)::INT AS cantidad
               FROM asignacion_persona
              WHERE id_linea_cuenta = $1
                AND comensal <> $2`,
            [idLineaCuenta, comensal],
          );
          const cantidadAsignada = cantidad ?? Number(linea.cantidad);
          const cantidadDisponible =
            Number(linea.cantidad) - Number(cantidadExistente.cantidad);

          if (cantidadAsignada > cantidadDisponible) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `Solo quedan ${cantidadDisponible} unidad(es) de esa línea por asignar.`,
            );
          }

          await consultarEnTransaccion(
            `INSERT INTO asignacion_persona (id_cuenta, comensal, id_linea_cuenta, cantidad, monto_asignado)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id_linea_cuenta, comensal) DO UPDATE
               SET comensal = EXCLUDED.comensal,
                   cantidad = EXCLUDED.cantidad,
                   monto_asignado = EXCLUDED.monto_asignado`,
            [
              cuenta.id_cuenta,
              comensal,
              idLineaCuenta,
              cantidadAsignada,
              Number(linea.precio_unitario) * cantidadAsignada,
            ],
          );

          const cuentaActualizada = await cuentaDeMesa(
            uno,
            consultarEnTransaccion,
            mesa,
          );

          return {
            cuenta: cuentaActualizada,
            mensaje: `Línea asignada al comensal ${comensal}.`,
          };
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, resultado, 201);
    }),
  );

  // POST /api/cuentas/:mesa/cobrar
  rutas.post(
    "/:mesa/cobrar",
    requierePermiso("REGISTRAR_PAGO"),
    validar(esquemaCobrarCuenta),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);
      const { forma, recibido, propina, referencia, comensal } = req.datos;

      /*
        La propina voluntaria al mesero es un permiso aparte. Si el rol no lo
        tiene, no se puede colar por aquí aunque pueda cobrar la cuenta.
      */
      if (
        Number(propina ?? 0) > 0 &&
        !(await puede(req.sesion.idUsuario, "REGISTRAR_PROPINA"))
      ) {
        throw new ErrorDeApi(
          403,
          "SIN_PERMISO",
          "Tu rol no puede registrar propina.",
        );
      }

      const resultado = await conTransaccion(
        async ({ consultarUno: uno }) => {
          const cuenta = await uno(
            `SELECT c.id_cuenta, c.estado, c.id_mesero
               FROM cuenta c
               JOIN mesa m ON m.id_mesa = c.id_mesa
              WHERE m.numero = $1
                AND c.estado = 'Abierta'`,
            [mesa],
          );

          if (!cuenta) {
            throw new ErrorDeApi(
              404,
              "NO_ENCONTRADO",
              "Esa mesa no tiene una cuenta abierta.",
            );
          }

          if (
            comensal === undefined &&
            (await uno(
              "SELECT EXISTS (SELECT 1 FROM asignacion_persona WHERE id_cuenta = $1) AS dividida",
              [cuenta.id_cuenta],
            )).dividida
          ) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "Esta cuenta está dividida. Cobra cada parte por comensal.",
            );
          }

          /*
            La regla es del MESERO: el que atiende la mesa no cobra su propia
            cuenta, para que el dinero no se le quede en el bolsillo. Quien
            cobra es el cajero o la gerencia, y esos sí pueden cobrar una cuenta
            que ellos mismos abrieron.
          */
          if (
            req.sesion.rol === "mesero" &&
            req.sesion.idEmpleado === cuenta.id_mesero
          ) {
            throw new ErrorDeApi(
              403,
              "SIN_PERMISO",
              "Un mesero no puede cobrar la cuenta de su propia mesa.",
            );
          }

          const totalFila = await uno(
            comensal === undefined
              ? "SELECT fn_total_cuenta($1) AS total"
              : "SELECT fn_total_comensal($1, $2)::FLOAT8 AS total",
            comensal === undefined
              ? [cuenta.id_cuenta]
              : [cuenta.id_cuenta, comensal],
          );
          const total = Number(totalFila?.total ?? 0);
          const propinaNumero = propina === undefined ? 0 : Number(propina);
          const aCobrar = total + propinaNumero;

          /*
            Con efectivo, el cliente dice cuánto dio y de ahí sale el cambio.
            Con tarjeta, PayPal o crédito, lo que se cobra es el total de la
            cuenta más la propina: el sistema lo pone, así que el cajero no
            tiene que escribir un número que no cambia nada.
          */
          const recibidoFinal =
            forma === "Efectivo" ? Number(recibido ?? 0) : aCobrar;

          if (forma === "Efectivo" && recibidoFinal < aCobrar) {
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              `Lo recibido (${recibidoFinal.toFixed(2)}) es menor que lo que hay que cobrar (${aCobrar.toFixed(2)}).`,
            );
          }

          let cobro;

          try {
            cobro =
              comensal === undefined
                ? await uno(
                    "SELECT *, TRUE AS cuenta_pagada FROM fn_cobrar_cuenta($1, $2::forma_pago, $3, $4, $5, $6)",
                    [
                      cuenta.id_cuenta,
                      forma,
                      recibidoFinal,
                      req.sesion.idEmpleado,
                      propinaNumero,
                      referencia ?? null,
                    ],
                  )
                : await uno(
                    "SELECT * FROM fn_cobrar_comensal($1, $2, $3::forma_pago, $4, $5, $6, $7)",
                    [
                      cuenta.id_cuenta,
                      comensal,
                      forma,
                      recibidoFinal,
                      req.sesion.idEmpleado,
                      propinaNumero,
                      referencia ?? null,
                    ],
                  );
          } catch (fallo) {
            console.error("[cuentas] no se pudo registrar el cobro", fallo);
            throw new ErrorDeApi(
              409,
              "CONFLICTO_DE_ESTADO",
              "No se pudo cobrar la cuenta. Refresca y vuelve a intentarlo.",
            );
          }

          return {
            pagoId: cobro.pago_id,
            cambio: cobro.cambio,
            cuentaPagada: cobro.cuenta_pagada,
            comensal: comensal ?? null,
            mensaje: comensal === undefined
              ? `Cuenta cobrada. Cambio: ${Number(cobro.cambio ?? 0).toFixed(2)}.`
              : `Parte del comensal ${comensal} cobrada. Cambio: ${Number(cobro.cambio ?? 0).toFixed(2)}.`,
          };
        },
        { usuario: req.sesion.usuario },
      );

      exito(res, resultado, 201);
    }),
  );

  // POST /api/cuentas/:mesa/comprobantes
  rutas.post(
    "/:mesa/comprobantes",
    requierePermiso("EMITIR_COMPROBANTE"),
    validar(esquemaEmitirComprobante),
    asyncHandler(async (req, res) => {
      const mesa = numeroDeMesa(req.params.mesa);
      const { tipo, cliente, rncCliente, forma, referencia, pagoId } = req.datos;

      /*
        La cuenta sale del PAGO que se está facturando. Una mesa puede tener
        varias cuentas (una por cada pedido que se le cobra), así que si se
        buscara "la cuenta de la mesa" sin más, el comprobante se iría a la
        cuenta vieja y el pago no pertenecería a la cuenta: un 404 que no
        laisse ni emitir ni entender qué pasó.
      */
      const cuenta =
        pagoId === undefined
          ? await consultarUno(
              `SELECT c.id_cuenta, c.estado
                 FROM cuenta c
                 JOIN mesa m ON m.id_mesa = c.id_mesa
                WHERE m.numero = $1
                ORDER BY c.id_cuenta DESC
                LIMIT 1`,
              [mesa],
            )
          : await consultarUno(
              `SELECT c.id_cuenta, c.estado
                 FROM pago p
                 JOIN cuenta c ON c.id_cuenta = p.id_cuenta
                 JOIN mesa m ON m.id_mesa = c.id_mesa
                WHERE p.id_pago = $1
                  AND m.numero = $2`,
              [pagoId, mesa],
            );

      if (!cuenta) {
        throw new ErrorDeApi(
          404,
          "NO_ENCONTRADO",
          pagoId === undefined
            ? "Esa mesa no tiene una cuenta."
            : "Ese pago no es de esta mesa.",
        );
      }

      /*
        El número fiscal lo asigna la plataforma de la DGII, no la secuencia
        local: así el eNCF que ve el cliente es el de verdad.
      */
      const resultado = await emitirFacturaElectronica({
        idCuenta: cuenta.id_cuenta,
        idPago: pagoId ?? null,
        tipo,
        nombre: cliente,
        rnc: rncCliente ?? null,
        forma: forma ?? "Efectivo",
        referencia: referencia ?? null,
        idEmpleado: req.sesion.idEmpleado,
        nombreEmisor: req.sesion.usuario,
      });

      exito(res, resultado, 201);
    }),
  );

  return rutas;
}

/**
 * Aplica un descuento o una cortesía a una cuenta abierta. El descuento no puede
 * pasar del 10 % del total de la cuenta; la cortesía no puede superar el total.
 * Todo queda en la tabla `descuento`, con el empleado que autoriza.
 */
async function aplicarDescuentoOCortesia(req, res, tipo) {
  const mesa = numeroDeMesa(req.params.mesa);
  const { concepto, monto } = req.datos;

  const resultado = await conTransaccion(
    async ({ consultar: consultarEnTransaccion, consultarUno: uno }) => {
      const cuenta = await uno(
        `SELECT c.id_cuenta, c.estado
           FROM cuenta c
           JOIN mesa m ON m.id_mesa = c.id_mesa
          WHERE m.numero = $1
            AND c.estado = 'Abierta'
          FOR UPDATE OF c`,
        [mesa],
      );

      if (!cuenta) {
        throw new ErrorDeApi(404, "NO_ENCONTRADO", "Esa mesa no tiene una cuenta abierta.");
      }

      const totalFila = await uno("SELECT fn_total_cuenta($1) AS total", [
        cuenta.id_cuenta,
      ]);
      const total = Number(totalFila?.total ?? 0);
      const montoNumero = Number(monto);

      const tope = tipo === "Descuento" ? Math.round(total * 10) / 100 : total;

      if (montoNumero > tope) {
        if (tipo === "Descuento") {
          throw new ErrorDeApi(
            409,
            "CONFLICTO_DE_ESTADO",
            `El descuento no puede pasar del 10 % del total de la cuenta (máximo ${tope.toFixed(2)}).`,
          );
        }

        throw new ErrorDeApi(
          409,
          "CONFLICTO_DE_ESTADO",
          "La cortesía no puede superar el total de la cuenta.",
        );
      }

      const autorizado = await uno(
        "SELECT id_empleado FROM empleado WHERE id_empleado = $1",
        [req.sesion.idEmpleado],
      );

      if (!autorizado) {
        throw new ErrorDeApi(
          404,
          "NO_ENCONTRADO",
          "No se encontró al empleado que autoriza.",
        );
      }

      const creado = await uno(
        `INSERT INTO descuento (id_cuenta, concepto, monto, tipo, id_autorizado_por)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_descuento`,
        [cuenta.id_cuenta, concepto, monto, tipo, req.sesion.idEmpleado],
      );

      if (tipo === "Cortesía") {
        await consultarEnTransaccion(
          "UPDATE cuenta SET cortesia = TRUE WHERE id_cuenta = $1",
          [cuenta.id_cuenta],
        );
      }

      const cuentaActualizada = await cuentaDeMesa(
        uno,
        consultarEnTransaccion,
        mesa,
      );

      const descuento = await uno(
        `SELECT d.id_descuento AS id,
                d.concepto,
                d.monto,
                d.tipo,
                e.nombre AS "autorizadoPor",
                to_char(
                  d.aplicado_en AT TIME ZONE 'America/Santo_Domingo',
                  'HH24:MI'
                ) AS hora
           FROM descuento d
           JOIN empleado e ON e.id_empleado = d.id_autorizado_por
          WHERE d.id_descuento = $1`,
        [creado.id_descuento],
      );

      return { descuento, cuenta: cuentaActualizada };
    },
    { usuario: req.sesion.usuario },
  );

  exito(
    res,
    {
      ...resultado,
      mensaje:
        tipo === "Descuento"
          ? `Descuento de ${resultado.descuento.monto} aplicado.`
          : `Cortesía de ${resultado.descuento.monto} aplicada.`,
    },
    201,
  );
}
