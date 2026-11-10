-- Permite repartir una línea por cantidades y cobrar cada comensal por separado.
ALTER TABLE asignacion_persona
  ADD COLUMN cantidad SMALLINT;

UPDATE asignacion_persona ap
   SET cantidad = lc.cantidad,
       monto_asignado = lc.precio_unitario * lc.cantidad
  FROM linea_cuenta lc
 WHERE lc.id_linea_cuenta = ap.id_linea_cuenta;

ALTER TABLE asignacion_persona
  ALTER COLUMN cantidad SET NOT NULL,
  ALTER COLUMN cantidad SET DEFAULT 1,
  DROP CONSTRAINT uq_asignacion_linea,
  ADD CONSTRAINT uq_asignacion_linea_comensal UNIQUE (id_linea_cuenta, comensal),
  ADD CONSTRAINT ck_asignacion_cantidad CHECK (cantidad > 0);

ALTER TABLE pago
  DROP CONSTRAINT pago_id_cuenta_key,
  ADD COLUMN comensal SMALLINT,
  ADD CONSTRAINT ck_pago_comensal CHECK (comensal IS NULL OR comensal > 0);

CREATE UNIQUE INDEX uq_pago_comensal
  ON pago (id_cuenta, comensal)
  WHERE comensal IS NOT NULL;

ALTER TABLE comprobante
  ADD COLUMN id_pago INTEGER REFERENCES pago (id_pago) ON DELETE RESTRICT;

DROP INDEX uq_comprobante_por_cuenta;

