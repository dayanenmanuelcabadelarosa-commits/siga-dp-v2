-- =====================================================================================
--  SIGA-DP v2 · Migración 006 — VISTAS
-- =====================================================================================
--  Qué hace
--    Crea las vistas de consulta (mesas en servicio, cuentas por cobrar, comandas
-- por estación, insumos bajo mínimo, reportes de ventas y comprobantes).
--
--  De qué depende
--    002_tablas.sql y 005_funciones_de_negocio.sql.
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 1391 a 1540 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

-- Mesas ocupadas con su tiempo en el local (lo que ve el mesero)
DROP VIEW IF EXISTS v_mesas_en_servicio CASCADE;
CREATE VIEW v_mesas_en_servicio AS
SELECT m.id_mesa,
       m.numero,
       z.nombre AS zona,
       m.capacidad,
       m.personas,
       m.hora_llegada,
       m.estado_pedido,
       emp.nombre AS mesero_orden,
       EXTRACT(EPOCH FROM (now() - m.hora_llegada))::INTEGER / 60 AS minutos_en_mesa,
       (SELECT count(*)
          FROM linea_pedido lp
         WHERE lp.estado <> 'Anulada'
           AND lp.id_pedido IN (SELECT mp.id_pedido FROM mesa_pedido mp WHERE mp.id_mesa = m.id_mesa)
       ) AS lineas,
       EXISTS (SELECT 1 FROM pedido p
               WHERE p.id_mesa = m.id_mesa AND p.estado = 'Abierto') AS tiene_pedido,
       NOT EXISTS (SELECT 1 FROM cuenta c
                    WHERE c.id_mesa = m.id_mesa AND c.estado = 'Abierta') AS sin_facturar
  FROM mesa m
  JOIN zona z ON z.id_zona = m.id_zona
  LEFT JOIN empleado emp ON emp.id_empleado = m.id_mesero_orden
 WHERE m.estado = 'ocupada';

COMMENT ON VIEW v_mesas_en_servicio IS 'Mesas con servicio: quién tomó la orden, cuánto llevan y si ya tienen pedido.';

-- Área de facturar: todas las mesas por cobrar
DROP VIEW IF EXISTS v_cuentas_por_cobrar CASCADE;
CREATE VIEW v_cuentas_por_cobrar AS
SELECT m.numero AS mesa,
       m.id_mesa,
       emp.nombre AS mesero_orden,
       c.id_cuenta,
       c.estado,
       (c.id_cuenta IS NULL) AS sin_facturar,
       COALESCE((SELECT count(*) FROM linea_cuenta lc WHERE lc.id_cuenta = c.id_cuenta), 0) AS items,
       COALESCE((SELECT fn_total_cuenta(c.id_cuenta)), 0) AS total
  FROM mesa m
  LEFT JOIN empleado emp ON emp.id_empleado = m.id_mesero_orden
  LEFT JOIN cuenta c ON c.id_mesa = m.id_mesa AND c.estado <> 'Anulada'
 WHERE m.estado = 'ocupada';

COMMENT ON VIEW v_cuentas_por_cobrar IS 'Mesas con servicio y su total, para el área de facturar.';

-- Detalle de una cuenta
DROP VIEW IF EXISTS v_detalle_cuenta CASCADE;
CREATE VIEW v_detalle_cuenta AS
SELECT c.id_cuenta,
       c.numero AS cuenta,
       m.numero AS mesa,
       lc.id_linea_cuenta,
       lc.descripcion,
       lc.cantidad,
       lc.precio_unitario,
       lc.importe,
       lc.comensal,
       COALESCE((SELECT sum(d.monto) FROM descuento d WHERE d.id_cuenta = c.id_cuenta), 0) AS descuentos,
       fn_total_cuenta(c.id_cuenta) AS total
  FROM cuenta c
  JOIN mesa m ON m.id_mesa = c.id_mesa
  JOIN linea_cuenta lc ON lc.id_cuenta = c.id_cuenta;

