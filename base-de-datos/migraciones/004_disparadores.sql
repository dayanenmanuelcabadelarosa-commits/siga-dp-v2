-- =====================================================================================
--  SIGA-DP v2 · Migración 004 — DISPARADORES (TRIGGERS)
-- =====================================================================================
--  Qué hace
--    Crea los disparadores y sus funciones: fecha de modificación, auditoría en la
-- bitácora, numeración de comprobantes, comandas y cuentas, movimiento de
-- existencias, protección de registros y validación de capacidad.
--
--  De qué depende
--    002_tablas.sql y 003_indices.sql.
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 808 a 1065 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

-- ------------------------------------------------------- 4.1 Fecha de modificación --
CREATE OR REPLACE FUNCTION fn_tocar_modificado() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.modificado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mesa_modificado ON mesa;
CREATE TRIGGER trg_mesa_modificado BEFORE UPDATE ON mesa
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_modificado();

DROP TRIGGER IF EXISTS trg_producto_modificado ON producto;
CREATE TRIGGER trg_producto_modificado BEFORE UPDATE ON producto
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_modificado();

-- -------------------------------------------------------- 4.2 Bitácora automática --
-- Registra en bitacora lo que se inserta, modifica o borra. El usuario sale de la
-- variable de sesión "app.usuario", que la aplicación fija al iniciar sesión.
CREATE OR REPLACE FUNCTION fn_auditar() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario     TEXT;
  v_id_usuario  INTEGER;
  v_id_empleado INTEGER;
  v_id_rol      SMALLINT;
  v_json        JSONB;
  v_registro    TEXT;
