-- =====================================================================================
--  SIGA-DP v2 · Migración 026 — EL ESTADO DEL ECF CABE ENTERO
-- =====================================================================================
--
--  Qué hace
--    Agranda `comprobante.estado_ecf` de 20 a 60 caracteres.
--
--  Por qué
--    La plataforma de facturación devuelve estados largos, por ejemplo
--    "PENDIENTE_ENVIO_AL_SERVICIO_DGII" (35 letras). Con la columna de 20, el
--    guardado del comprobante reventaba con un error 500 ("Ocurrió un error en
--    el servidor") y el comprobante se perdía, aunque la plataforma ya lo
--    tuviera registrado.
--
--  De qué depende
--    020_comprobante_electronico.sql.
-- =====================================================================================

ALTER TABLE comprobante
  ALTER COLUMN estado_ecf TYPE VARCHAR(60);
