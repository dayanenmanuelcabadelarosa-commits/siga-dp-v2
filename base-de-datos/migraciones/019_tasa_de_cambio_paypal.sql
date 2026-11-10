-- =====================================================================================
--  SIGA-DP v2 · Migración 019 — TASA DE CAMBIO PARA COBRAR EN PAYPAL
-- =====================================================================================
--  Qué hace
--    1. Agrega `parametro.tasa_cambio_usd`: cuántos pesos dominicanos vale un
--       dólar. Es el dato que el dueño escribe y mantiene; el sistema no lo
--       busca en internet, para que el cobro no dependa de que una API externa
--       esté respondiendo.
--    2. Agrega a `pago_paypal` el monto en pesos y la tasa que se usó, para que
--       quede escrito cuánto se cobró en cada moneda.
--
--  De qué depende
--    002_tablas.sql y 017_integraciones_tiempos_y_paypal.sql.
--
--  Decisión del dueño (20 de octubre de 2026)
--    La tasa se escribe a mano en la base, no se consulta de una API.
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

-- ---------------------------------------------------------------------------------
--  1. La tasa de cambio
-- ---------------------------------------------------------------------------------
--  NULL significa "sin tasa": con PayPal no se cobra hasta que el dueño la
--  escriba. La cuenta y el corte de caja siguen en pesos dominicanos; esta tasa
--  solo se usa para hablar con PayPal, que cobra en dólares.

ALTER TABLE parametro
  ADD COLUMN IF NOT EXISTS tasa_cambio_usd NUMERIC(12, 4);

ALTER TABLE parametro
  DROP CONSTRAINT IF EXISTS ck_parametro_tasa_cambio;

ALTER TABLE parametro
  ADD CONSTRAINT ck_parametro_tasa_cambio
  CHECK (tasa_cambio_usd IS NULL OR tasa_cambio_usd > 0);

COMMENT ON COLUMN parametro.tasa_cambio_usd IS
  'Cuántos pesos dominicanos vale un dólar. NULL = sin tasa. Se usa solo para cobrar en PayPal (Fase 8).';

-- ---------------------------------------------------------------------------------
--  2. Lo que se cobró, en las dos monedas
-- ---------------------------------------------------------------------------------

ALTER TABLE pago_paypal
  ADD COLUMN IF NOT EXISTS monto_rd dinero;

ALTER TABLE pago_paypal
  ADD COLUMN IF NOT EXISTS tasa_cambio NUMERIC(12, 4);

COMMENT ON COLUMN pago_paypal.monto_rd IS
  'Total de la cuenta en pesos dominicanos, sin convertir. La venta se registra en la base en pesos.';
COMMENT ON COLUMN pago_paypal.tasa_cambio IS
  'Tasa usada en ese cobro (pesos por dólar), para poder revisarlo después.';
