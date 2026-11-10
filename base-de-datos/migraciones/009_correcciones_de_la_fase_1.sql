-- =====================================================================================
--  SIGA-DP v2 · Migración 009 — Correcciones detectadas en la Fase 1
-- =====================================================================================
--  Qué hace
--    Corrige un defecto del esquema del prototipo que no estaba en la auditoría y
--    que salió al escribir las pruebas de la Fase 1.
--
--  El defecto
--    Las columnas "diferencia" de cierre_propina y de corte_caja estaban
--    declaradas con el dominio "dinero", y ese dominio tiene la restricción
--    VALUE >= 0. Pero una diferencia es, por definición, el resultado de una
--    resta que puede dar negativa: es el faltante.
--
--    Resultado: el sistema NO podía registrar un faltante. Si el contado era
--    menor que el esperado (o el efectivo declarado menor que el del sistema), la
--    base rechazaba la operación con
--        "el valor para el dominio dinero viola la restricción check dinero_check".
--
--    O sea: el local solo podía cuadrar cuando le sobraba dinero. Justamente el
--    caso que hay que dejar registrado —el faltante— era el que no se podía
--    guardar. Lo encontró la prueba "calcula lo esperado sumando las propinas del
--    día", en servidor/pruebas/funciones-de-negocio.integracion.test.js.
--
--  La corrección
--    Las dos columnas dejan de usar el dominio "dinero" y pasan a ser
--    NUMERIC(12,2) sin restricción de signo. Se conserva la precisión de dos
--    decimales. Las demás columnas de dinero NO se tocan: ahí el valor negativo
--    sigue siendo un error, y la restricción debe seguir puesta.
--
--    Las dos son columnas calculadas (GENERATED ALWAYS ... STORED), así que
--    cambiar el tipo no pierde nada: el valor se vuelve a calcular solo.
--
--  De qué depende
--    002_tablas.sql
--
--  Esta migración es idempotente.
-- =====================================================================================

-- Si la columna ya es NUMERIC(12,2), el ALTER no hace nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'cierre_propina'
       AND column_name  = 'diferencia'
       AND domain_name  = 'dinero'
  ) THEN
    ALTER TABLE cierre_propina ALTER COLUMN diferencia TYPE NUMERIC(12,2);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'corte_caja'
       AND column_name  = 'diferencia'
       AND domain_name  = 'dinero'
  ) THEN
    ALTER TABLE corte_caja ALTER COLUMN diferencia TYPE NUMERIC(12,2);
  END IF;
END
$$;

COMMENT ON COLUMN cierre_propina.diferencia IS
  'Contado menos esperado. Puede ser negativa: un valor negativo es un faltante (corrección de la Fase 1).';

COMMENT ON COLUMN corte_caja.diferencia IS
  'Efectivo declarado menos efectivo del sistema. Puede ser negativa: un valor negativo es un faltante (corrección de la Fase 1).';
