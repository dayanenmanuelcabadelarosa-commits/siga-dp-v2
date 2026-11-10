-- =====================================================================================
--  SIGA-DP v2 · Migración 025 — EL SERVICIO (PROPINA LEGAL) DEL RESTAURANTE
-- =====================================================================================
--
--  Qué hace
--    · Agrega el parámetro `parametro.propina_legal_porcentaje` (0 = apagado).
--    · Agrega las columnas `pago.servicio` y `cuenta.servicio`.
--    · `fn_servicio_de_la_cuenta`: el 10 % de servicio que declara un
--      restaurante, calculado sobre el GRAVADO (no sobre el total con
--      impuesto), que es como lo trae el ejemplo de restaurante de la
--      plataforma de la DGII.
--    · `fn_cobrar_cuenta` y `fn_cobrar_comensal` cobran ese servicio junto con
--      la cuenta y lo dejan anotado.
--
--  Por qué
--    En la República Dominicana el 10 % de servicio de los restaurantes es legal:
--    va en la cuenta y se declara en el comprobante fiscal como
--    "MontoImpuestoAdicional". La propina voluntaria al mesero es OTRA cosa:
--    se anota a nombre del mesero y no entra en el comprobante.
--
--    El parámetro nace en 0 (apagado) porque activarlo suma un 10 % a cada
--    cuenta: eso lo decide el dueño, no el sistema.
--
--  De qué depende
--    022_cobros_por_comensal.sql, 023_correccion_cobro_comensal.sql,
--    024_cobro_completo_unico.sql.
-- =====================================================================================

ALTER TABLE parametro
  ADD COLUMN propina_legal_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE pago
  ADD COLUMN servicio dinero NOT NULL DEFAULT 0;

ALTER TABLE cuenta
  ADD COLUMN servicio dinero NOT NULL DEFAULT 0;

COMMENT ON COLUMN parametro.propina_legal_porcentaje IS
  'Porcentaje de servicio (propina legal) que se cobra y se declara en el comprobante. 0 = no se cobra.';

COMMENT ON COLUMN pago.servicio IS
  'Parte del cobro que es servicio del local (propina legal). Va aparte de la propina al mesero.';

-- El servicio que le toca a una cuenta: el porcentaje sobre el gravado.
CREATE OR REPLACE FUNCTION fn_servicio_de_la_cuenta(p_cuenta_id INTEGER)
RETURNS dinero
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_porcentaje NUMERIC;
  v_tasa NUMERIC;
  v_gravado NUMERIC;
BEGIN
  SELECT COALESCE(propina_legal_porcentaje, 0), COALESCE(tasa_impuesto, 18)
    INTO v_porcentaje, v_tasa
    FROM parametro
   ORDER BY id_parametro DESC
   LIMIT 1;

  IF COALESCE(v_porcentaje, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(importe), 0) / (1 + v_tasa / 100)
    INTO v_gravado
    FROM linea_cuenta
   WHERE id_cuenta = p_cuenta_id;

  RETURN ROUND(v_gravado * v_porcentaje / 100, 2)::dinero;
END;
$$;

-- El mismo servicio, pero de la parte que le toca a un comensal.
CREATE OR REPLACE FUNCTION fn_servicio_del_comensal(
  p_cuenta_id INTEGER,
  p_comensal SMALLINT
) RETURNS dinero
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_porcentaje NUMERIC;
  v_tasa NUMERIC;
  v_gravado NUMERIC;