CREATE UNIQUE INDEX uq_comprobante_por_pago
  ON comprobante (id_pago)
  WHERE id_pago IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_registrar_comprobante_electronico(
  p_cuenta_id INTEGER,
  p_numero_ncf VARCHAR,
  p_tipo_ecf SMALLINT,
  p_tipo tipo_comprobante,
  p_cliente VARCHAR,
  p_rnc_cliente VARCHAR,
  p_base dinero,
  p_impuesto dinero,
  p_total dinero,
  p_forma forma_pago,
  p_referencia VARCHAR,
  p_emitido_por INTEGER,
  p_id_ecf VARCHAR,
  p_track_id VARCHAR,
  p_dgii_url TEXT,
  p_estado_ecf VARCHAR,
  p_pago_id INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_id INTEGER;
  v_comensal SMALLINT;
BEGIN
  IF p_pago_id IS NOT NULL THEN
    SELECT comensal INTO v_comensal
      FROM pago
     WHERE id_pago = p_pago_id AND id_cuenta = p_cuenta_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pago no corresponde a la cuenta.';
    END IF;
  END IF;

  INSERT INTO comprobante (
    numero_ncf, tipo, id_cuenta, id_pago, cliente, rnc_cliente, base, impuesto, total,
    forma_pago, referencia, id_emitido_por, id_ecf, track_id, dgii_url, estado_ecf, tipo_ecf
  ) VALUES (
    p_numero_ncf, p_tipo, p_cuenta_id, p_pago_id, p_cliente, p_rnc_cliente, p_base, p_impuesto, p_total,
    p_forma, p_referencia, p_emitido_por, p_id_ecf, p_track_id, p_dgii_url, p_estado_ecf, p_tipo_ecf
  )
  RETURNING id_comprobante INTO v_id;

  IF v_comensal IS NULL THEN
    INSERT INTO linea_comprobante (id_comprobante, id_producto, descripcion, cantidad, importe)
    SELECT v_id, lc.id_producto, lc.descripcion, lc.cantidad, lc.importe
      FROM linea_cuenta lc
     WHERE lc.id_cuenta = p_cuenta_id;
  ELSE
    INSERT INTO linea_comprobante (id_comprobante, id_producto, descripcion, cantidad, importe)
    SELECT v_id, lc.id_producto, lc.descripcion, SUM(ap.cantidad)::SMALLINT, SUM(ap.monto_asignado)::dinero
      FROM asignacion_persona ap
      JOIN linea_cuenta lc ON lc.id_linea_cuenta = ap.id_linea_cuenta
     WHERE ap.id_cuenta = p_cuenta_id AND ap.comensal = v_comensal
     GROUP BY lc.id_linea_cuenta, lc.id_producto, lc.descripcion
     ORDER BY lc.id_linea_cuenta;
  END IF;

  RETURN v_id;
END;
$$;

ALTER TABLE propina
  ADD COLUMN id_pago INTEGER REFERENCES pago (id_pago) ON DELETE RESTRICT;

DROP INDEX uq_propina_por_mesa;

CREATE UNIQUE INDEX uq_propina_por_mesa_sin_pago
  ON propina (id_empleado, id_mesa, ((registrada_en AT TIME ZONE 'America/Santo_Domingo')::date))
  WHERE id_mesa IS NOT NULL AND id_pago IS NULL;

CREATE OR REPLACE FUNCTION fn_total_comensal(p_cuenta_id INTEGER, p_comensal SMALLINT)
RETURNS dinero
LANGUAGE sql STABLE AS $$
  WITH personas AS (
    SELECT ap.comensal,
           SUM(ap.monto_asignado)::NUMERIC AS bruto,
           ROW_NUMBER() OVER (ORDER BY ap.comensal) AS orden,
           COUNT(*) OVER () AS cantidad,
           SUM(SUM(ap.monto_asignado)) OVER () AS bruto_total
      FROM asignacion_persona ap
     WHERE ap.id_cuenta = p_cuenta_id
     GROUP BY ap.comensal
  ),
  reparto AS (
    SELECT comensal,
           CASE
             WHEN orden = cantidad THEN
               (fn_total_cuenta(p_cuenta_id)::NUMERIC
                 - COALESCE(
                     SUM(ROUND(fn_total_cuenta(p_cuenta_id)::NUMERIC * bruto / NULLIF(bruto_total, 0), 2))
                       OVER (ORDER BY orden ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
                     0
                   ))
             ELSE ROUND(fn_total_cuenta(p_cuenta_id)::NUMERIC * bruto / NULLIF(bruto_total, 0), 2)
           END AS total
      FROM personas
  )
  SELECT COALESCE((SELECT total FROM reparto WHERE comensal = p_comensal), 0)::dinero;
$$;

CREATE OR REPLACE FUNCTION fn_cobrar_comensal(
  p_cuenta_id INTEGER,
  p_comensal SMALLINT,
  p_forma forma_pago,
  p_recibido dinero,
  p_cajero_id INTEGER,
  p_propina dinero DEFAULT 0,
  p_referencia TEXT DEFAULT NULL
) RETURNS TABLE (pago_id INTEGER, cambio dinero, cuenta_pagada BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_total_cuenta dinero;
  v_total_comensal dinero;
  v_a_cobrar dinero;
  v_cambio dinero := 0;
  v_pago_id INTEGER;
  v_estado estado_cuenta;
  v_mesero_id INTEGER;
  v_mesa_id INTEGER;
  v_subtotal NUMERIC;
  v_asignado NUMERIC;
  v_pagado BOOLEAN;
BEGIN
  SELECT c.estado, c.id_mesero, c.id_mesa
    INTO v_estado, v_mesero_id, v_mesa_id
    FROM cuenta c
   WHERE c.id_cuenta = p_cuenta_id
   FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'Abierta' THEN
    RAISE EXCEPTION 'La cuenta % no está abierta.', p_cuenta_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pago WHERE id_cuenta = p_cuenta_id AND comensal IS NULL) THEN
    RAISE EXCEPTION 'La cuenta ya tiene un cobro completo.';
  END IF;

  SELECT COALESCE(SUM(importe), 0)
    INTO v_subtotal
    FROM linea_cuenta
   WHERE id_cuenta = p_cuenta_id;

  SELECT COALESCE(SUM(monto_asignado), 0)
    INTO v_asignado
    FROM asignacion_persona
   WHERE id_cuenta = p_cuenta_id;

  IF v_asignado <> v_subtotal OR EXISTS (
    SELECT 1
      FROM linea_cuenta lc
     WHERE lc.id_cuenta = p_cuenta_id
       AND lc.cantidad <> COALESCE((
         SELECT SUM(ap.cantidad)
           FROM asignacion_persona ap
          WHERE ap.id_linea_cuenta = lc.id_linea_cuenta
       ), 0)
  ) THEN
    RAISE EXCEPTION 'Asigna todas las cantidades de la cuenta antes de cobrar por separado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM asignacion_persona
     WHERE id_cuenta = p_cuenta_id AND comensal = p_comensal
  ) THEN
    RAISE EXCEPTION 'El comensal no tiene consumos asignados.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pago
     WHERE id_cuenta = p_cuenta_id AND comensal = p_comensal
  ) THEN
    RAISE EXCEPTION 'Ese comensal ya pagó su parte.';
  END IF;

  v_total_cuenta := fn_total_cuenta(p_cuenta_id);
  v_total_comensal := fn_total_comensal(p_cuenta_id, p_comensal);
  v_a_cobrar := v_total_comensal + COALESCE(p_propina, 0);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_a_cobrar THEN
      RAISE EXCEPTION 'El efectivo recibido es menor que lo que hay que cobrar.';
    END IF;
    v_cambio := p_recibido - v_a_cobrar;
  END IF;

  INSERT INTO pago (
    id_cuenta, comensal, forma_pago, monto_recibido, cambio, referencia, propina, id_cajero
  ) VALUES (
    p_cuenta_id, p_comensal, p_forma, p_recibido, NULLIF(v_cambio, 0), p_referencia, p_propina, p_cajero_id
  )
  RETURNING id_pago INTO v_pago_id;

  IF p_propina > 0 THEN
    INSERT INTO propina (id_empleado, id_mesa, id_cuenta, id_pago, monto, forma, referencia)
    VALUES (v_mesero_id, v_mesa_id, p_cuenta_id, v_pago_id, p_propina, p_forma, p_referencia);
  END IF;

  UPDATE cuenta
     SET propina = propina + COALESCE(p_propina, 0)
   WHERE id_cuenta = p_cuenta_id;

  SELECT COALESCE(SUM(monto_recibido - COALESCE(cambio, 0) - propina), 0) >= v_total_cuenta
    INTO v_pagado
    FROM pago
   WHERE id_cuenta = p_cuenta_id;

  IF v_pagado THEN
    UPDATE cuenta
       SET estado = 'Pagada', cerrada_en = now()
     WHERE id_cuenta = p_cuenta_id;
  END IF;

  RETURN QUERY SELECT v_pago_id, NULLIF(v_cambio, 0)::dinero, v_pagado;
