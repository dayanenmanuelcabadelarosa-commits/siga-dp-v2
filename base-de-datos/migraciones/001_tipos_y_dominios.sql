-- =====================================================================================
--  SIGA-DP v2 · Migración 001 — TIPOS ENUM Y DOMINIOS
-- =====================================================================================
--  Qué hace
--    Crea los tipos ENUM del negocio (estados de mesa, pedido, cuenta, comprobante…)
-- y los dominios `dinero`, `cantidad` y `porcentaje`.
--
--  De qué depende
--    Ninguna. Es la primera migración.
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 49 a 131 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

DROP TYPE IF EXISTS estado_empleado CASCADE;
CREATE TYPE estado_empleado AS ENUM ('Activo', 'Inactivo', 'Bloqueado');

-- Los cuatro estados posibles de una mesa
DROP TYPE IF EXISTS estado_mesa CASCADE;
CREATE TYPE estado_mesa AS ENUM ('libre', 'ocupada', 'limpieza', 'reservada');

DROP TYPE IF EXISTS estado_reserva CASCADE;
CREATE TYPE estado_reserva AS ENUM ('Pendiente', 'Abierta', 'Cancelada');

-- Estado del servicio que se está dando en la mesa
DROP TYPE IF EXISTS estado_pedido_mesa CASCADE;
CREATE TYPE estado_pedido_mesa AS ENUM ('Tomando pedido', 'En preparación', 'Servido', 'Cuenta pedida');

DROP TYPE IF EXISTS estado_pedido CASCADE;
CREATE TYPE estado_pedido AS ENUM ('Abierto', 'Enviado', 'Cerrado', 'Anulado');

DROP TYPE IF EXISTS estado_linea_pedido CASCADE;
CREATE TYPE estado_linea_pedido AS ENUM ('Borrador', 'Guardada', 'Enviada', 'Anulada');

DROP TYPE IF EXISTS estado_comanda CASCADE;
CREATE TYPE estado_comanda AS ENUM ('Pendiente', 'En preparación', 'Preparado', 'Cerrada');

-- Etapas del plato en la pantalla de seguimiento
DROP TYPE IF EXISTS estado_linea_comanda CASCADE;
CREATE TYPE estado_linea_comanda AS ENUM ('Pendiente', 'En preparación', 'Preparado', 'Servido', 'Anulada');

DROP TYPE IF EXISTS estado_cuenta CASCADE;
CREATE TYPE estado_cuenta AS ENUM ('Abierta', 'Pagada', 'Anulada');

DROP TYPE IF EXISTS forma_pago CASCADE;
CREATE TYPE forma_pago AS ENUM ('Efectivo', 'Tarjeta', 'PayPal', 'Crédito');

DROP TYPE IF EXISTS tipo_comprobante CASCADE;
CREATE TYPE tipo_comprobante AS ENUM ('B01', 'B02');

DROP TYPE IF EXISTS estado_comprobante CASCADE;
CREATE TYPE estado_comprobante AS ENUM ('Emitido', 'Anulado');

DROP TYPE IF EXISTS canal_venta CASCADE;
CREATE TYPE canal_venta AS ENUM ('Delivery', 'Para llevar');

DROP TYPE IF EXISTS tipo_movimiento CASCADE;
CREATE TYPE tipo_movimiento AS ENUM ('Entrada de compra', 'Salida por consumo', 'Ajuste por conteo');

DROP TYPE IF EXISTS estado_proveedor CASCADE;
CREATE TYPE estado_proveedor AS ENUM ('Activo', 'Inactivo');

DROP TYPE IF EXISTS tipo_descuento CASCADE;
CREATE TYPE tipo_descuento AS ENUM ('Descuento', 'Cortesía');

DROP TYPE IF EXISTS estado_corte CASCADE;
CREATE TYPE estado_corte AS ENUM ('Abierto', 'Cerrado');

-- Acciones que quedan en la bitácora
DROP TYPE IF EXISTS accion_bitacora CASCADE;
CREATE TYPE accion_bitacora AS ENUM (
  'Inicio de sesión', 'Cierre de sesión', 'Cuenta bloqueada', 'Cuenta desbloqueada',
  'Mesa ocupada', 'Mesa liberada', 'Reserva registrada', 'Reserva cancelada', 'Reserva abierta',
  'Pedido abierto', 'Comanda enviada', 'Comanda en preparación', 'Comanda preparada',
  'Plato servido', 'Plato anulado', 'Producto agotado', 'Cuenta generada', 'Cuenta anulada',
  'Cuenta dividida', 'Descuento autorizado', 'Cortesía autorizada', 'Pago registrado',
  'Comprobante emitido', 'Comprobante anulado', 'Propina registrada', 'Propinas conciliadas',
  'Corte de caja cerrado', 'Corte de caja reabierto', 'Venta externa registrada',
  'Entrada de compra', 'Salida por consumo', 'Ajuste de inventario',
  'Producto creado', 'Producto actualizado', 'Producto desactivado', 'Promoción creada',
  'Mesa creada', 'Mesa actualizada', 'Zona creada', 'Empleado creado', 'Empleado actualizado',
  'Rol modificado', 'Parámetros actualizados', 'Secuencia fiscal modificada', 'Otro'
);

-- Montos: nunca punto flotante, y nunca negativo
DROP DOMAIN IF EXISTS dinero CASCADE;
CREATE DOMAIN dinero AS NUMERIC(12,2) CHECK (VALUE >= 0);

-- Cantidades de inventario, que sí pueden ser negativas en un movimiento
DROP DOMAIN IF EXISTS cantidad CASCADE;
CREATE DOMAIN cantidad AS NUMERIC(12,2);

-- Porcentaje con dos decimales
DROP DOMAIN IF EXISTS porcentaje CASCADE;
CREATE DOMAIN porcentaje AS NUMERIC(5,2) CHECK (VALUE >= 0 AND VALUE <= 100);
