-- =====================================================================================
--  SIGA-DP v2 · Migración 020 — COMPROBANTE FISCAL ELECTRÓNICO (PLATAFORMA DGII)
-- =====================================================================================
--  Qué hace
--    1. `comprobante` guarda los datos de la factura electrónica: el id de la
--       plataforma, el eNCF que asignó la DGII, el trackId y el enlace para ver
--       el timbre.
--    2. El número del comprobante deja de ponerlo el sistema: si viene un eNCF
--       (el de la plataforma), se respeta; si no, se usa la secuencia local
--       como antes.
--    3. `fn_registrar_comprobante_electronico` deja el comprobante y sus
--       líneas en la base con el número fiscal real.
--    4. `pago_paypal` guarda el correo del comprador, que es lo que la
--       plataforma devuelve y lo que hace falta para facturar a un consumidor
--       final sin RNC.
--
--  Decisiones del dueño (20 de octubre de 2026)
--    · El número electronico REEMPLAZA al local: solo hay un número, el fiscal.
--    · La clave de la plataforma vive en `servidor/.env` (RN-25).
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

-- ---------------------------------------------------------------------------------
--  1. El número fiscal
-- ---------------------------------------------------------------------------------
--  Antes, este disparador siempre pisaba el número con la secuencia local. Ahora
--  solo lo hace cuando NO viene uno: el de la factura electrónica manda.

CREATE OR REPLACE FUNCTION fn_numerar_comprobante() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_numero BIGINT;
BEGIN
  IF NEW.numero_ncf IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT siguiente_numero INTO v_numero
    FROM secuencia_ncf
   WHERE tipo = NEW.tipo
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay secuencia configurada para el tipo %', NEW.tipo;
  END IF;

  UPDATE secuencia_ncf
     SET ultimo_numero   = v_numero,
         siguiente_numero = v_numero + 1
   WHERE tipo = NEW.tipo;

  NEW.numero_ncf := NEW.tipo || LPAD(v_numero::TEXT, 9, '0');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------
--  2. Los datos de la factura electrónica
-- ---------------------------------------------------------------------------------

ALTER TABLE comprobante
  ADD COLUMN IF NOT EXISTS id_ecf VARCHAR(80),
  ADD COLUMN IF NOT EXISTS track_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS dgii_url TEXT,
  ADD COLUMN IF NOT EXISTS estado_ecf VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  ADD COLUMN IF NOT EXISTS tipo_ecf SMALLINT;

COMMENT ON COLUMN comprobante.id_ecf IS
  'Identificador del comprobante en la plataforma de facturación (Fase 8).';
COMMENT ON COLUMN comprobante.track_id IS
  'Identificador para consultar el estado en la DGII (Fase 8).';
COMMENT ON COLUMN comprobante.dgii_url IS
  'Enlace donde el cliente puede ver el timbre de la DGII (Fase 8).';
COMMENT ON COLUMN comprobante.estado_ecf IS
  'Estado en la plataforma: Pendiente, Enviado, Aceptado, Observado o Anulado (Fase 8).';
COMMENT ON COLUMN comprobante.tipo_ecf IS
  'Tipo de comprobante según la DGII: 31 (Crédito Fiscal) o 32 (Consumo) (Fase 8).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_id_ecf
  ON comprobante (id_ecf)
  WHERE id_ecf IS NOT NULL;

-- ---------------------------------------------------------------------------------
--  3. El correo del comprador de PayPal
-- ---------------------------------------------------------------------------------

ALTER TABLE pago_paypal
  ADD COLUMN IF NOT EXISTS correo_comprador VARCHAR(120);

ALTER TABLE pago_paypal
  ADD COLUMN IF NOT EXISTS id_cajero INTEGER REFERENCES empleado (id_empleado) ON DELETE RESTRICT;

COMMENT ON COLUMN pago_paypal.correo_comprador IS
  'Correo del comprador que devuelve PayPal. Se usa para facturar a un consumidor final (Fase 8).';
COMMENT ON COLUMN pago_paypal.id_cajero IS
  'El cajero que creó el pedido de PayPal. Cuando el pago se confirma solo, el cobro y la factura quedan a su nombre (Fase 8).';

-- ---------------------------------------------------------------------------------
--  4. Dejar el comprobante con su número fiscal y sus líneas
-- ---------------------------------------------------------------------------------
--  La función del diseño (`fn_emitir_comprobante`) numeraba con la secuencia
--  local. Esta deja el comprobante con el número que ya asignó la plataforma.

CREATE OR REPLACE FUNCTION fn_registrar_comprobante_electronico(
  p_cuenta_id      INTEGER,
  p_numero_ncf     VARCHAR,
  p_tipo_ecf       SMALLINT,
  p_tipo           tipo_comprobante,
  p_cliente        VARCHAR,
  p_rnc_cliente    VARCHAR,
  p_base           dinero,
  p_impuesto       dinero,
  p_total          dinero,
  p_forma          forma_pago,
  p_referencia     VARCHAR,
  p_emitido_por    INTEGER,
  p_id_ecf         VARCHAR,
  p_track_id       VARCHAR,
  p_dgii_url       TEXT,
  p_estado_ecf     VARCHAR
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO comprobante (
    numero_ncf, tipo, id_cuenta, cliente, rnc_cliente, base, impuesto, total,
    forma_pago, referencia, id_emitido_por,
    id_ecf, track_id, dgii_url, estado_ecf, tipo_ecf
  ) VALUES (
    p_numero_ncf, p_tipo, p_cuenta_id, p_cliente, p_rnc_cliente, p_base, p_impuesto, p_total,
    p_forma, p_referencia, p_emitido_por,
    p_id_ecf, p_track_id, p_dgii_url, p_estado_ecf, p_tipo_ecf
  )
  RETURNING id_comprobante INTO v_id;

  INSERT INTO linea_comprobante (id_comprobante, id_producto, descripcion, cantidad, importe)
  SELECT v_id, lc.id_producto, lc.descripcion, lc.cantidad, lc.importe
    FROM linea_cuenta lc
   WHERE lc.id_cuenta = p_cuenta_id;

  RETURN v_id;
END;
$$;
