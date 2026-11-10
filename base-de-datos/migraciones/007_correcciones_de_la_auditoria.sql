-- =====================================================================================
--  SIGA-DP v2 · Migración 007 — Correcciones de la auditoría
-- =====================================================================================
--  Qué hace
--    Aplica a la base de datos las correcciones de la sección 7 del plan
--    (docs/plan-por-fases.md), que la auditoría técnica detectó en el prototipo:
--
--      1. ck_pedido_cierre era demasiado estricto: exigía "cerrado_en" también
--         para el estado "Enviado", que no significa cerrado.
--      2. El disparador de auditoría de "descuento" solo escuchaba INSERT, así
--         que una modificación o un borrado de descuento no dejaba rastro.
--      3. No había nada que impidiera emitir dos comprobantes fiscales para la
--         misma cuenta.
--      4. Faltaban índices en las columnas de estado y de fecha.
--      5. Se evaluó el uso de to_jsonb(NEW) completo en fn_auditar (ver nota al
--         final del archivo).
--      6. Se evaluó la columna parametro.cuenta_pagos (RN-25) y se documentó qué
--         es y qué no es (ver nota al final del archivo).
--
--  De qué depende
--    002_tablas.sql, 003_indices.sql, 004_disparadores.sql, 005_funciones_de_negocio.sql
--
--  Cuidado
--    Esta migración es idempotente: se puede volver a aplicar sin romper nada.
--    Los objetos que reemplaza se borran antes con "si existe".
--
--  Origen
--    Las correcciones están descritas en siga-dp-prototipo/AUDITORIA.md y en la
--    sección 7 del plan. No se copió código del prototipo.
-- =====================================================================================


-- =====================================================================================
--  1. ck_pedido_cierre: "cerrado_en" solo para Cerrado y Anulado
-- =====================================================================================
--  Antes: (estado = 'Abierto' AND cerrado_en IS NULL) OR (estado <> 'Abierto' AND cerrado_en IS NOT NULL)
--    El problema: pasar un pedido a 'Enviado' obligaba a escribir una fecha de
--    cierre. Pero "Enviado" solo significa que la comanda salió a la cocina; el
--    pedido sigue vivo.
--  Ahora: 'Abierto' exige cerrado_en IS NULL; 'Cerrado' y 'Anulado' lo exigen
--    no nulo; 'Enviado' lo deja libre (normalmente será NULL).

ALTER TABLE pedido DROP CONSTRAINT IF EXISTS ck_pedido_cierre;

ALTER TABLE pedido ADD CONSTRAINT ck_pedido_cierre CHECK (
     (estado = 'Abierto' AND cerrado_en IS NULL)
  OR (estado IN ('Cerrado', 'Anulado') AND cerrado_en IS NOT NULL)
  OR (estado = 'Enviado')
);

COMMENT ON CONSTRAINT ck_pedido_cierre ON pedido IS
  'cerrado_en es obligatorio solo para Cerrado y Anulado. Enviado no es un cierre (corrección de la auditoría).';


-- =====================================================================================
--  2. Auditar los descuentos también en UPDATE y DELETE
-- =====================================================================================
--  Antes solo se auditaba el INSERT. Si alguien modificaba o borraba un
--  descuento, no quedaba registro en la bitácora. El resto de tablas auditadas
--  sí escuchan INSERT, UPDATE y DELETE, así que esto lo pone en línea.

DROP TRIGGER IF EXISTS trg_auditar_descuento ON descuento;
CREATE TRIGGER trg_auditar_descuento
  AFTER INSERT OR UPDATE OR DELETE ON descuento
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();


-- =====================================================================================
--  3. Un solo comprobante fiscal por cuenta
-- =====================================================================================
--  El índice único es la garantía de fondo; la comprobación dentro de la función
--  es la que da un mensaje entendible en vez de un error de llave duplicada.
--
--  Nota sobre los NULL: en PostgreSQL dos NULL no se consideran iguales, así que
--  este índice no limita los comprobantes de ventas de canal (donde id_cuenta es
--  NULL). Eso es lo que queremos.
--
--  Decisión pendiente (docs/reglas-de-negocio.md, sección 5): con esta regla, una
--  cuenta cuyo comprobante fue anulado tampoco puede recibir uno nuevo. Hay que
--  confirmarlo con el dueño.

CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_por_cuenta ON comprobante (id_cuenta);

-- El índice normal ix_comprobante_cuenta ya no hace falta: el único de arriba
-- cubre las mismas consultas.
DROP INDEX IF EXISTS ix_comprobante_cuenta;

COMMENT ON INDEX uq_comprobante_por_cuenta IS
  'Una cuenta tiene un solo comprobante fiscal (RN-05 y sección 7 del plan).';


-- =====================================================================================
--  4. fn_emitir_comprobante: verificar que la cuenta no tenga ya un comprobante
-- =====================================================================================
--  Se vuelve a crear la función entera (CREATE OR REPLACE) porque en PostgreSQL
--  no se puede modificar solo el cuerpo. El resto del cuerpo es idéntico al de
--  la migración 005.

CREATE OR REPLACE FUNCTION fn_emitir_comprobante(
  p_cuenta_id   INTEGER,
  p_tipo        tipo_comprobante,
  p_cliente     VARCHAR,
  p_cajero_id   INTEGER,
  p_rnc_cliente VARCHAR DEFAULT NULL,
  p_forma       forma_pago DEFAULT 'Efectivo',
  p_referencia  VARCHAR DEFAULT NULL
) RETURNS VARCHAR
LANGUAGE plpgsql AS $$
DECLARE
  v_total    dinero;
  v_base     dinero;
  v_impuesto dinero;
  v_tasa     porcentaje;
  v_ncf      VARCHAR;
  v_id       INTEGER;
  v_estado   estado_cuenta;
  v_ya_tiene VARCHAR;
BEGIN
  SELECT c.estado INTO v_estado FROM cuenta c WHERE c.id_cuenta = p_cuenta_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'La cuenta % no existe.', p_cuenta_id;
  END IF;

  -- ---- corrección de la auditoría: un solo comprobante por cuenta ---- (RN-05)
  SELECT cb.numero_ncf INTO v_ya_tiene
    FROM comprobante cb
   WHERE cb.id_cuenta = p_cuenta_id
   LIMIT 1;

  IF v_ya_tiene IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % ya tiene el comprobante % emitido.', p_cuenta_id, v_ya_tiene;
  END IF;

  v_total := fn_total_cuenta(p_cuenta_id);
  SELECT p.tasa_impuesto INTO v_tasa FROM parametro p ORDER BY p.id_parametro DESC LIMIT 1;

  -- El impuesto se calcula sobre lo efectivamente cobrado (RN-10)
  v_base := v_total / (1 + v_tasa / 100);
  v_impuesto := v_total - v_base;

  INSERT INTO comprobante (
    id_cuenta, tipo, cliente, rnc_cliente, base, impuesto, total,
    forma_pago, referencia, id_emitido_por
  ) VALUES (
    p_cuenta_id, p_tipo, p_cliente, p_rnc_cliente, v_base, v_impuesto, v_total,
    p_forma, p_referencia, p_cajero_id
  )
  RETURNING id_comprobante, numero_ncf INTO v_id, v_ncf;

  INSERT INTO linea_comprobante (id_comprobante, id_producto, descripcion, cantidad, importe)
  SELECT v_id, lc.id_producto, lc.descripcion, lc.cantidad, lc.importe
    FROM linea_cuenta lc
   WHERE lc.id_cuenta = p_cuenta_id;

  RETURN v_ncf;
END;
$$;

COMMENT ON FUNCTION fn_emitir_comprobante(
  INTEGER, tipo_comprobante, VARCHAR, INTEGER, VARCHAR, forma_pago, VARCHAR
) IS 'Emite el comprobante fiscal de una cuenta. Rechaza la cuenta que ya tiene uno (corrección de la auditoría).';


-- =====================================================================================
--  5. Índices que faltaban en columnas de estado y de fecha
-- =====================================================================================
--  Las consultas que filtran por estado son las más frecuentes del sistema
--  (pedidos abiertos, cuentas por cobrar, comandas pendientes). Sin índice, con
--  volumen real de datos se vuelven lentas.

