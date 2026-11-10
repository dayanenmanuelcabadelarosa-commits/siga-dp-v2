-- =====================================================================================
--  SIGA-DP v2 · Migración 002 — TABLAS
-- =====================================================================================
--  Qué hace
--    Crea las 41 tablas con sus llaves primarias, foráneas, restricciones únicas
-- y de comprobación.
--
--  De qué depende
--    001_tipos_y_dominios.sql (usa los ENUM y los dominios).
--
--  Origen
--    Copiado tal cual de "siga_dp_postgresql.sql" (el script del profesor),
--    líneas 136 a 747 de ese archivo. El prototipo original está en
--    siga-dp-prototipo/base de datos/ y es de solo lectura.
--
--  NO SE EDITA UNA VEZ APLICADA
--    Si hay que cambiar algo, se agrega una migración nueva con el número
--    siguiente. Este archivo queda como estaba.
-- =====================================================================================

-- ------------------------------------------------------------------ 2.1 Seguridad --

DROP TABLE IF EXISTS rol_permiso CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;
DROP TABLE IF EXISTS empleado CASCADE;
DROP TABLE IF EXISTS rol CASCADE;
DROP TABLE IF EXISTS permiso CASCADE;

CREATE TABLE rol (
  id_rol      SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(30)  NOT NULL,
  nombre      VARCHAR(40)  NOT NULL,
  nivel       SMALLINT     NOT NULL,
  descripcion VARCHAR(160),
  CONSTRAINT uq_rol_codigo UNIQUE (codigo),
  CONSTRAINT uq_rol_nombre UNIQUE (nombre),
  CONSTRAINT ck_rol_nivel  CHECK (nivel BETWEEN 1 AND 5)
);
COMMENT ON TABLE  rol           IS 'Los ocho roles del local. El rol define qué ve y qué puede hacer cada persona.';
COMMENT ON COLUMN rol.nivel     IS '1 a 5, según el nivel de acceso del capítulo 22.2 del diseño.';

CREATE TABLE permiso (
  id_permiso   SMALLSERIAL  PRIMARY KEY,
  codigo       VARCHAR(40)  NOT NULL,
  descripcion  VARCHAR(120) NOT NULL,
  modulo       VARCHAR(5),
  CONSTRAINT uq_permiso_codigo UNIQUE (codigo)
);
COMMENT ON TABLE permiso IS 'Operaciones que el sistema controla (28 en total, capítulo 22.3 del diseño).';

CREATE TABLE rol_permiso (
  id_rol     SMALLINT NOT NULL REFERENCES rol (id_rol) ON DELETE CASCADE,
  id_permiso SMALLINT NOT NULL REFERENCES permiso (id_permiso) ON DELETE CASCADE,
  permitido  BOOLEAN  NOT NULL DEFAULT FALSE,
  CONSTRAINT pk_rol_permiso PRIMARY KEY (id_rol, id_permiso)
);
COMMENT ON TABLE rol_permiso IS 'Matriz de permisos: qué rol puede hacer qué operación.';

CREATE TABLE empleado (
  id_empleado   SERIAL          PRIMARY KEY,
  cedula        VARCHAR(20)     NOT NULL,
  nombre        VARCHAR(80)     NOT NULL,
  telefono      VARCHAR(20),
  id_rol        SMALLINT        NOT NULL REFERENCES rol (id_rol) ON DELETE RESTRICT,
  estado        estado_empleado NOT NULL DEFAULT 'Activo',
  fecha_ingreso DATE            NOT NULL DEFAULT CURRENT_DATE,
  creado_en     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT uq_empleado_cedula UNIQUE (cedula)
);
COMMENT ON TABLE  empleado        IS 'Personas que trabajan en el local. Un empleado dado de baja queda Inactivo y conserva su historial.';
COMMENT ON COLUMN empleado.estado IS 'Activo puede entrar al sistema; Inactivo no; Bloqueado por intentos fallidos.';

CREATE TABLE usuario (
  id_usuario        SERIAL          PRIMARY KEY,
  usuario           VARCHAR(30)     NOT NULL,
  clave_hash        VARCHAR(200)    NOT NULL,
  id_empleado       INTEGER         NOT NULL UNIQUE REFERENCES empleado (id_empleado) ON DELETE CASCADE,
  estado            estado_empleado NOT NULL DEFAULT 'Activo',
  intentos_fallidos SMALLINT        NOT NULL DEFAULT 0,
  ultimo_acceso     TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuario_nombre UNIQUE (usuario)
);
COMMENT ON TABLE  usuario                  IS 'Cuenta de acceso al sistema. Cada empleado tiene una sola cuenta.';
COMMENT ON COLUMN usuario.clave_hash        IS 'Contraseña cifrada. Nunca se guarda en texto plano.';
COMMENT ON COLUMN usuario.intentos_fallidos IS 'Al llegar a 3 la cuenta se bloquea (RN-24).';

