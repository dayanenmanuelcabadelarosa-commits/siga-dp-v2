-- =====================================================================================
--  SIGA-DP v2 · Migración 018 — EL CAMBIO CUENTA LA PROPINA
-- =====================================================================================
--  Qué hace
--    Corrige `fn_cobrar_cuenta` para que el cambio se calcule contra lo que de
--    verdad hay que cobrar: el total de la cuenta MÁS la propina.
--
--  Por qué
--    Antes, la función comparaba el efectivo recibido solo con el total de la
--    cuenta. Si la mesa dejaba propina, el cambio salía con la propina metida
--    adentro: el cajero devolvía de menos y el sistema culpaba al vuelto.
--
--    Ejemplo: cuenta de RD$ 350, propina de RD$ 50, el cliente da RD$ 400.
--    El cambio correcto es RD$ 0. Con la función anterior salía RD$ 50.
--
--    La función no se edita donde está (migración 005): se agrega esta, que la
--    reemplaza. Una migración aplicada no se toca.
--
--  De qué depende
--    005_funciones_de_negocio.sql.
-- =====================================================================================

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
  v_a_cobrar   dinero;
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

  v_total    := fn_total_cuenta(p_cuenta_id);
  v_a_cobrar := v_total + COALESCE(p_propina, 0);

  IF p_forma = 'Efectivo' THEN
    IF p_recibido < v_a_cobrar THEN
      RAISE EXCEPTION 'El efectivo recibido (%) es menor que lo que hay que cobrar (%).', p_recibido, v_a_cobrar;
    END IF;
    v_cambio := p_recibido - v_a_cobrar;
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
