-- =====================================================================================
--  SIGA-DP v2 · Migración 014 — La operación 28: reportar agotado y reponer
-- =====================================================================================
--
--  Qué hace
--    Agrega el permiso `REPORTAR_AGOTADO` y decide, para los 8 roles, quién lo
--    tiene. Con eso la matriz pasa de 27 a 28 operaciones.
--
--  De dónde sale
--    La lista del profesor titula "Las 28 operaciones" pero solo trae 27. La que
--    faltaba estaba señalada como decisión pendiente 13 en
--    docs/reglas-de-negocio.md: la cocina puede ver las existencias, pero no
--    tenía cómo avisar que un producto se agotó. EL DUEÑO APROBÓ ESTA OPERACIÓN
--    EL 19 DE OCTUBRE DE 2026, con este reparto:
--
--        dueño     sí
--        gerente   sí
--        capitán   no
--        mesero    no
--        anfitrión no
--        cocina    sí
--        cajero    no
--        almacén   no
--
--    El documento manda: la tabla de la sección 4.5 se actualizó el mismo día y
--    la prueba `matriz-de-permisos.integracion.test.js` compara las dos.
--
--  Por qué una migración nueva y no editar la 011
--    Porque la 011 ya se aplicó en las bases. Una migración aplicada no se toca:
--    se corrige con otra. Esta es la otra.
--
--  Qué significa "reponer"
--    Es la misma operación al revés: el producto vuelve a estar disponible. No
--    se inventó un segundo permiso para eso.
-- =====================================================================================

INSERT INTO permiso (codigo, descripcion, modulo) VALUES
  ('REPORTAR_AGOTADO', 'Marcar un producto agotado y reponerlo', 'M05')
ON CONFLICT (codigo) DO NOTHING;

-- Se llenan las 8 casillas de la operación nueva: los 3 "sí" y los 5 "no". Así
-- queda escrito que cada "no" se pensó, igual que en la migración 011.
INSERT INTO rol_permiso (id_rol, id_permiso, permitido)
SELECT r.id_rol,
       p.id_permiso,
       r.codigo IN ('dueno', 'gerente', 'cocina')
  FROM rol r
 CROSS JOIN permiso p
 WHERE p.codigo = 'REPORTAR_AGOTADO'
ON CONFLICT (id_rol, id_permiso) DO UPDATE
  SET permitido = EXCLUDED.permitido;