-- ------------------------------------------------------- 2.2 Configuración fiscal --

DROP TABLE IF EXISTS secuencia_ncf CASCADE;
DROP TABLE IF EXISTS parametro CASCADE;

CREATE TABLE parametro (
  id_parametro   SMALLSERIAL  PRIMARY KEY,
  nombre_empresa VARCHAR(80)  NOT NULL,
  rnc            VARCHAR(20)  NOT NULL,
  direccion      VARCHAR(120) NOT NULL,
  telefono       VARCHAR(20)  NOT NULL,
  tasa_impuesto  porcentaje   NOT NULL,
  cuenta_pagos   VARCHAR(60),
  vigente_desde  DATE         NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT ck_parametro_tasa CHECK (tasa_impuesto > 0),
  CONSTRAINT uq_parametro_rnc  UNIQUE (rnc)
);
COMMENT ON TABLE  parametro             IS 'Parámetros fiscales del local. Solo uno vigente a la vez (RN-19).';
COMMENT ON COLUMN parametro.tasa_impuesto IS 'Porcentaje de ITBIS, por ejemplo 18.00. No puede ser cero.';

CREATE TABLE secuencia_ncf (
  tipo             tipo_comprobante PRIMARY KEY,
  ultimo_numero    BIGINT NOT NULL DEFAULT 0,
  siguiente_numero BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT ck_secuencia_coherente CHECK (siguiente_numero = ultimo_numero + 1)
);
COMMENT ON TABLE secuencia_ncf IS 'Contador de numeración fiscal por tipo. El número nunca se repite, ni al anular (RN-08).';

-- ------------------------------------------------------------- 2.3 Salón: mesas --

DROP TABLE IF EXISTS zona CASCADE;
DROP TABLE IF EXISTS mesa CASCADE;
DROP TABLE IF EXISTS reserva CASCADE;

CREATE TABLE zona (
  id_zona       SERIAL       PRIMARY KEY,
  nombre        VARCHAR(60)  NOT NULL,
  tipo_ambiente VARCHAR(30)  NOT NULL,
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_zona_nombre UNIQUE (nombre)
);
COMMENT ON TABLE zona IS 'Ambientes del restaurante: salón, terraza, barra y áreas privadas.';

CREATE TABLE mesa (
  id_mesa         SERIAL          PRIMARY KEY,
  numero          SMALLINT        NOT NULL,
  id_zona         INTEGER         NOT NULL REFERENCES zona (id_zona) ON DELETE RESTRICT,
  capacidad       SMALLINT        NOT NULL,
  estado          estado_mesa     NOT NULL DEFAULT 'libre',
  personas        SMALLINT,
  hora_llegada    TIMESTAMPTZ,
  id_mesero_orden INTEGER         REFERENCES empleado (id_empleado) ON DELETE SET NULL,
  estado_pedido   estado_pedido_mesa,
  creado_en       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  modificado_en   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT uq_mesa_numero     UNIQUE (numero),
  CONSTRAINT ck_mesa_capacidad  CHECK (capacidad > 0),
  CONSTRAINT ck_mesa_personas   CHECK (personas IS NULL OR (personas > 0 AND personas <= capacidad)),
  CONSTRAINT ck_mesa_coherencia CHECK (
       (estado = 'ocupada' AND personas IS NOT NULL AND hora_llegada IS NOT NULL)
    OR (estado <> 'ocupada' AND estado <> 'reservada' AND personas IS NULL AND hora_llegada IS NULL)
    OR (estado = 'reservada' AND personas IS NULL AND hora_llegada IS NULL)
  )
);
COMMENT ON TABLE  mesa                IS 'Las mesas del local y el servicio que las está atendiendo.';
COMMENT ON COLUMN mesa.id_mesero_orden IS 'Empleado que tomó la orden. En este local cualquier mesero atiende cualquier mesa (RN-03).';
COMMENT ON COLUMN mesa.hora_llegada    IS 'Se calcula al ocupar la mesa; de ahí sale el reloj que ve el mesero.';

CREATE TABLE reserva (
  id_reserva        SERIAL          PRIMARY KEY,
  fecha             DATE            NOT NULL,
  hora              TIME            NOT NULL,
  nombre_cliente    VARCHAR(80)     NOT NULL,
  telefono          VARCHAR(20)     NOT NULL,
  personas          SMALLINT        NOT NULL,
  id_mesa           INTEGER         NOT NULL REFERENCES mesa (id_mesa) ON DELETE RESTRICT,
  estado            estado_reserva  NOT NULL DEFAULT 'Pendiente',
  id_mesero_asignado INTEGER        REFERENCES empleado (id_empleado) ON DELETE SET NULL,
  motivo_cancelacion VARCHAR(160),
  creado_en         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT ck_reserva_personas CHECK (personas > 0),
  CONSTRAINT ck_reserva_cancelada CHECK (estado <> 'Cancelada' OR motivo_cancelacion IS NOT NULL)
);
COMMENT ON TABLE reserva IS 'Agenda de reservas. Una mesa no puede tener dos reservas vivas el mismo día y hora (RN-21).';

