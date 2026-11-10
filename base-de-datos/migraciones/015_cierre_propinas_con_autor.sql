-- =====================================================================================
--  SIGA-DP v2 — Migración 015
--  Cierre de propinas: dejar escrito quién cerró y comparar en hora local
-- =====================================================================================
--
--  Qué corrige
--    La función `fn_cerrar_propinas` de la migración 005 recibía solo al empleado
--    cuyas propinas se cierran y usaba ese mismo id como `id_cerrado_por`. Si un
--    capitán o el gerente cerraba las propinas de un mesero, la base decía que
--    las había cerrado el mesero. La columna `id_cerrado_por` existe justamente
--    para guardar a quien hizo el cierre.
--
--    Además, la fecha se comparaba con `DATE(registrada_en)`, que depende de la
--    zona horaria de la sesión de PostgreSQL. El índice único de RN-04 usa
--    `America/Santo_Domingo`; ahora las dos cosas usan la misma zona.
--
--  Qué NO se toca
--    La versión de tres argumentos se conserva para no romper llamadas directas
--    que ya existan. La API usa la de cuatro argumentos, que es la que deja
--    escrito al autor del cierre.
-- =====================================================================================

-- Versión que usa la API: recibe también al empleado que hace el cierre.
CREATE OR REPLACE FUNCTION fn_cerrar_propinas(
  p_empleado_id INTEGER,
  p_fecha DATE,
  p_contado dinero,
  p_cerrado_por INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_esperado  dinero;
  v_cierre_id INTEGER;
BEGIN
  SELECT COALESCE(sum(pr.monto), 0)::dinero INTO v_esperado
    FROM propina pr
   WHERE pr.id_empleado = p_empleado_id
     AND (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = p_fecha;

  INSERT INTO cierre_propina (id_empleado, fecha, esperado, contado, id_cerrado_por)
  VALUES (p_empleado_id, p_fecha, v_esperado, p_contado, p_cerrado_por)
  RETURNING id_cierre INTO v_cierre_id;

  RETURN v_cierre_id;
END;
$$;

COMMENT ON FUNCTION fn_cerrar_propinas(INTEGER, DATE, dinero, INTEGER) IS
  'Cierra las propinas de un empleado y anota quién las cerró (RN-12).';

-- Versión anterior de tres argumentos: se mantiene para las llamadas directas
-- que ya la usaban. Corrige la comparación de fecha, pero el cierre queda a
-- nombre del propio empleado porque no recibe un autor distinto.
CREATE OR REPLACE FUNCTION fn_cerrar_propinas(
  p_empleado_id INTEGER,
  p_fecha DATE,
  p_contado dinero
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_esperado  dinero;
  v_cierre_id INTEGER;
BEGIN
  SELECT COALESCE(sum(pr.monto), 0)::dinero INTO v_esperado
    FROM propina pr
   WHERE pr.id_empleado = p_empleado_id
     AND (pr.registrada_en AT TIME ZONE 'America/Santo_Domingo')::date = p_fecha;

  INSERT INTO cierre_propina (id_empleado, fecha, esperado, contado, id_cerrado_por)
  VALUES (p_empleado_id, p_fecha, v_esperado, p_contado, p_empleado_id)
  RETURNING id_cierre INTO v_cierre_id;

  RETURN v_cierre_id;
END;
$$;