BEGIN
  v_usuario := current_setting('app.usuario', TRUE);
  IF v_usuario IS NULL OR v_usuario = '' THEN
    v_usuario := 'sistema';
  END IF;

  SELECT u.id_usuario, u.id_empleado, e.id_rol
    INTO v_id_usuario, v_id_empleado, v_id_rol
    FROM usuario u
    JOIN empleado e ON e.id_empleado = u.id_empleado
   WHERE u.usuario = v_usuario;

  -- Cada tabla tiene su llave con nombre distinto (id, id_mesa, id_cuenta...),
  -- así que se busca la primera que exista en la fila.
  v_json := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_registro := COALESCE(
    v_json ->> 'id', v_json ->> 'id_mesa', v_json ->> 'id_cuenta',
    v_json ->> 'id_producto', v_json ->> 'id_comprobante', v_json ->> 'id_descuento',
    'n/d');

  INSERT INTO bitacora (
    id_empleado, id_rol, id_usuario, usuario_nombre, accion, detalle,
    tabla_afectada, registro_afectado
  ) VALUES (
    v_id_empleado, v_id_rol, v_id_usuario, v_usuario, 'Otro',
    TG_OP || ' sobre ' || TG_TABLE_NAME || ' (registro ' || v_registro || ')',
    TG_TABLE_NAME, v_registro
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Tablas que dejan rastro
DROP TRIGGER IF EXISTS trg_auditar_mesa ON mesa;
CREATE TRIGGER trg_auditar_mesa AFTER INSERT OR UPDATE OR DELETE ON mesa
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_auditar_producto ON producto;
CREATE TRIGGER trg_auditar_producto AFTER INSERT OR UPDATE OR DELETE ON producto
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_auditar_cuenta ON cuenta;
CREATE TRIGGER trg_auditar_cuenta AFTER INSERT OR UPDATE OR DELETE ON cuenta
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_auditar_comprobante ON comprobante;
CREATE TRIGGER trg_auditar_comprobante AFTER INSERT OR UPDATE OR DELETE ON comprobante
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

DROP TRIGGER IF EXISTS trg_auditar_descuento ON descuento;
CREATE TRIGGER trg_auditar_descuento AFTER INSERT ON descuento
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

-- La bitácora es de solo lectura (RN-26)
CREATE OR REPLACE FUNCTION fn_bloquear_bitacora() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es de solo lectura: no se modifica ni se borra (RN-26).'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_bitacora_solo_lectura ON bitacora;
CREATE TRIGGER trg_bitacora_solo_lectura BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_bitacora();

-- ------------------------------------------ 4.3 Numeración fiscal del NCF --
-- Toma el siguiente número con la fila bloqueada, para que dos cajas simultáneas
-- no saquen el mismo número. El número se gasta aunque el comprobante se anule.
CREATE OR REPLACE FUNCTION fn_numerar_comprobante() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_numero BIGINT;
BEGIN
  SELECT siguiente_numero INTO v_numero
    FROM secuencia_ncf
   WHERE tipo = NEW.tipo
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay secuencia configurada para el tipo %', NEW.tipo;
  END IF;

  UPDATE secuencia_ncf
     SET ultimo_numero   = v_numero,
         siguiente_numero = v_numero + 1
   WHERE tipo = NEW.tipo;

  NEW.numero_ncf := NEW.tipo || LPAD(v_numero::TEXT, 9, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numerar_comprobante ON comprobante;
CREATE TRIGGER trg_numerar_comprobante BEFORE INSERT ON comprobante
  FOR EACH ROW EXECUTE FUNCTION fn_numerar_comprobante();

-- ------------------------------------- 4.4 Numeración de comanda y de cuenta --
DROP SEQUENCE IF EXISTS seq_comanda CASCADE;
DROP SEQUENCE IF EXISTS seq_cuenta  CASCADE;
CREATE SEQUENCE seq_comanda START 1041;
CREATE SEQUENCE seq_cuenta  START 103;

CREATE OR REPLACE FUNCTION fn_numerar_comanda() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := nextval('seq_comanda');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numerar_comanda ON comanda;
CREATE TRIGGER trg_numerar_comanda BEFORE INSERT ON comanda
  FOR EACH ROW EXECUTE FUNCTION fn_numerar_comanda();

CREATE OR REPLACE FUNCTION fn_numerar_cuenta() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'F-' || LPAD(nextval('seq_cuenta')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numerar_cuenta ON cuenta;
CREATE TRIGGER trg_numerar_cuenta BEFORE INSERT ON cuenta
  FOR EACH ROW EXECUTE FUNCTION fn_numerar_cuenta();

-- ------------------------------------- 4.5 Inventario: la existencia se sola --
-- Al insertar un movimiento, la existencia del punto se ajusta sola. Se bloquea la
-- fila para que dos movimientos simultáneos no se pisen.
CREATE OR REPLACE FUNCTION fn_mover_existencia() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_actual NUMERIC;
BEGIN
  INSERT INTO existencia (id_insumo, id_punto, existencia, actualizado)
  VALUES (NEW.id_insumo, NEW.id_punto, 0, now())
  ON CONFLICT (id_insumo, id_punto) DO NOTHING;

  SELECT e.existencia INTO v_actual
    FROM existencia e
   WHERE e.id_insumo = NEW.id_insumo AND e.id_punto = NEW.id_punto
     FOR UPDATE;

  IF v_actual + NEW.cantidad < 0 THEN
    RAISE EXCEPTION 'La salida dejaría la existencia del insumo % en negativo (RN-13).', NEW.id_insumo
      USING ERRCODE = '23514';
  END IF;

  UPDATE existencia
     SET existencia = existencia + NEW.cantidad,
         actualizado = now()
   WHERE id_insumo = NEW.id_insumo AND id_punto = NEW.id_punto;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mover_existencia ON movimiento_inventario;
CREATE TRIGGER trg_mover_existencia AFTER INSERT ON movimiento_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_mover_existencia();

-- Un movimiento ya registrado no se modifica ni se borra
CREATE OR REPLACE FUNCTION fn_bloquear_movimiento() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario no se modifican ni se borran.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_movimiento_solo_inserta ON movimiento_inventario;
CREATE TRIGGER trg_movimiento_solo_inserta BEFORE UPDATE OR DELETE ON movimiento_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_movimiento();

-- --------------------------------- 4.6 Productos: nada se borra (RN-16) --
CREATE OR REPLACE FUNCTION fn_evitar_borrado_producto() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_ventas BIGINT;
BEGIN
  SELECT count(*) INTO v_ventas
    FROM linea_pedido lp
   WHERE lp.id_producto = OLD.id_producto;

  IF v_ventas > 0 THEN
    RAISE EXCEPTION 'El producto "%" ya tiene ventas: desactívelo en vez de borrarlo (RN-16).', OLD.nombre
      USING ERRCODE = '23514';
  END IF;

  RAISE EXCEPTION 'Los productos no se borran: desactívelo con ACTIVO = FALSE (RN-16).'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_producto_no_borrar ON producto;
CREATE TRIGGER trg_producto_no_borrar BEFORE DELETE ON producto
  FOR EACH ROW EXECUTE FUNCTION fn_evitar_borrado_producto();

-- ------------------------------- 4.7 La reserva no supera la capacidad (RN-20) --
CREATE OR REPLACE FUNCTION fn_validar_capacidad_reserva() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_capacidad SMALLINT;
BEGIN
  SELECT m.capacidad INTO v_capacidad FROM mesa m WHERE m.id_mesa = NEW.id_mesa;

  IF v_capacidad IS NOT NULL AND NEW.personas > v_capacidad THEN
    RAISE EXCEPTION 'La mesa % tiene capacidad para % personas (RN-20).', NEW.id_mesa, v_capacidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capacidad_reserva ON reserva;
CREATE TRIGGER trg_capacidad_reserva BEFORE INSERT OR UPDATE ON reserva
  FOR EACH ROW EXECUTE FUNCTION fn_validar_capacidad_reserva();