-- ------------------------------------------------------------------- 2.4 Catálogo --

DROP TABLE IF EXISTS categoria CASCADE;
DROP TABLE IF EXISTS estacion CASCADE;
DROP TABLE IF EXISTS proveedor CASCADE;
DROP TABLE IF EXISTS producto CASCADE;
DROP TABLE IF EXISTS insumo CASCADE;
DROP TABLE IF EXISTS producto_componente CASCADE;
DROP TABLE IF EXISTS promocion CASCADE;

CREATE TABLE categoria (
  id_categoria SERIAL       PRIMARY KEY,
  nombre       VARCHAR(50)  NOT NULL,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_categoria_nombre UNIQUE (nombre)
);
COMMENT ON TABLE categoria IS 'Grupos del menú: Parrilla, Platos del día, Acompañantes, Bebidas, Postres.';

CREATE TABLE estacion (
  id_estacion SERIAL      PRIMARY KEY,
  nombre      VARCHAR(30) NOT NULL,
  CONSTRAINT uq_estacion_nombre UNIQUE (nombre)
);
COMMENT ON TABLE estacion IS 'Dónde se prepara cada producto: Cocina, Parrilla, Barra. Define a qué pantalla va la comanda.';

CREATE TABLE proveedor (
  id_proveedor SERIAL           PRIMARY KEY,
  nombre       VARCHAR(80)      NOT NULL,
  telefono     VARCHAR(20)      NOT NULL,
  estado       estado_proveedor NOT NULL DEFAULT 'Activo',
  CONSTRAINT uq_proveedor_nombre UNIQUE (nombre)
);
COMMENT ON TABLE  proveedor        IS 'De quién se compra. Un proveedor nunca se borra: se desactiva (RN-16).';
COMMENT ON COLUMN proveedor.estado IS 'Activo o Inactivo; el histórico de compras siempre se conserva.';

CREATE TABLE producto (
  id_producto     SERIAL      PRIMARY KEY,
  nombre          VARCHAR(80) NOT NULL,
  id_categoria    INTEGER     NOT NULL REFERENCES categoria (id_categoria) ON DELETE RESTRICT,
  id_estacion     INTEGER     NOT NULL REFERENCES estacion (id_estacion) ON DELETE RESTRICT,
  precio          dinero      NOT NULL,
  disponible      BOOLEAN     NOT NULL DEFAULT TRUE,
  riesgo_agotarse BOOLEAN     NOT NULL DEFAULT FALSE,
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_producto_nombre UNIQUE (nombre),
  CONSTRAINT ck_producto_precio  CHECK (precio > 0)
);
COMMENT ON TABLE  producto        IS 'Lo que se vende. Un producto con historial de ventas no se borra, se desactiva (RN-16).';
COMMENT ON COLUMN producto.precio IS 'En las líneas de pedido y de cuenta se copia, para que un cambio de precio no altere lo ya vendido (RN-02).';

CREATE TABLE unidad_medida (
  id_unidad   SERIAL       PRIMARY KEY,
  nombre      VARCHAR(20)  NOT NULL,
  abreviatura VARCHAR(5)   NOT NULL,
  CONSTRAINT uq_unidad_nombre UNIQUE (nombre)
);
COMMENT ON TABLE unidad_medida IS 'Unidades de medida de los insumos: lb, gal, und, kg.';

CREATE TABLE insumo (
  id_insumo SERIAL       PRIMARY KEY,
  nombre    VARCHAR(80)  NOT NULL,
  id_unidad INTEGER      NOT NULL REFERENCES unidad_medida (id_unidad) ON DELETE RESTRICT,
  minimo    cantidad     NOT NULL,
  activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_insumo_nombre UNIQUE (nombre),
  CONSTRAINT ck_insumo_minimo  CHECK (minimo >= 0)
);
COMMENT ON TABLE  insumo        IS 'Lo que se compra y se consume. El mínimo de reposición es obligatorio.';
COMMENT ON COLUMN insumo.minimo IS 'Por debajo de este valor el sistema avisa que hay que reponer.';

CREATE TABLE producto_componente (
  id_producto INTEGER  NOT NULL REFERENCES producto (id_producto) ON DELETE CASCADE,
  id_insumo   INTEGER  NOT NULL REFERENCES insumo (id_insumo) ON DELETE RESTRICT,
  cantidad    cantidad NOT NULL,
  CONSTRAINT pk_producto_componente PRIMARY KEY (id_producto, id_insumo),
  CONSTRAINT cc_componente_cantidad  CHECK (cantidad > 0)
);
COMMENT ON TABLE producto_componente IS 'Receta de cada producto: de qué insumos está hecho y cuánta cantidad usa.';

