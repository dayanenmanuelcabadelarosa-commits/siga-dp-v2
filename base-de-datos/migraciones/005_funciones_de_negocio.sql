-- =====================================================================================
--  SIGA-DP v2 · Migración 005 — FUNCIONES DE NEGOCIO
-- =====================================================================================
--  Qué hace
--    Crea las funciones transaccionales del negocio: abrir pedido, generar cuenta,
-- total de la cuenta, cobrar, emitir y anular comprobante, cerrar propinas y
-- cerrar el corte de caja.
--
--  De qué depende
--    002_tablas.sql y 004_disparadores.sql.
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 1070 a 1386 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

--Ayuda para el escenario de demostración: del nombre de usuario al empleado
CREATE OR REPLACE FUNCTION fn_id_empleado(p_usuario TEXT) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT e.id_empleado
    FROM usuario u
    JOIN empleado e ON e.id_empleado = u.id_empleado
   WHERE u.usuario = p_usuario;
$$;

-- Total de una cuenta: líneas menos descuentos (RN-05, RN-07)
CREATE OR REPLACE FUNCTION fn_total_cuenta(p_cuenta_id INTEGER) RETURNS dinero
LANGUAGE sql STABLE AS $$
  SELECT (
      COALESCE((SELECT sum(lc.importe) FROM linea_cuenta lc WHERE lc.id_cuenta = p_cuenta_id), 0)
    - COALESCE((SELECT sum(d.monto)    FROM descuento d     WHERE d.id_cuenta    = p_cuenta_id), 0)
  )::dinero;
$$;