BEGIN
  SELECT COALESCE(propina_legal_porcentaje, 0), COALESCE(tasa_impuesto, 18)
    INTO v_porcentaje, v_tasa
    FROM parametro
   ORDER BY id_parametro DESC
   LIMIT 1;

  IF COALESCE(v_porcentaje, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(ap.monto_asignado), 0) / (1 + v_tasa / 100)
    INTO v_gravado
    FROM asignacion_persona ap
   WHERE ap.id_cuenta = p_cuenta_id
     AND ap.comensal = p_comensal;

  RETURN ROUND(v_gravado * v_porcentaje / 100, 2)::dinero;
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
  v_servicio dinero;
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
    RAISE EXCEPTION 'La cuenta % está en estado % y no se puede cobrar.',
      p_cuenta_id, v_estado;
  END IF;

  IF EXISTS (SELECT 1 FROM pago WHERE id_cuenta = p_cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta ya tiene pagos parciales registrados.';
  END IF;

  IF EXISTS (SELECT 1 FROM asignacion_persona WHERE id_cuenta = p_cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta está dividida; cobra cada parte por comensal.';
  END IF;

  v_total := fn_total_cuenta(p_cuenta_id);
  v_servicio := fn_servicio_de_la_cuenta(p_cuenta_id);
  v_a_cobrar := v_total + v_servicio + COALESCE(p_propina, 0);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_a_cobrar THEN
      RAISE EXCEPTION 'El efectivo recibido (%) es menor que lo que hay que cobrar (%).',
        p_recibido, v_a_cobrar;
    END IF;
    v_cambio := p_recibido - v_a_cobrar;
  END IF;

  INSERT INTO pago (
    id_cuenta, forma_pago, monto_recibido, cambio, referencia, propina, servicio, id_cajero
  ) VALUES (
    p_cuenta_id, p_forma, p_recibido, NULLIF(v_cambio, 0), p_referencia, p_propina, v_servicio, p_cajero_id
  )
  RETURNING id_pago INTO v_pago_id;

  UPDATE cuenta
     SET estado = 'Pagada',
         cerrada_en = now(),
         propina = COALESCE(p_propina, 0),
         servicio = v_servicio
   WHERE id_cuenta = p_cuenta_id;

  -- La propina se anota a nombre del mesero de la orden (RN-04) y con su propia
  -- referencia (RN-28): la autorización de la tarjeta se queda en el pago.
  IF p_propina > 0 THEN
    INSERT INTO propina (id_empleado, id_mesa, id_cuenta, monto, forma, referencia)
    VALUES (v_mesero_id, v_mesa_id, p_cuenta_id, p_propina, p_forma,
            CASE WHEN p_forma = 'Tarjeta' THEN 'COBRO-' || p_cuenta_id::TEXT ELSE NULL END);
  END IF;

  RETURN QUERY SELECT v_pago_id, NULLIF(v_cambio, 0)::dinero;
END;
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
  v_servicio dinero;
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
    RAISE EXCEPTION 'La cuenta % está en estado % y no se puede cobrar.',
      p_cuenta_id, v_estado;
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
  v_servicio := fn_servicio_del_comensal(p_cuenta_id, p_comensal);
  v_a_cobrar := v_total_comensal + v_servicio + COALESCE(p_propina, 0);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_a_cobrar THEN
      RAISE EXCEPTION 'El efectivo recibido es menor que lo que hay que cobrar.';
    END IF;
    v_cambio := p_recibido - v_a_cobrar;
  END IF;

  INSERT INTO pago (
    id_cuenta, comensal, forma_pago, monto_recibido, cambio, referencia, propina, servicio, id_cajero
  ) VALUES (
    p_cuenta_id, p_comensal, p_forma, p_recibido, NULLIF(v_cambio, 0), p_referencia, p_propina, v_servicio, p_cajero_id
  )
  RETURNING id_pago INTO v_pago_id;

  IF p_propina > 0 THEN
    INSERT INTO propina (id_empleado, id_mesa, id_cuenta, id_pago, monto, forma, referencia)
    VALUES (v_mesero_id, v_mesa_id, p_cuenta_id, v_pago_id, p_propina, p_forma,
            CASE WHEN p_forma = 'Tarjeta'
                 THEN 'COBRO-' || p_cuenta_id::TEXT || '-' || p_comensal::TEXT
                 ELSE NULL END);
  END IF;

  UPDATE cuenta
     SET propina = propina + COALESCE(p_propina, 0),
         servicio = servicio + v_servicio
   WHERE id_cuenta = p_cuenta_id;

  SELECT COALESCE(SUM(p.monto_recibido - COALESCE(p.cambio, 0) - p.propina - p.servicio), 0) >= v_total_cuenta
    INTO v_pagado
    FROM pago p
   WHERE p.id_cuenta = p_cuenta_id;

  IF v_pagado THEN
    UPDATE cuenta
       SET estado = 'Pagada', cerrada_en = now()
     WHERE id_cuenta = p_cuenta_id;
  END IF;

  RETURN QUERY SELECT v_pago_id, NULLIF(v_cambio, 0)::dinero, v_pagado;
END;
$$;