CREATE TABLE promocion (
  id_promocion SERIAL       PRIMARY KEY,
  nombre       VARCHAR(80)  NOT NULL,
  descripcion  VARCHAR(160) NOT NULL,
  fecha_inicio DATE         NOT NULL,
  fecha_fin    DATE         NOT NULL,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_promocion_vigencia CHECK (fecha_fin >= fecha_inicio)
);
COMMENT ON TABLE promocion IS 'Descuentos y beneficios por período. La vigencia se valida al guardar (RN-22).';

-- ------------------------------------------------- 2.5 Operación: mesas y pedidos --

DROP TABLE IF EXISTS mesa_pedido CASCADE;
DROP TABLE IF EXISTS historial_linea CASCADE;
DROP TABLE IF EXISTS linea_comanda CASCADE;
DROP TABLE IF EXISTS linea_pedido CASCADE;
DROP TABLE IF EXISTS comanda CASCADE;
DROP TABLE IF EXISTS sugerencia_asistente CASCADE;
DROP TABLE IF EXISTS pedido CASCADE;

CREATE TABLE pedido (
  id_pedido  SERIAL        PRIMARY KEY,
  id_mesa    INTEGER       NOT NULL REFERENCES mesa (id_mesa) ON DELETE RESTRICT,
  id_mesero  INTEGER       NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  estado     estado_pedido NOT NULL DEFAULT 'Abierto',
  abierto_en TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cerrado_en TIMESTAMPTZ,
  CONSTRAINT ck_pedido_cierre CHECK ((estado = 'Abierto' AND cerrado_en IS NULL)
                                  OR (estado <> 'Abierto' AND cerrado_en IS NOT NULL))
);
COMMENT ON TABLE  pedido         IS 'Lo que pidió una mesa en un turno. Una mesa no tiene dos pedidos abiertos (RN-01).';
COMMENT ON COLUMN pedido.id_mesero IS 'Mesero de la orden: es a quien le corresponde la propina (RN-03).';

-- Puente mesa-pedido: guarda quién se sentó en cada turno, y en qué orden.
-- Es lo que permite saber a quién se le asigna cada línea al dividir la cuenta.
CREATE TABLE mesa_pedido (
  id_mesa_pedido SERIAL     PRIMARY KEY,
  id_mesa        INTEGER    NOT NULL REFERENCES mesa (id_mesa) ON DELETE RESTRICT,
  id_pedido      INTEGER    NOT NULL REFERENCES pedido (id_pedido) ON DELETE RESTRICT,
  comensal       SMALLINT   NOT NULL,
  orden_llegada  SMALLINT   NOT NULL,
  orden_salida   SMALLINT,
  CONSTRAINT uq_mesa_pedido_comensal UNIQUE (id_pedido, comensal),
  CONSTRAINT ck_mesa_pedido_orden     CHECK (orden_llegada > 0 AND comensal > 0),
  CONSTRAINT ck_mesa_pedido_salida    CHECK (orden_salida IS NULL OR orden_salida >= orden_llegada)
);
COMMENT ON TABLE mesa_pedido IS 'Quiénes se sentaron en la mesa en cada turno: es el origen del comensal de cada línea.';

CREATE TABLE linea_pedido (
  id_linea_pedido  SERIAL              PRIMARY KEY,
  id_pedido        INTEGER             NOT NULL REFERENCES pedido (id_pedido) ON DELETE CASCADE,
  id_producto      INTEGER             NOT NULL REFERENCES producto (id_producto) ON DELETE RESTRICT,
  comensal         SMALLINT            NOT NULL DEFAULT 1,
  cantidad         SMALLINT            NOT NULL,
  precio_unitario  dinero              NOT NULL,
  observacion      VARCHAR(160),
  estado           estado_linea_pedido NOT NULL DEFAULT 'Borrador',
  motivo_anulacion VARCHAR(160),
  creado_en        TIMESTAMPTZ         NOT NULL DEFAULT now(),
  CONSTRAINT ck_linea_cantidad  CHECK (cantidad > 0),
  CONSTRAINT ck_linea_precio    CHECK (precio_unitario >= 0),
  CONSTRAINT ck_linea_anulacion CHECK (estado <> 'Anulada' OR motivo_anulacion IS NOT NULL)
);
COMMENT ON TABLE  linea_pedido                IS 'Cada producto que pidió la mesa. El precio se congela al pedir (RN-02).';
COMMENT ON COLUMN linea_pedido.comensal       IS 'A qué comensal pertenece (1, 2, 3...). Con esto se divide la cuenta después.';
COMMENT ON COLUMN linea_pedido.precio_unitario IS 'Precio copiado del producto en el momento de pedir, no una referencia viva.';

