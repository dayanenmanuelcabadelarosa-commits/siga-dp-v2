-- =====================================================================================
--  SIGA-DP v2 · Migración 017 — INTEGRACIONES: TIEMPOS ESTIMADOS Y PAGOS DE PAYPAL
-- =====================================================================================
--  Qué hace
--    1. Agrega `producto.tiempo_estimado_minutos`: el tiempo de preparación de cada
--       plato. El asistente de IA lo toma de aquí, nunca de un número fijo.
--    2. Crea la tabla `pago_paypal`, que guarda los pedidos de PayPal que se
--       crean para una cuenta: su identificador, su estado y el enlace de
--       aprobación. La auditoría del diseño la mencionaba, pero faltaba.
--
--  De qué depende
--    002_tablas.sql y 004_disparadores.sql.
--
--  Decisiones del dueño (20 de octubre de 2026)
--    · Se mantiene PayPal (decisión 10).
--    · El tiempo estimado vive en cada producto, no en la estación.
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

-- ---------------------------------------------------------------------------------
--  1. Tiempo estimado de cada producto
-- ---------------------------------------------------------------------------------
--  NULL significa "sin estimar": el asistente lo dirá así en vez de inventar un
--  número. La pantalla de Productos deja escribirlo.

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS tiempo_estimado_minutos SMALLINT;

ALTER TABLE producto
  DROP CONSTRAINT IF EXISTS ck_producto_tiempo_estimado;

ALTER TABLE producto
  ADD CONSTRAINT ck_producto_tiempo_estimado
  CHECK (tiempo_estimado_minutos IS NULL OR tiempo_estimado_minutos > 0);

COMMENT ON COLUMN producto.tiempo_estimado_minutos IS
  'Minutos que se toma el plato. NULL = sin estimar. El asistente de IA lo toma de aquí, nunca de un número fijo (Fase 8).';

-- ---------------------------------------------------------------------------------
--  2. Pedidos de PayPal
-- ---------------------------------------------------------------------------------
--  Un pedido de PayPal nace en estado CREATED, el cliente lo aprueba (APPROVED)
--  y el local lo captura (COMPLETED). Si algo falla, queda en FAILED. El número
--  de la cuenta y el estado final se guardan para poder auditar qué se cobró.

CREATE TABLE IF NOT EXISTS pago_paypal (
  id_pago_paypal  SERIAL      PRIMARY KEY,
  id_cuenta       INTEGER     NOT NULL REFERENCES cuenta (id_cuenta) ON DELETE RESTRICT,
  id_paypal       VARCHAR(40) NOT NULL,
  referencia      VARCHAR(80) NOT NULL,
  monto           dinero      NOT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  enlace_aprobacion TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pago_paypal_id UNIQUE (id_paypal),
  CONSTRAINT ck_pago_paypal_monto CHECK (monto > 0),
  CONSTRAINT ck_pago_paypal_estado CHECK (
    estado IN ('CREATED', 'APPROVED', 'COMPLETED', 'FAILED')
  )
);

COMMENT ON TABLE pago_paypal IS
  'Pedidos de PayPal creados para una cuenta. Guarda el identificador, el estado y el enlace de aprobación (Fase 8).';

CREATE INDEX IF NOT EXISTS ix_pago_paypal_estado ON pago_paypal (estado);
CREATE INDEX IF NOT EXISTS ix_pago_paypal_cuenta ON pago_paypal (id_cuenta);

-- La tabla también deja rastro en la bitácora, como las demás de negocio.
DROP TRIGGER IF EXISTS trg_auditar_pago_paypal ON pago_paypal;
CREATE TRIGGER trg_auditar_pago_paypal
  AFTER INSERT OR UPDATE OR DELETE ON pago_paypal
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