CREATE INDEX IF NOT EXISTS ix_pedido_estado          ON pedido (estado);
CREATE INDEX IF NOT EXISTS ix_pedido_abierto_en      ON pedido (abierto_en);
CREATE INDEX IF NOT EXISTS ix_cuenta_estado          ON cuenta (estado);
CREATE INDEX IF NOT EXISTS ix_cuenta_abierta_en      ON cuenta (abierta_en);
CREATE INDEX IF NOT EXISTS ix_linea_pedido_estado    ON linea_pedido (estado);
CREATE INDEX IF NOT EXISTS ix_linea_comanda_estado   ON linea_comanda (estado);
CREATE INDEX IF NOT EXISTS ix_reserva_estado         ON reserva (estado);
CREATE INDEX IF NOT EXISTS ix_comprobante_estado     ON comprobante (estado);
CREATE INDEX IF NOT EXISTS ix_pago_forma_pago        ON pago (forma_pago);
CREATE INDEX IF NOT EXISTS ix_pago_pagado_en         ON pago (pagado_en);
CREATE INDEX IF NOT EXISTS ix_bitacora_accion        ON bitacora (accion);
CREATE INDEX IF NOT EXISTS ix_bitacora_tabla         ON bitacora (tabla_afectada);

--  Falta el índice de pago_paypal.estado que menciona la auditoría: esa tabla no
--  existe todavía, porque PayPal llega en la Fase 8 y su ampliación de esquema
--  vendrá con su propia migración. Queda anotado en docs/progreso.md.


-- =====================================================================================
--  6. Evaluación de to_jsonb(NEW) en fn_auditar
-- =====================================================================================
--  La auditoría pedía "evaluar guardar en la bitácora solo las columnas
--  relevantes en lugar de to_jsonb(NEW) completo".
--
--  Evaluación hecha sobre el código de 004_disparadores.sql: fn_auditar NO guarda
--  el JSON en la bitácora. Lo usa solo para localizar el identificador de la fila
--  (v_json ->> 'id', etc.) y escribe en la bitácora un texto corto y el
--  identificador. Es decir, el problema que describe la auditoría (guardar todas
--  las columnas en cada inserción) no se está produciendo.
--
--  Lo que sí ocurre es que se construye un objeto JSONB por cada escritura
--  auditada, que es un costo real pero pequeño. Se deja como está a propósito:
--  cambiarlo por una búsqueda distinta por tabla añade complejidad a un trigger
--  que corre en el camino caliente de todas las escrituras, para ahorrar un costo
--  que no se ha medido como problema.
--
--  Conclusión: sin cambio. Si algún día la bitácora se vuelve un cuello de
--  botella medido, este es el primer sitio donde mirar.


-- =====================================================================================
--  7. parametro.cuenta_pagos: qué es y qué no es (RN-25)
-- =====================================================================================
--  La regla RN-25 dice que las credenciales de la pasarela de pagos nunca se
--  guardan en la base de datos. La tabla parametro tiene una columna llamada
--  "cuenta_pagos" y había que aclarar si eso la incumple.
--
--  Evaluación: NO la incumple, siempre que guarde una cuenta pública de cobro
--  (por ejemplo el correo de la cuenta del negocio en PayPal), que es un dato
--  que el cliente ve al pagar. Lo que nunca va aquí es la clave secreta de la
--  pasarela ni el token del proveedor: eso vive en el .env.
--
--  Conclusión: la columna se queda, y se documenta en la propia base para que
--  nadie la confunda con un lugar donde guardar credenciales.
--
--  Advertencia honesta: esto es una decisión tomada por el equipo, no algo que
--  el dueño haya confirmado todavía. Queda anotado en docs/reglas-de-negocio.md.

COMMENT ON COLUMN parametro.cuenta_pagos IS
  'Cuenta pública de cobro (por ejemplo, el correo de la cuenta del negocio), no una credencial. La clave secreta de la pasarela vive en el .env, nunca aquí (RN-25).';