CREATE TABLE comanda (
  id_comanda   SERIAL         PRIMARY KEY,
  numero      INTEGER         NOT NULL,
  id_pedido   INTEGER         NOT NULL REFERENCES pedido (id_pedido) ON DELETE RESTRICT,
  id_estacion INTEGER         NOT NULL REFERENCES estacion (id_estacion) ON DELETE RESTRICT,
  estado      estado_comanda  NOT NULL DEFAULT 'Pendiente',
  enviada_en  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  iniciada_en TIMESTAMPTZ,
  cerrada_en  TIMESTAMPTZ,
  CONSTRAINT uq_comanda_numero UNIQUE (numero)
);
COMMENT ON TABLE comanda IS 'Lo que recibe una estación. El número de comanda es correlativo y único.';

CREATE TABLE linea_comanda (
  id_linea_comanda SERIAL               PRIMARY KEY,
  id_comanda       INTEGER              NOT NULL REFERENCES comanda (id_comanda) ON DELETE CASCADE,
  id_linea_pedido  INTEGER              NOT NULL UNIQUE REFERENCES linea_pedido (id_linea_pedido) ON DELETE RESTRICT,
  cantidad         SMALLINT             NOT NULL,
  estado           estado_linea_comanda NOT NULL DEFAULT 'Pendiente',
  hora_inicio      TIMESTAMPTZ,
  hora_preparado   TIMESTAMPTZ,
  hora_servido     TIMESTAMPTZ,
  motivo_anulacion VARCHAR(160),
  CONSTRAINT ck_linea_comanda_cantidad  CHECK (cantidad > 0),
  CONSTRAINT ck_linea_comanda_anulacion CHECK (estado <> 'Anulada' OR motivo_anulacion IS NOT NULL)
);
COMMENT ON TABLE linea_comanda IS 'Los productos de la comanda y su avance. Es la fuente del seguimiento del pedido.';

-- Cada cambio de etapa queda anotado: así se puede medir cuánto tardó cada plato
CREATE TABLE historial_linea (
  id_historial     SERIAL               PRIMARY KEY,
  id_linea_comanda INTEGER              NOT NULL REFERENCES linea_comanda (id_linea_comanda) ON DELETE CASCADE,
  etapa            estado_linea_comanda NOT NULL,
  ocurrido_en      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  id_empleado      INTEGER              REFERENCES empleado (id_empleado) ON DELETE SET NULL,
  detalle          VARCHAR(160)
);
COMMENT ON TABLE historial_linea IS 'Historial de estados de cada línea de comanda (tiempos de preparación y servicio).';

CREATE TABLE sugerencia_asistente (
  id_sugerencia     SERIAL       PRIMARY KEY,
  id_producto       INTEGER      NOT NULL REFERENCES producto (id_producto) ON DELETE CASCADE,
  motivo            VARCHAR(160) NOT NULL,
  minutos_estimados SMALLINT     NOT NULL,
  CONSTRAINT ck_sugerencia_minutos CHECK (minutos_estimados > 0)
);
COMMENT ON TABLE sugerencia_asistente IS 'Sugerencias del asistente inteligente: producto, motivo y tiempo estimado.';

-- -------------------------------------------------------- 2.6 Caja y facturación --

DROP TABLE IF EXISTS linea_venta_canal CASCADE;
DROP TABLE IF EXISTS venta_canal CASCADE;
DROP TABLE IF EXISTS asignacion_persona CASCADE;
DROP TABLE IF EXISTS pago CASCADE;
DROP TABLE IF EXISTS descuento CASCADE;
DROP TABLE IF EXISTS linea_cuenta CASCADE;
DROP TABLE IF EXISTS cuenta CASCADE;
DROP TABLE IF EXISTS cierre_propina CASCADE;
DROP TABLE IF EXISTS propina CASCADE;
DROP TABLE IF EXISTS corte_caja CASCADE;

CREATE TABLE cuenta (
  id_cuenta  SERIAL        PRIMARY KEY,
  numero     VARCHAR(15)   NOT NULL,
  id_mesa    INTEGER       NOT NULL REFERENCES mesa (id_mesa) ON DELETE RESTRICT,
  id_pedido  INTEGER       NOT NULL UNIQUE REFERENCES pedido (id_pedido) ON DELETE RESTRICT,
  id_mesero  INTEGER       NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  cortesia   BOOLEAN       NOT NULL DEFAULT FALSE,
  propina    dinero        NOT NULL DEFAULT 0,
  estado     estado_cuenta NOT NULL DEFAULT 'Abierta',
  abierta_en TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cerrada_en TIMESTAMPTZ,
  CONSTRAINT uq_cuenta_numero UNIQUE (numero),
  CONSTRAINT ck_cuenta_cierre  CHECK ((estado = 'Abierta' AND cerrada_en IS NULL)
                                  OR (estado <> 'Abierta' AND cerrada_en IS NOT NULL))
);
COMMENT ON TABLE  cuenta          IS 'La factura interna de una mesa. Se genera una sola vez por mesa (RN-05).';
COMMENT ON COLUMN cuenta.id_mesero IS 'Copia del mesero de la orden: es el que recibe la propina de esta cuenta.';
COMMENT ON COLUMN cuenta.estado    IS 'Al pasar a Pagada el consumo queda congelado y ya no se modifica (RN-06).';

