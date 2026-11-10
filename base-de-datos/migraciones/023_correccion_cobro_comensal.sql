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

  SELECT COALESCE(SUM(p.monto_recibido - COALESCE(p.cambio, 0) - p.propina), 0) >= v_total_cuenta
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