-- ------------------------------- 5.1 Abrir un pedido en una mesa ocupada --
CREATE OR REPLACE FUNCTION fn_abrir_pedido(
  p_mesa_id    INTEGER,
  p_mesero_id  INTEGER,
  p_comensales SMALLINT DEFAULT 1
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_pedido_id INTEGER;
  v_estado    estado_mesa;
  i           SMALLINT;
BEGIN
  SELECT m.estado INTO v_estado FROM mesa m WHERE m.id_mesa = p_mesa_id FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'ocupada' THEN
    RAISE EXCEPTION 'Solo se puede abrir pedido en una mesa ocupada (la % está en estado %).',
      p_mesa_id, COALESCE(v_estado::TEXT, 'desconocido');
  END IF;

  INSERT INTO pedido (id_mesa, id_mesero) VALUES (p_mesa_id, p_mesero_id)
  RETURNING id_pedido INTO v_pedido_id;

  -- Quiénes se sentaron en esa mesa: se guarda el orden de llegada
  FOR i IN 1..p_comensales LOOP
    INSERT INTO mesa_pedido (id_mesa, id_pedido, comensal, orden_llegada)
    VALUES (p_mesa_id, v_pedido_id, i, i);
  END LOOP;

  UPDATE mesa
     SET id_mesero_orden = p_mesero_id,
         estado_pedido   = 'Tomando pedido'
   WHERE id_mesa = p_mesa_id;

  RETURN v_pedido_id;
END;
$$;

-- ------------------------------- 5.2 Generar la cuenta desde el pedido --
-- Copia alDetalle las líneas enviadas y no anuladas. Si ya hay cuenta abierta en
-- esa mesa, devuelve la que hay en vez de duplicarla (RN-05).
CREATE OR REPLACE FUNCTION fn_generar_cuenta(p_mesa_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_cuenta_id INTEGER;
  v_pedido_id INTEGER;
  v_mesero_id INTEGER;
BEGIN
  SELECT c.id_cuenta INTO v_cuenta_id
    FROM cuenta c
   WHERE c.id_mesa = p_mesa_id AND c.estado = 'Abierta';

  IF v_cuenta_id IS NOT NULL THEN
    RETURN v_cuenta_id;
  END IF;

  SELECT p.id_pedido, p.id_mesero INTO v_pedido_id, v_mesero_id
    FROM pedido p
   WHERE p.id_mesa = p_mesa_id
     AND p.estado IN ('Abierto', 'Enviado')
   ORDER BY p.id_pedido DESC
   LIMIT 1;

  IF v_pedido_id IS NULL THEN
    RAISE EXCEPTION 'La mesa % no tiene pedido abierto para facturar.', p_mesa_id;
  END IF;

  INSERT INTO cuenta (id_mesa, id_pedido, id_mesero)
  VALUES (p_mesa_id, v_pedido_id, v_mesero_id)
  RETURNING id_cuenta INTO v_cuenta_id;

  INSERT INTO linea_cuenta (
    id_cuenta, id_linea_pedido, id_producto, descripcion,
    cantidad, precio_unitario, comensal
  )
  SELECT v_cuenta_id, lp.id_linea_pedido, lp.id_producto, pr.nombre,
         lp.cantidad, lp.precio_unitario, lp.comensal
    FROM linea_pedido lp
    JOIN producto pr ON pr.id_producto = lp.id_producto
   WHERE lp.id_pedido = v_pedido_id
     AND lp.estado = 'Enviada'
     AND NOT EXISTS (
           SELECT 1
             FROM linea_comanda lc
            WHERE lc.id_linea_pedido = lp.id_linea_pedido
              AND lc.estado = 'Anulada'
         );

  UPDATE pedido SET estado = 'Cerrado', cerrado_en = now() WHERE id_pedido = v_pedido_id;
  UPDATE mesa   SET estado_pedido = 'Cuenta pedida' WHERE id_mesa = p_mesa_id;

  RETURN v_cuenta_id;
END;
$$;

-- ------------------------------- 5.3 Cobrar una cuenta --
CREATE OR REPLACE FUNCTION fn_cobrar_cuenta(
  p_cuenta_id  INTEGER,
  p_forma      forma_pago,
  p_recibido   dinero,
  p_cajero_id  INTEGER,
  p_propina    dinero DEFAULT 0,
  p_referencia TEXT DEFAULT NULL
) RETURNS TABLE (pago_id INTEGER, cambio dinero)
LANGUAGE plpgsql AS $$
DECLARE
  v_total      dinero;
  v_cambio     dinero := 0;
  v_pago_id    INTEGER;
  v_estado     estado_cuenta;
  v_mesero_id  INTEGER;
  v_mesa_id    INTEGER;
BEGIN
  SELECT c.estado, c.id_mesero, c.id_mesa INTO v_estado, v_mesero_id, v_mesa_id
    FROM cuenta c
   WHERE c.id_cuenta = p_cuenta_id
   FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'Abierta' THEN
    RAISE EXCEPTION 'La cuenta % está en estado % y no se puede cobrar.', p_cuenta_id, v_estado;
  END IF;

  v_total := fn_total_cuenta(p_cuenta_id);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_total THEN
      RAISE EXCEPTION 'El efectivo recibido (%) es menor que el total (%).', p_recibido, v_total;
    END IF;
    v_cambio := p_recibido - v_total;
  END IF;

  INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, cambio, referencia, propina, id_cajero)
  VALUES (p_cuenta_id, p_forma, p_recibido, NULLIF(v_cambio, 0), p_referencia, p_propina, p_cajero_id)
  RETURNING id_pago INTO v_pago_id;

  UPDATE cuenta
     SET estado = 'Pagada', cerrada_en = now(), propina = p_propina
   WHERE id_cuenta = p_cuenta_id;

  -- La propina se anota a nombre del mesero de la orden (RN-04)
  IF p_propina > 0 THEN
    INSERT INTO propina (id_empleado, id_mesa, id_cuenta, monto, forma, referencia)
    VALUES (v_mesero_id, v_mesa_id, p_cuenta_id, p_propina, p_forma,
            CASE WHEN p_forma = 'Tarjeta' THEN 'COBRO-' || p_cuenta_id::TEXT ELSE NULL END);
  END IF;

  -- El ::dinero hace falta: sin esa conversión, NULLIF devuelve un numérico sin
-- límites y la estructura de la fila no coincidiría con la tabla que devuelve
-- la función (pago_id, cambio).
RETURN QUERY SELECT v_pago_id, NULLIF(v_cambio, 0)::dinero;
END;
$$;

-- ------------------------------- 5.4 Emitir comprobante fiscal --
-- Toma el número de la secuencia dentro de la misma transacción (RN-08).
-- Nota: PostgreSQL exige que, después de un parámetro con valor por omisión,
-- todos los siguientes también lo tengan. Por eso p_cajero_id va antes de los
-- opcionales. El cuerpo usa nombres, así que el orden no le afecta.
CREATE OR REPLACE FUNCTION fn_emitir_comprobante(
  p_cuenta_id   INTEGER,
  p_tipo        tipo_comprobante,
  p_cliente     VARCHAR,
  p_cajero_id   INTEGER,
  p_rnc_cliente VARCHAR DEFAULT NULL,
  p_forma       forma_pago DEFAULT 'Efectivo',
  p_referencia  VARCHAR DEFAULT NULL
) RETURNS VARCHAR
LANGUAGE plpgsql AS $$
DECLARE
  v_total    dinero;
  v_base     dinero;
  v_impuesto dinero;
  v_tasa     porcentaje;
  v_ncf      VARCHAR;
  v_id       INTEGER;
  v_estado   estado_cuenta;
BEGIN
  SELECT c.estado INTO v_estado FROM cuenta c WHERE c.id_cuenta = p_cuenta_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'La cuenta % no existe.', p_cuenta_id;
  END IF;

  v_total := fn_total_cuenta(p_cuenta_id);
  SELECT p.tasa_impuesto INTO v_tasa FROM parametro p ORDER BY p.id_parametro DESC LIMIT 1;

  -- El impuesto se calcula sobre lo efectivamente cobrado (RN-10)
  v_base := v_total / (1 + v_tasa / 100);
  v_impuesto := v_total - v_base;

  INSERT INTO comprobante (
    id_cuenta, tipo, cliente, rnc_cliente, base, impuesto, total,
    forma_pago, referencia, id_emitido_por
  ) VALUES (
    p_cuenta_id, p_tipo, p_cliente, p_rnc_cliente, v_base, v_impuesto, v_total,
    p_forma, p_referencia, p_cajero_id
  )
  RETURNING id_comprobante, numero_ncf INTO v_id, v_ncf;

  INSERT INTO linea_comprobante (id_comprobante, id_producto, descripcion, cantidad, importe)
  SELECT v_id, lc.id_producto, lc.descripcion, lc.cantidad, lc.importe
    FROM linea_cuenta lc
   WHERE lc.id_cuenta = p_cuenta_id;

  RETURN v_ncf;
END;
$$;

-- ------------------------------- 5.5 Anular un comprobante --
CREATE OR REPLACE FUNCTION fn_anular_comprobante(p_ncf VARCHAR, p_empleado_id INTEGER)
RETURNS VARCHAR
LANGUAGE plpgsql AS $$
DECLARE
  v_estado estado_comprobante;
BEGIN
  SELECT c.estado INTO v_estado FROM comprobante c WHERE c.numero_ncf = p_ncf FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El comprobante % no existe.', p_ncf;
  END IF;

  IF v_estado = 'Anulado' THEN
    RAISE EXCEPTION 'El comprobante % ya estaba anulado.', p_ncf;
  END IF;

  -- El número NO se devuelve a la secuencia: no se reutiliza (RN-08)
  UPDATE comprobante
     SET estado = 'Anulado', anulado_en = now(), id_anulado_por = p_empleado_id
   WHERE numero_ncf = p_ncf;

  RETURN p_ncf;
END;
$$;

-- ------------------------------- 5.6 Conciliar las propinas del día --
CREATE OR REPLACE FUNCTION fn_cerrar_propinas(p_empleado_id INTEGER, p_fecha DATE, p_contado dinero)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_esperado  dinero;
  v_cierre_id INTEGER;
BEGIN
  SELECT COALESCE(sum(pr.monto), 0)::dinero INTO v_esperado
    FROM propina pr
   WHERE pr.id_empleado = p_empleado_id
     AND DATE(pr.registrada_en) = p_fecha;

  INSERT INTO cierre_propina (id_empleado, fecha, esperado, contado, id_cerrado_por)
  VALUES (p_empleado_id, p_fecha, v_esperado, p_contado, p_empleado_id)
  RETURNING id_cierre INTO v_cierre_id;

  RETURN v_cierre_id;
END;
$$;

-- ------------------------------- 5.7 Cerrar el corte de caja --
CREATE OR REPLACE FUNCTION fn_cerrar_corte(p_fecha DATE, p_cajero_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO corte_caja (fecha, estado, id_cerrado_por, cerrado_en)
  VALUES (p_fecha, 'Cerrado', p_cajero_id, now())
  ON CONFLICT (fecha) DO UPDATE
    SET estado = 'Cerrado', id_cerrado_por = p_cajero_id, cerrado_en = now()
  RETURNING id_corte INTO v_id;

  -- Los totales se recalculan con lo que realmente se cobró
  UPDATE corte_caja c
     SET efectivo_sistema  = COALESCE(t.efectivo, 0),
         total_tarjeta     = COALESCE(t.tarjeta, 0),
         total_paypal      = COALESCE(t.paypal, 0),
         total_credito     = COALESCE(t.credito, 0),
         total_ventas      = COALESCE(t.efectivo, 0) + COALESCE(t.tarjeta, 0)
                           + COALESCE(t.paypal, 0) + COALESCE(t.credito, 0),
         comprobantes      = COALESCE(t.pagos, 0),
         total_descuentos  = COALESCE(t.descuentos, 0)
    FROM (
      SELECT
        sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Efectivo') AS efectivo,
        sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Tarjeta')  AS tarjeta,
        sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'PayPal')   AS paypal,
        sum(pg.monto_recibido - COALESCE(pg.cambio, 0)) FILTER (WHERE pg.forma_pago = 'Crédito')  AS credito,
        count(*) AS pagos,
        COALESCE((SELECT sum(d.monto) FROM descuento d
                    JOIN cuenta c2 ON c2.id_cuenta = d.id_cuenta
                   WHERE DATE(c2.abierta_en) = p_fecha), 0) AS descuentos
        FROM pago pg
        JOIN cuenta c ON c.id_cuenta = pg.id_cuenta
       WHERE DATE(c.abierta_en) = p_fecha
    ) t
   WHERE c.id_corte = v_id;

  RETURN v_id;
END;
$$;