CREATE TABLE linea_cuenta (
  id_linea_cuenta SERIAL          PRIMARY KEY,
  id_cuenta       INTEGER         NOT NULL REFERENCES cuenta (id_cuenta) ON DELETE CASCADE,
  id_linea_pedido INTEGER         REFERENCES linea_pedido (id_linea_pedido) ON DELETE SET NULL,
  id_producto     INTEGER         NOT NULL REFERENCES producto (id_producto) ON DELETE RESTRICT,
  descripcion     VARCHAR(80)     NOT NULL,
  cantidad        SMALLINT        NOT NULL,
  precio_unitario dinero          NOT NULL,
  comensal        SMALLINT,
  importe         dinero          NOT NULL GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  CONSTRAINT ck_linea_cuenta_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_linea_cuenta_precio   CHECK (precio_unitario >= 0)
);
COMMENT ON TABLE  linea_cuenta         IS 'Consumos de la cuenta. La descripción y el precio se copian al facturar (RN-02).';
COMMENT ON COLUMN linea_cuenta.importe IS 'Se calcula solo: cantidad por precio unitario.';

CREATE TABLE descuento (
  id_descuento       SERIAL         PRIMARY KEY,
  id_cuenta          INTEGER        NOT NULL REFERENCES cuenta (id_cuenta) ON DELETE RESTRICT,
  concepto          VARCHAR(120)   NOT NULL,
  monto             dinero         NOT NULL,
  tipo              tipo_descuento NOT NULL,
  id_autorizado_por INTEGER         NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  aplicado_en       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT ck_descuento_monto CHECK (monto > 0)
);
COMMENT ON TABLE descuento IS 'Descuentos y cortesías. Siempre con su autorizante: el capitán el descuento, el dueño la cortesía (RN-07).';

CREATE TABLE pago (
  id_pago        SERIAL      PRIMARY KEY,
  id_cuenta      INTEGER     NOT NULL UNIQUE REFERENCES cuenta (id_cuenta) ON DELETE RESTRICT,
  forma_pago     forma_pago  NOT NULL,
  monto_recibido dinero      NOT NULL,
  cambio         dinero,
  referencia     VARCHAR(40),
  propina        dinero      NOT NULL DEFAULT 0,
  id_cajero      INTEGER     NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  pagado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pago_monto      CHECK (monto_recibido >= 0),
  CONSTRAINT ck_pago_cambio     CHECK (cambio IS NULL OR cambio >= 0),
  CONSTRAINT ck_pago_propina    CHECK (propina >= 0),
  CONSTRAINT ck_pago_referencia CHECK (forma_pago NOT IN ('Tarjeta', 'PayPal') OR referencia IS NOT NULL)
);
COMMENT ON TABLE pago IS 'Cobro de una cuenta. Una cuenta se cobra una sola vez.';

CREATE TABLE asignacion_persona (
  id_asignacion   SERIAL  PRIMARY KEY,
  id_cuenta       INTEGER NOT NULL REFERENCES cuenta (id_cuenta) ON DELETE CASCADE,
  comensal        SMALLINT NOT NULL,
  id_linea_cuenta INTEGER NOT NULL REFERENCES linea_cuenta (id_linea_cuenta) ON DELETE CASCADE,
  monto_asignado  dinero   NOT NULL,
  CONSTRAINT uq_asignacion_linea UNIQUE (id_linea_cuenta),
  CONSTRAINT ck_asignacion_monto  CHECK (monto_asignado >= 0)
);
COMMENT ON TABLE asignacion_persona IS 'Reparto de la cuenta entre comensales cuando el cliente paga por separado.';

CREATE TABLE propina (
  id_propina     SERIAL      PRIMARY KEY,
  id_empleado    INTEGER     NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  id_mesa        INTEGER     REFERENCES mesa (id_mesa) ON DELETE SET NULL,
  id_cuenta      INTEGER     REFERENCES cuenta (id_cuenta) ON DELETE SET NULL,
  monto          dinero      NOT NULL,
  forma          forma_pago  NOT NULL,
  referencia     VARCHAR(40),
  registrada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_propina_monto      CHECK (monto > 0),
  CONSTRAINT ck_propina_referencia CHECK (forma <> 'Tarjeta' OR referencia IS NOT NULL)
);
COMMENT ON TABLE  propina            IS 'Propinas del día. El empleado es siempre el mesero de la orden de esa mesa (RN-04).';
COMMENT ON COLUMN propina.id_empleado IS 'Se copia del pedido, no lo elige quien registra.';

