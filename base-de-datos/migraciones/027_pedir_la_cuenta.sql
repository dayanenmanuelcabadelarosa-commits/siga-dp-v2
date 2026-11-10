-- =====================================================================================
--  SIGA-DP v2 — Migración 027 — PEDIR LA CUENTA Y CERRAR EL SERVICIO
-- =====================================================================================
--
--  Qué hace
--    • Agrega `mesa.cuenta_pedida_en`: el instante en que el mesero avisó que la
--      mesa quiere la cuenta. Es la cola que ve el cajero.
--    • `fn_pedir_cuenta`: marca la mesa, sin generar todavía la cuenta.
--    • `fn_quitar_cuenta_pedida`: deshace ese aviso si fue un error.
--    • `fn_cerrar_servicio_mesa`: al pagar la cuenta, manda la mesa a limpieza y
--      borra los datos del servicio.
--    • Un disparador sobre `cuenta` llama a `fn_cerrar_servicio_mesa` cuando la
--      cuenta pasa a `Pagada`.
--
--  Por qué
--    El mesero necesita avisarle al cajero que una mesa quiere la cuenta sin
--    generar la cuenta (generar congela el consumo y es tarea del cajero). El
--    aviso tiene que verse en la pantalla del cajero, que se refresca sola.
--
--    Al cobrar, la mesa se quedaba en "Cuenta pedida" para siempre porque
--    `fn_cobrar_cuenta` no toca `mesa`. Ahora el mismo pago la manda a limpieza.
--
--  Qué NO hace
--    No crea cuentas, no cobra y no cambia la matriz de permisos. Pedir la cuenta
--    usa `CAPTURAR_PEDIDO`, el mismo permiso con el que el mesero toma el pedido.
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

ALTER TABLE mesa
  ADD COLUMN IF NOT EXISTS cuenta_pedida_en TIMESTAMPTZ;

COMMENT ON COLUMN mesa.cuenta_pedida_en IS
  'Instante en que el mesero pidió la cuenta. NULL si no se ha pedido o si el servicio ya cerró.';


-- -------------------------------------------------------------------------------------
-- 1. Pedir la cuenta
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pedir_cuenta(p_mesa_id INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql AS $$
DECLARE
  v_estado  estado_mesa;
  v_pedida  TIMESTAMPTZ;
  v_pedido  INTEGER;
BEGIN
  SELECT m.estado, m.cuenta_pedida_en
    INTO v_estado, v_pedida
    FROM mesa m
   WHERE m.id_mesa = p_mesa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe.' USING ERRCODE = 'P0002';
  END IF;

  /*
    Si ya se había pedido, se devuelve el mismo instante. Así el botón puede
    reintentar sin duplicar nada.
  */
  IF v_pedida IS NOT NULL THEN
    RETURN v_pedida;
  END IF;

  IF v_estado <> 'ocupada' THEN
    RAISE EXCEPTION 'La mesa no está ocupada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cuenta c
     WHERE c.id_mesa = p_mesa_id AND c.estado = 'Abierta'
  ) THEN
    RAISE EXCEPTION 'La cuenta de esta mesa ya se generó.';
  END IF;

  SELECT p.id_pedido
    INTO v_pedido
    FROM pedido p
   WHERE p.id_mesa = p_mesa_id
     AND p.estado IN ('Abierto', 'Enviado')
   ORDER BY p.id_pedido DESC
   LIMIT 1;

  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'La mesa no tiene un pedido abierto.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM linea_pedido lp
     WHERE lp.id_pedido = v_pedido AND lp.estado = 'Guardada'
  ) THEN
    RAISE EXCEPTION 'Envía primero a cocina todo el consumo pendiente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM linea_pedido lp
     WHERE lp.id_pedido = v_pedido
       AND lp.estado = 'Enviada'
       AND NOT EXISTS (
             SELECT 1 FROM linea_comanda lc
              WHERE lc.id_linea_pedido = lp.id_linea_pedido
                AND lc.estado = 'Anulada'
           )
  ) THEN
    RAISE EXCEPTION 'La mesa no tiene consumo enviado.';
  END IF;

  UPDATE mesa
     SET cuenta_pedida_en = now(),
         estado_pedido    = 'Cuenta pedida'
   WHERE id_mesa = p_mesa_id
   RETURNING cuenta_pedida_en INTO v_pedida;

  RETURN v_pedida;
END;
$$;


-- -------------------------------------------------------------------------------------
-- 2. Quitar el aviso (si el cliente se arrepintió o el mesero se equivocó)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_quitar_cuenta_pedida(p_mesa_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_pedida  TIMESTAMPTZ;
  v_pedido  INTEGER;
BEGIN
  SELECT m.cuenta_pedida_en
    INTO v_pedida
    FROM mesa m
   WHERE m.id_mesa = p_mesa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe.' USING ERRCODE = 'P0002';
  END IF;

  IF v_pedida IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cuenta c
     WHERE c.id_mesa = p_mesa_id AND c.estado = 'Abierta'
  ) THEN
    RAISE EXCEPTION 'La cuenta ya se generó; no se puede quitar el aviso.';
  END IF;

  SELECT p.id_pedido
    INTO v_pedido
    FROM pedido p
   WHERE p.id_mesa = p_mesa_id
     AND p.estado IN ('Abierto', 'Enviado')
   ORDER BY p.id_pedido DESC
   LIMIT 1;

  UPDATE mesa
     SET cuenta_pedida_en = NULL,
         estado_pedido = CASE
           WHEN v_pedido IS NULL THEN 'Tomando pedido'::estado_pedido_mesa
           WHEN EXISTS (
             SELECT 1 FROM linea_pedido lp
              WHERE lp.id_pedido = v_pedido AND lp.estado = 'Enviada'
           ) THEN 'En preparación'::estado_pedido_mesa
           ELSE 'Tomando pedido'::estado_pedido_mesa
         END
   WHERE id_mesa = p_mesa_id;
END;
$$;


-- -------------------------------------------------------------------------------------
-- 3. Cerrar el servicio cuando la cuenta se paga
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cerrar_servicio_mesa(p_mesa_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  /*
    Solo se cierra el servicio de una mesa ocupada. Si ya estaba libre o en
    limpieza, no se toca: otra persona pudo haberla preparado entretanto.
  */
  UPDATE mesa
     SET estado          = 'limpieza',
         personas        = NULL,
         hora_llegada    = NULL,
         id_mesero_orden = NULL,
         estado_pedido   = NULL,
         cuenta_pedida_en = NULL
   WHERE id_mesa = p_mesa_id
     AND estado = 'ocupada';
END;
$$;

CREATE OR REPLACE FUNCTION fn_cerrar_servicio_al_pagar()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'Pagada' AND OLD.estado IS DISTINCT FROM 'Pagada' THEN
    PERFORM fn_cerrar_servicio_mesa(NEW.id_mesa);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cerrar_servicio_al_pagar ON cuenta;
CREATE TRIGGER trg_cerrar_servicio_al_pagar
  AFTER UPDATE OF estado ON cuenta
  FOR EACH ROW
  EXECUTE FUNCTION fn_cerrar_servicio_al_pagar();
