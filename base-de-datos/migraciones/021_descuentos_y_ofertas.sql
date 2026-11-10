-- =====================================================================================
--  SIGA-DP v2 · Migración 021 — DESCUENTOS Y OFERTAS
-- =====================================================================================
--  Qué hace
--    Agrega a `promocion` el valor del descuento: un porcentaje del total de la
--    cuenta o un monto fijo. Con eso, una oferta deja de ser solo un anuncio y
--    pasa a ser algo que el cajero puede aplicar al cobrar.
--
--  Por qué
--    La tabla `promocion` ya existía (nombre, descripción, fechas y activo) pero
--    no decía cuánto descontaba. El dueño pidió un módulo de descuentos y
--    ofertas que se creen, editen, activen y desactiven, y que se apliquen al
--    cobrar, con la cuenta recalculada en la base.
--
--  Qué NO hace
--    La IA no interviene. Una oferta es un dato guardado en PostgreSQL y el
--    descuento se guarda en la tabla `descuento`, de donde `fn_total_cuenta` lo
--    descuenta solo.
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

ALTER TABLE promocion
  ADD COLUMN IF NOT EXISTS tipo_valor VARCHAR(20);

ALTER TABLE promocion
  ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2);

ALTER TABLE promocion
  DROP CONSTRAINT IF EXISTS ck_promocion_valor;

ALTER TABLE promocion
  ADD CONSTRAINT ck_promocion_valor CHECK (
    (tipo_valor IS NULL AND valor IS NULL)
    OR (
      tipo_valor IN ('Porcentaje', 'Monto')
      AND valor IS NOT NULL
      AND valor > 0
      AND (tipo_valor <> 'Porcentaje' OR valor <= 100)
    )
  );

COMMENT ON COLUMN promocion.tipo_valor IS
  'NULL = oferta sin descuento. "Porcentaje" o "Monto" = descuento aplicable (Fase 8).';
COMMENT ON COLUMN promocion.valor IS
  'El descuento: el porcentaje del total o el monto fijo, en pesos.';
COMMENT ON TABLE promocion IS
  'Descuentos y ofertas del local. Los define la gerencia y el cajero los aplica al cobrar (Fase 8).';