CREATE TABLE cierre_propina (
  id_cierre      SERIAL      PRIMARY KEY,
  id_empleado    INTEGER     NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  fecha          DATE        NOT NULL,
  esperado       dinero      NOT NULL,
  contado        dinero      NOT NULL,
  diferencia     dinero      NOT NULL GENERATED ALWAYS AS (contado - esperado) STORED,
  id_cerrado_por INTEGER     NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  cerrado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cierre_empleado_fecha UNIQUE (id_empleado, fecha)
);
COMMENT ON TABLE cierre_propina IS 'Conciliación diaria de propinas por mesero. Solo un cierre por mesero y fecha (RN-12).';

CREATE TABLE venta_canal (
  id_venta          SERIAL      PRIMARY KEY,
  canal             canal_venta NOT NULL,
  nombre_cliente    VARCHAR(80) NOT NULL,
  total             dinero      NOT NULL,
  id_registrado_por INTEGER     NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  registrada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_venta_canal_total CHECK (total >= 0)
);
COMMENT ON TABLE venta_canal IS 'Ventas de delivery o para llevar. No ocupan mesa, pero entran al corte del día.';

CREATE TABLE linea_venta_canal (
  id_linea_venta   INTEGER     NOT NULL REFERENCES venta_canal (id_venta) ON DELETE CASCADE,
  id_producto      INTEGER     NOT NULL REFERENCES producto (id_producto) ON DELETE RESTRICT,
  cantidad         SMALLINT    NOT NULL,
  precio_unitario  dinero      NOT NULL,
  importe          dinero      NOT NULL GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  CONSTRAINT pk_linea_venta_canal PRIMARY KEY (id_linea_venta, id_producto),
  CONSTRAINT ck_linea_venta_cantidad CHECK (cantidad > 0)
);

CREATE TABLE corte_caja (
  id_corte            SERIAL       PRIMARY KEY,
  fecha              DATE         NOT NULL,
  efectivo_sistema   dinero       NOT NULL DEFAULT 0,
  efectivo_declarado dinero,
  diferencia         dinero       GENERATED ALWAYS AS (efectivo_declarado - efectivo_sistema) STORED,
  total_tarjeta      dinero       NOT NULL DEFAULT 0,
  total_paypal       dinero       NOT NULL DEFAULT 0,
  total_credito      dinero       NOT NULL DEFAULT 0,
  total_ventas_canal dinero       NOT NULL DEFAULT 0,
  total_ventas       dinero       NOT NULL DEFAULT 0,
  comprobantes       INTEGER      NOT NULL DEFAULT 0,
  total_descuentos   dinero       NOT NULL DEFAULT 0,
  estado             estado_corte NOT NULL DEFAULT 'Abierto',
  id_cerrado_por     INTEGER      REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  cerrado_en         TIMESTAMPTZ,
  CONSTRAINT uq_corte_fecha UNIQUE (fecha)
);
COMMENT ON TABLE  corte_caja                IS 'Cierre del día. Un corte por fecha; cerrado solo el dueño lo puede reabrir (RN-11).';
COMMENT ON COLUMN corte_caja.diferencia      IS 'Efectivo declarado menos efectivo del sistema. Se calcula solo.';
COMMENT ON COLUMN corte_caja.efectivo_declarado IS 'Queda NULL mientras el corte está abierto.';

-- ---------------------------------------------------------------------- 2.7 Fiscal --

DROP TABLE IF EXISTS linea_comprobante CASCADE;
DROP TABLE IF EXISTS comprobante CASCADE;

CREATE TABLE comprobante (
  id_comprobante INTEGER             PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  numero_ncf     VARCHAR(20)        NOT NULL,
  tipo           tipo_comprobante   NOT NULL,
  id_cuenta      INTEGER            REFERENCES cuenta (id_cuenta) ON DELETE SET NULL,
  id_venta_canal INTEGER            REFERENCES venta_canal (id_venta) ON DELETE SET NULL,
  cliente        VARCHAR(80)        NOT NULL,
  rnc_cliente    VARCHAR(20),
  base           dinero             NOT NULL,
  impuesto       dinero             NOT NULL,
  total          dinero             NOT NULL,
  forma_pago     forma_pago         NOT NULL,
  referencia     VARCHAR(40),
  estado         estado_comprobante NOT NULL DEFAULT 'Emitido',
  id_emitido_por INTEGER            NOT NULL REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  emitido_en     TIMESTAMPTZ        NOT NULL DEFAULT now(),
  id_anulado_por INTEGER            REFERENCES empleado (id_empleado) ON DELETE RESTRICT,
  anulado_en     TIMESTAMPTZ,
  CONSTRAINT uq_comprobante_ncf    UNIQUE (numero_ncf),
  CONSTRAINT ck_comprobante_totales  CHECK (total = base + impuesto),
  CONSTRAINT ck_comprobante_anulacion CHECK ((estado = 'Emitido' AND anulado_en IS NULL)
                                          OR (estado = 'Anulado'  AND anulado_en IS NOT NULL)),
  CONSTRAINT ck_comprobante_origen    CHECK (id_cuenta IS NOT NULL OR id_venta_canal IS NOT NULL)
);
COMMENT ON TABLE  comprobante           IS 'Comprobante fiscal (NCF). El número se toma de la secuencia y nunca se reutiliza (RN-08).';
COMMENT ON COLUMN comprobante.numero_ncf IS 'Formato B0100000124: dos letras del tipo más nueve dígitos.';

