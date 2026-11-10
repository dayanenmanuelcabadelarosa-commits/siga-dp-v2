-- =====================================================================================
--  SIGA-DP v2 · Migración 010 — El proveedor y el empleado tampoco se borran (RN-16)
-- =====================================================================================
--  Qué hace
--    Agrega los dos disparadores que le faltaban a la regla RN-16.
--
--  El hueco que cierra
--    La regla RN-16 dice: "un producto con historial de ventas no se elimina, y
--    un proveedor se desactiva, nunca se borra". El esquema del profesor solo la
--    cumplía a medias: tenía el disparador del PRODUCTO, pero nada para el
--    proveedor ni para el empleado.
--
--    Consecuencia real de ese hueco:
--      · Al borrar un proveedor, los movimientos de inventario que lo mencionan
--        quedaban con id_proveedor en NULL (la llave foránea es ON DELETE SET
--        NULL). Se perdía a quién se le había comprado. Y el almacén es
--        justamente donde esa información importa el día que un insumo sale mal.
--      · Al borrar un empleado se borraba también su cuenta de acceso (la llave
--        de usuario es ON DELETE CASCADE), sin dejar rastro de que había
--        existido.
--
--    Lo encontró la prueba de RN-16 al escribir las pruebas de la Fase 1, y
--    quedó reportado como decisión 12 de docs/reglas-de-negocio.md. El dueño
--    aprobó cerrar el hueco en la base (que es la fuente única de verdad).
--
--  Cómo se sale del paso si alguien se equivocó al crear uno
--    No hace falta borrar: se desactiva.
--      · Proveedor:  UPDATE proveedor SET estado = 'Inactivo';
--      · Empleado:   UPDATE empleado  SET estado = 'Inactivo';
--    Ni el proveedor ni el empleado inactivos estorban: no aparecen en las
--    listas de trabajo y su historial se conserva.
--
--  Mismo criterio que el disparador del producto (004_disparadores.sql, sección
--  4.6): si ya dejó historial se avisa de eso (23514), y si no, se avisa de que
--  igual no se borra (42501).
--
--  De qué depende
--    002_tablas.sql, 004_disparadores.sql
--
--  Esta migración es idempotente.
-- =====================================================================================


-- ---------------------------------------------------------------- 1. Proveedor --
CREATE OR REPLACE FUNCTION fn_evitar_borrado_proveedor() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_compras BIGINT;
BEGIN
  SELECT count(*) INTO v_compras
    FROM movimiento_inventario mi
   WHERE mi.id_proveedor = OLD.id_proveedor;

  IF v_compras > 0 THEN
    RAISE EXCEPTION 'El proveedor "%" ya tiene % movimiento(s) de inventario: desactívelo en vez de borrarlo (RN-16).',
      OLD.nombre, v_compras
      USING ERRCODE = '23514';
  END IF;

  RAISE EXCEPTION 'Los proveedores no se borran: desactívelo con ESTADO = ''Inactivo'' (RN-16).'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_proveedor_no_borrar ON proveedor;
CREATE TRIGGER trg_proveedor_no_borrar BEFORE DELETE ON proveedor
  FOR EACH ROW EXECUTE FUNCTION fn_evitar_borrado_proveedor();


-- ----------------------------------------------------------------- 2. Empleado --
CREATE OR REPLACE FUNCTION fn_evitar_borrado_empleado() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_servicios BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM pedido  p WHERE p.id_mesero  = OLD.id_empleado)
       + (SELECT count(*) FROM cuenta  c WHERE c.id_mesero  = OLD.id_empleado)
       + (SELECT count(*) FROM pago    g WHERE g.id_cajero  = OLD.id_empleado)
       + (SELECT count(*) FROM propina r WHERE r.id_empleado = OLD.id_empleado)
    INTO v_servicios;

  IF v_servicios > 0 THEN
    RAISE EXCEPTION 'El empleado "%" ya tiene historial de servicio (% registro(s)): délo de baja en vez de borrarlo (RN-16).',
      OLD.nombre, v_servicios
      USING ERRCODE = '23514';
  END IF;

  -- Se avisa de la cuenta de acceso porque borrarlo la arrastra consigo
  -- (la llave de usuario es ON DELETE CASCADE) y no quedaría rastro.
  RAISE EXCEPTION 'Los empleados no se borran: délo de baja con ESTADO = ''Inactivo'' (RN-16). Si tiene cuenta de acceso, se borraría con él.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_empleado_no_borrar ON empleado;
CREATE TRIGGER trg_empleado_no_borrar BEFORE DELETE ON empleado
  FOR EACH ROW EXECUTE FUNCTION fn_evitar_borrado_empleado();