-- Ventas del día por forma de pago
DROP VIEW IF EXISTS v_ventas_del_dia CASCADE;
CREATE VIEW v_ventas_del_dia AS
SELECT DATE(c.abierta_en) AS fecha,
       pg.forma_pago,
       count(*) AS comprobantes,
       sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) AS monto
  FROM pago pg
  JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
 GROUP BY DATE(c.abierta_en), pg.forma_pago;

-- Totales por día para el reporte de ventas
DROP VIEW IF EXISTS v_reporte_ventas CASCADE;
-- Nota: el descuento se trae con un JOIN y no con una subconsulta en el SELECT,
-- porque dentro de un SELECT con GROUP BY no se puede usar una columna de la
-- consulta exterior si no está en el GROUP BY.
CREATE VIEW v_reporte_ventas AS
SELECT DATE(c.abierta_en) AS fecha,
       COALESCE(sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Efectivo'), 0) AS efectivo,
       COALESCE(sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Tarjeta'),  0) AS tarjeta,
       COALESCE(sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'PayPal'),   0) AS paypal,
       count(*) AS comprobantes,
       COALESCE(sum(COALESCE(ds.total, 0)), 0) AS descuentos
  FROM pago pg
  JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
  LEFT JOIN (
         SELECT c2.id_cuenta AS id_cuenta, sum(d.monto) AS total
           FROM descuento d
           JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
          GROUP BY c2.id_cuenta
       ) ds ON ds.id_cuenta = pg.id_cuenta
 GROUP BY DATE(c.abierta_en);

-- Platos más vendidos
DROP VIEW IF EXISTS v_platos_mas_vendidos CASCADE;
CREATE VIEW v_platos_mas_vendidos AS
SELECT pr.nombre,
       sum(lc.cantidad) AS cantidad,
       sum(lc.importe)  AS importe
  FROM linea_cuenta lc
  JOIN producto pr ON pr.id_producto = lc.id_producto
  JOIN cuenta c    ON c.id_cuenta   = lc.id_cuenta
 WHERE c.estado = 'Pagada'
 GROUP BY pr.nombre;

-- Insumos por debajo del mínimo
DROP VIEW IF EXISTS v_insumos_bajo_minimo CASCADE;
CREATE VIEW v_insumos_bajo_minimo AS
SELECT i.nombre, i.minimo, e.existencia, p.nombre AS punto,
       (i.minimo - e.existencia) AS faltante
  FROM existencia e
  JOIN insumo i       ON i.id_insumo = e.id_insumo
  JOIN punto_acceso p ON p.id_punto  = e.id_punto
 WHERE e.existencia < i.minimo;

-- Comandas por estación con su espera (roja si pasan de 15 minutos)
DROP VIEW IF EXISTS v_comandas_estacion CASCADE;
CREATE VIEW v_comandas_estacion AS
SELECT co.id_comanda,
       co.numero,
       e.nombre AS estacion,
       m.numero AS mesa,
       co.estado,
       co.enviada_en,
       (EXTRACT(EPOCH FROM (now() - co.enviada_en))::INTEGER / 60) AS minutos_espera,
       (EXTRACT(EPOCH FROM (now() - co.enviada_en))::INTEGER / 60) > 15 AS retrasada
  FROM comanda co
  JOIN estacion e ON e.id_estacion = co.id_estacion
  JOIN pedido p   ON p.id_pedido    = co.id_pedido
  JOIN mesa m     ON m.id_mesa      = p.id_mesa;

-- Comprobantes emitidos con su estado
DROP VIEW IF EXISTS v_comprobantes_emitidos CASCADE;
CREATE VIEW v_comprobantes_emitidos AS
SELECT cb.numero_ncf,
       cb.tipo,
       cb.cliente,
       cb.total,
       cb.estado,
       cb.emitido_en,
       emp.nombre AS emitido_por,
       (SELECT count(*) FROM linea_comprobante lc WHERE lc.id_comprobante = cb.id_comprobante) AS lineas
  FROM comprobante cb
  JOIN empleado emp ON emp.id_empleado = cb.id_emitido_por;
