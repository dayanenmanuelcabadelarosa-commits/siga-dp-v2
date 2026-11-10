-- =====================================================================================
--  SIGA-DP v2 · Migración 016 — CORTESÍA SOLO DEL DUEÑO
-- =====================================================================================
--  Qué hace
--    Revoca `APLICAR_CORTESIA` al rol gerente. La cortesía es la acción más
--    delicada (regalar consumo) y el dueño decidió el 20 de octubre de 2026 que
--    solo él la aplica. El gerente sigue pudiendo aplicar descuentos.
--
--  De qué depende
--    011_matriz_de_permisos.sql y 014_permiso_reportar_agotado.sql.
--
--  NO SE EDITA UNA VEZ APLICADA
-- =====================================================================================

UPDATE rol_permiso
   SET permitido = FALSE
 WHERE id_rol = (SELECT id_rol FROM rol WHERE codigo = 'gerente')
   AND id_permiso = (SELECT id_permiso FROM permiso WHERE codigo = 'APLICAR_CORTESIA');