END;
$$;

CREATE OR REPLACE FUNCTION fn_cobrar_cuenta(
  p_cuenta_id INTEGER,
  p_forma forma_pago,
  p_recibido dinero,
  p_cajero_id INTEGER,
  p_propina dinero DEFAULT 0,
  p_referencia TEXT DEFAULT NULL
) RETURNS TABLE (pago_id INTEGER, cambio dinero)
LANGUAGE plpgsql AS $$
DECLARE
  v_total dinero;
  v_a_cobrar dinero;
  v_cambio dinero := 0;
  v_pago_id INTEGER;
  v_estado estado_cuenta;
  v_mesero_id INTEGER;
  v_mesa_id INTEGER;
BEGIN
  SELECT c.estado, c.id_mesero, c.id_mesa
    INTO v_estado, v_mesero_id, v_mesa_id
    FROM cuenta c
   WHERE c.id_cuenta = p_cuenta_id
   FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'Abierta' THEN
    RAISE EXCEPTION 'La cuenta % no está abierta.', p_cuenta_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pago WHERE id_cuenta = p_cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta ya tiene pagos parciales registrados.';
  END IF;

  IF EXISTS (SELECT 1 FROM asignacion_persona WHERE id_cuenta = p_cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta está dividida; cobra cada parte por comensal.';
  END IF;

  v_total := fn_total_cuenta(p_cuenta_id);
  v_a_cobrar := v_total + COALESCE(p_propina, 0);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_a_cobrar THEN
      RAISE EXCEPTION 'El efectivo recibido es menor que lo que hay que cobrar.';
    END IF;
    v_cambio := p_recibido - v_a_cobrar;
  END IF;

  INSERT INTO pago (id_cuenta, forma_pago, monto_recibido, cambio, referencia, propina, id_cajero)
  VALUES (p_cuenta_id, p_forma, p_recibido, NULLIF(v_cambio, 0), p_referencia, p_propina, p_cajero_id)
  RETURNING id_pago INTO v_pago_id;

  UPDATE cuenta
     SET estado = 'Pagada', cerrada_en = now(), propina = COALESCE(p_propina, 0)
   WHERE id_cuenta = p_cuenta_id;

  IF p_propina > 0 THEN
    INSERT INTO propina (id_empleado, id_mesa, id_cuenta, monto, forma, referencia)
    VALUES (v_mesero_id, v_mesa_id, p_cuenta_id, p_propina, p_forma, p_referencia);
  END IF;

  RETURN QUERY SELECT v_pago_id, NULLIF(v_cambio, 0)::dinero;
END;
$$;
