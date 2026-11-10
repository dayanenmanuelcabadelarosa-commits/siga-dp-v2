/*
  013_ajuste_de_inventario_con_diferencia.sql
  -------------------------------------------

  RN-14 dice que el ajuste por conteo guarda la diferencia entre lo contado y lo
  que había, no la existencia final. Esa diferencia puede ser positiva (sobra)
  o negativa (falta).

  La restricción original, `ck_movimiento_signo`, solo permitía ajustes con
  `cantidad > 0`. Eso hacía imposible registrar un faltante: el sistema habría
  tenido que mentir guardándolo como una salida por consumo, que no es lo mismo.

  Esta migración reemplaza esa restricción para que el ajuste acepte cualquier
  diferencia distinta de cero. Las entradas siguen siendo positivas y las salidas
  siguen siendo negativas. El disparador `fn_mover_existencia` no cambia: sigue
  aplicando la cantidad y rechazando cualquier existencia negativa (RN-13).

  Una migración aplicada no se edita; por eso el cambio va aquí y no en 002.
*/

ALTER TABLE movimiento_inventario
  DROP CONSTRAINT IF EXISTS ck_movimiento_signo;

ALTER TABLE movimiento_inventario
  ADD CONSTRAINT ck_movimiento_signo CHECK (
    (tipo = 'Entrada de compra' AND cantidad > 0)
    OR (tipo = 'Salida por consumo' AND cantidad < 0)
    OR (tipo = 'Ajuste por conteo' AND cantidad <> 0)
  );

COMMENT ON CONSTRAINT ck_movimiento_signo ON movimiento_inventario IS
  'Entrada positiva, salida negativa y ajuste con la diferencia (puede ser positiva o negativa).';
