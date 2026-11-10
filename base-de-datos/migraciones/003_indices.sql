-- =====================================================================================
--  SIGA-DP v2 · Migración 003 — ÍNDICES
-- =====================================================================================
--  Qué hace
--    Crea los índices de llaves foráneas, de consultas frecuentes y los índices
-- únicos parciales que hacen cumplir varias reglas de negocio (RN-01, RN-04,
-- RN-05, RN-21).
--
--  De qué depende
--    002_tablas.sql.
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 752 a 803 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

CREATE INDEX ix_mesa_zona            ON mesa (id_zona);
CREATE INDEX ix_mesa_mesero_orden    ON mesa (id_mesero_orden);
CREATE INDEX ix_mesa_estado          ON mesa (estado);
CREATE INDEX ix_reserva_fecha_hora   ON reserva (fecha, hora);
CREATE INDEX ix_reserva_mesa         ON reserva (id_mesa);
CREATE INDEX ix_producto_categoria   ON producto (id_categoria);
CREATE INDEX ix_producto_disponible  ON producto (activo, disponible);
CREATE INDEX ix_pedido_mesa          ON pedido (id_mesa);
CREATE INDEX ix_pedido_mesero        ON pedido (id_mesero);
CREATE INDEX ix_mesa_pedido_pedido   ON mesa_pedido (id_pedido);
CREATE INDEX ix_linea_pedido_pedido  ON linea_pedido (id_pedido);
CREATE INDEX ix_comanda_pedido       ON comanda (id_pedido);
CREATE INDEX ix_comanda_estacion     ON comanda (id_estacion, estado);
CREATE INDEX ix_linea_comanda_comanda ON linea_comanda (id_comanda);
CREATE INDEX ix_historial_linea      ON historial_linea (id_linea_comanda, ocurrido_en);
CREATE INDEX ix_cuenta_mesa          ON cuenta (id_mesa);
CREATE INDEX ix_cuenta_mesero        ON cuenta (id_mesero);
CREATE INDEX ix_linea_cuenta_cuenta  ON linea_cuenta (id_cuenta);
CREATE INDEX ix_asignacion_cuenta    ON asignacion_persona (id_cuenta, comensal);
CREATE INDEX ix_propina_empleado     ON propina (id_empleado, registrada_en);
CREATE INDEX ix_propina_cuenta       ON propina (id_cuenta);
CREATE INDEX ix_venta_canal_fecha    ON venta_canal (registrada_en);
CREATE INDEX ix_comprobante_fecha    ON comprobante (emitido_en);
CREATE INDEX ix_comprobante_cuenta   ON comprobante (id_cuenta);
CREATE INDEX ix_movimiento_insumo    ON movimiento_inventario (id_insumo, ocurrido_en);
CREATE INDEX ix_movimiento_fecha     ON movimiento_inventario (ocurrido_en);
CREATE INDEX ix_bitacora_fecha       ON bitacora (ocurrido_en);
CREATE INDEX ix_bitacora_empleado    ON bitacora (id_empleado, ocurrido_en);

-- Reglas de negocio que los índices únicos impiden
-- Una mesa no puede tener dos pedidos abiertos (RN-01)
CREATE UNIQUE INDEX uq_pedido_abierto_por_mesa
  ON pedido (id_mesa) WHERE estado = 'Abierto';
-- Una mesa no puede tener dos cuentas abiertas (RN-05)
CREATE UNIQUE INDEX uq_cuenta_abierta_por_mesa
  ON cuenta (id_mesa) WHERE estado = 'Abierta';
-- Una mesa no puede tener dos reservas vivas el mismo día (RN-21)
CREATE UNIQUE INDEX uq_reserva_por_mesa_hora
  ON reserva (id_mesa, fecha, hora) WHERE estado <> 'Cancelada';
-- Un empleado no repite propina de la misma mesa el mismo día (RN-04)
-- El índice lleva id_empleado, id_mesa y la fecha, que es exactamente lo que
-- dice la regla: si el índice solo tuviera mesa y fecha, dos meseros distintos
-- de la misma mesa no podrían cobrar propina y el sistema bloquearía el cobro.
--
-- Nota: no se puede usar DATE(registrada_en) dentro de un índice porque esa
-- función no es IMMUTABLE (depende de la zona horaria del servidor). Por eso se
-- pasa primero a la hora local con AT TIME ZONE, que sí es IMMUTABLE.
CREATE UNIQUE INDEX uq_propina_por_mesa
  ON propina (id_empleado, id_mesa, ((registrada_en AT TIME ZONE 'America/Santo_Domingo')::date))
  WHERE id_mesa IS NOT NULL;