CREATE TABLE linea_comprobante (
  id_linea_comprobante SERIAL     PRIMARY KEY,
  id_comprobante       INTEGER    NOT NULL REFERENCES comprobante (id_comprobante) ON DELETE CASCADE,
  id_producto          INTEGER    REFERENCES producto (id_producto) ON DELETE SET NULL,
  descripcion          VARCHAR(80) NOT NULL,
  cantidad             SMALLINT   NOT NULL,
  importe              dinero     NOT NULL,
  CONSTRAINT ck_linea_comprobante_cantidad CHECK (cantidad > 0)
);

-- ------------------------------------------------------------------ 2.8 Inventario --

DROP TABLE IF EXISTS movimiento_inventario CASCADE;
DROP TABLE IF EXISTS existencia CASCADE;
DROP TABLE IF EXISTS punto_acceso CASCADE;

CREATE TABLE punto_acceso (
  id_punto   SERIAL      PRIMARY KEY,
  nombre     VARCHAR(30) NOT NULL,
  es_almacen BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_punto_nombre UNIQUE (nombre)
);
COMMENT ON TABLE punto_acceso IS 'Dónde se guarda el insumo: Cocina, Parrilla, Barra y Almacén.';

CREATE TABLE existencia (
  id_insumo  INTEGER     NOT NULL REFERENCES insumo (id_insumo) ON DELETE RESTRICT,
  id_punto   INTEGER     NOT NULL REFERENCES punto_acceso (id_punto) ON DELETE RESTRICT,
  existencia cantidad    NOT NULL DEFAULT 0,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_existencia            PRIMARY KEY (id_insumo, id_punto),
  CONSTRAINT ck_existencia_no_negativa CHECK (existencia >= 0)
);
COMMENT ON TABLE  existencia            IS 'Cantidad de cada insumo en cada punto de acceso. Nunca puede quedar negativa (RN-13).';
COMMENT ON COLUMN existencia.existencia IS 'Se actualiza sola al registrar un movimiento de inventario.';

CREATE TABLE movimiento_inventario (
  id_movimiento BIGSERIAL        PRIMARY KEY,
  tipo          tipo_movimiento NOT NULL,
  id_insumo     INTEGER          NOT NULL REFERENCES insumo (id_insumo) ON DELETE RESTRICT,
  id_punto      INTEGER          NOT NULL REFERENCES punto_acceso (id_punto) ON DELETE RESTRICT,
  cantidad      cantidad         NOT NULL,
  detalle       VARCHAR(160)     NOT NULL,
  id_proveedor  INTEGER          REFERENCES proveedor (id_proveedor) ON DELETE SET NULL,
  id_empleado   INTEGER          REFERENCES empleado (id_empleado) ON DELETE SET NULL,
  ocurrido_en   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT ck_movimiento_cantidad CHECK (cantidad <> 0),
  CONSTRAINT ck_movimiento_signo    CHECK ((tipo IN ('Entrada de compra', 'Ajuste por conteo') AND cantidad > 0)
                                        OR (tipo = 'Salida por consumo' AND cantidad < 0)),
  CONSTRAINT ck_movimiento_proveedor CHECK (tipo <> 'Entrada de compra' OR id_proveedor IS NOT NULL)
);
COMMENT ON TABLE movimiento_inventario IS 'Historial de entradas, salidas y ajustes. El ajuste guarda la diferencia, no la existencia final (RN-14).';

-- ------------------------------------------------------------------- 2.9 Auditoría --

DROP TABLE IF EXISTS bitacora CASCADE;

CREATE TABLE bitacora (
  id_bitacora       BIGSERIAL    PRIMARY KEY,
  ocurrido_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  id_empleado       INTEGER      REFERENCES empleado (id_empleado) ON DELETE SET NULL,
  id_rol            SMALLINT     REFERENCES rol (id_rol) ON DELETE SET NULL,
  id_usuario        INTEGER      REFERENCES usuario (id_usuario) ON DELETE SET NULL,
  usuario_nombre    VARCHAR(80),
  accion            accion_bitacora NOT NULL,
  detalle           VARCHAR(255) NOT NULL,
  tabla_afectada    VARCHAR(40),
  registro_afectado VARCHAR(40)
);
COMMENT ON TABLE  bitacora         IS 'Registro de todo lo que se hizo. Nadie modifica ni borra: solo se inserta (RN-26).';
COMMENT ON COLUMN bitacora.detalle IS 'Texto con el qué: por ejemplo "RD$ 180 en la cuenta F-0103".';
