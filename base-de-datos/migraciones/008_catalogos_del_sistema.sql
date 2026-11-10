-- =====================================================================================
--  SIGA-DP v2 · Migración 008 — Catálogos del sistema: roles y permisos
-- =====================================================================================
--  Qué hace
--    Carga los ocho roles del local y las operaciones que el sistema controla.
--    Son datos del MODELO del sistema (capítulos 22.2 y 22.3 del diseño), no
--    datos de ejemplo: sin ellos el sistema no puede autorizar nada, así que
--    viven en una migración y no en el seed de desarrollo.
--
--  AVISO — faltan una operación por aclarar
--    El script del profesor titula su lista "Las 28 operaciones", y el comentario
--    de la tabla permiso dice "28 en total". Pero la lista que trae tiene 27.
--    Aquí se copian las 27 que existen de verdad. NO se inventa la que falta:
--    hay que preguntarle al dueño cuál es. Queda anotado en
--    docs/reglas-de-negocio.md (sección 5) mientras tanto.
--
--  Qué NO hace (a propósito)
--    NO carga la matriz rol_permiso. Qué rol puede hacer qué es una decisión de
--    negocio que el plan (sección 8) deja "a confirmar con el dueño" antes de la
--    Fase 2. La tabla queda creada y vacía a propósito, y la versión confirmada
--    entrará en su propia migración.
--
--    Consecuencia mientras tanto: cualquier comprobación de permisos dará
--    "no permitido" para todos los roles. Es lo correcto: es mejor que diga que
--    no, a que deje pasar algo por un permiso inventado.
--
--  De qué depende
--    002_tablas.sql (tablas rol y permiso)
--
--  Origen
--    Valores copiados de "siga_dp_postgresql.sql" (el script del profesor),
--    sección 7.1 y 7.2. El prototipo está en siga-dp-prototipo/ y es de solo
--    lectura.
--
--  Esta migración es idempotente: se puede volver a aplicar sin duplicar filas.
-- =====================================================================================


-- =====================================================================================
--  1. Los ocho roles
-- =====================================================================================
--  El plan (sección 8) habla de cinco roles en su matriz de permisos: Gerente,
--  Caja, Mesero, Anfitrión y Cocina. El diseño del profesor tiene ocho. Se
--  conservan los ocho, que es un superconjunto, y quedan así relacionados:
--
--    dueño    → el dueño del negocio (nivel 5). No aparece en la matriz del plan.
--    gerente  → Gerente
--    capitan  → no aparece en la matriz del plan (cubre al mesero).
--    mesero   → Mesero
--    anfitrion→ Anfitrión
--    cocina   → Cocina
--    cajero   → Caja
--    almacen  → no aparece en la matriz del plan (inventario).
--
--  Decisión pendiente: confirmar con el dueño si se trabaja con los ocho roles o
--  con los cinco de la matriz.

INSERT INTO rol (codigo, nombre, nivel, descripcion) VALUES
  ('dueno',     'Dueño',                    5, 'Dueño del asadero. Aprueba cortesías y reabre cortes de caja.'),
  ('gerente',   'Gerente',                  4, 'Encargado del local. Administra catálogo, personal y parámetros.'),
  ('capitan',   'Capitán / Supervisor',     3, 'Cubre al mesero, concilia propinas y autoriza descuentos.'),
  ('mesero',    'Mesero',                   2, 'Atiende mesas, toma pedidos y registra sus propinas.'),
  ('anfitrion', 'Anfitrión',                2, 'Recibe al cliente y lleva la agenda de reservas.'),
  ('cocina',    'Cocina / Parrilla / Barra',2, 'Prepara las comandas y reporta productos agotados.'),
  ('cajero',    'Cajero',                   1, 'Genera cuentas, cobra y emite el comprobante fiscal.'),
  ('almacen',   'Almacén',                  1, 'Registra entradas, salidas y ajustes de insumos.')
ON CONFLICT (codigo) DO NOTHING;


-- =====================================================================================
--  2. Las operaciones que el sistema controla
-- =====================================================================================
--  Son 27. El script del profesor dice 28, pero su lista tiene 27 (ver el aviso
--  del encabezado). La que falta no se inventa.
--
--  El código de cada permiso es el que usará el servidor en la Fase 2 para
--  preguntar "¿este rol puede hacer esto?".

INSERT INTO permiso (codigo, descripcion, modulo) VALUES
  ('VER_MESAS',               'Ver el estado de las mesas',             'M02'),
  ('ASIGNAR_MESA',            'Asignar una mesa',                       'M02'),
  ('GESTIONAR_RESERVA',       'Registrar y consultar una reserva',      'M02'),
  ('CAPTURAR_PEDIDO',         'Capturar el pedido',                     'M01'),
  ('VER_DISPONIBILIDAD',      'Consultar disponibilidad y promociones','M03'),
  ('VER_ASISTENTE',           'Consultar el asistente inteligente',     'M04'),
  ('CONFIRMAR_PREPARACION',   'Confirmar la preparación',               'M01'),
  ('MARCAR_ENTREGA',          'Marcar la entrega',                      'M01'),
  ('GENERAR_CUENTA',          'Generar la cuenta',                      'M05'),
  ('DIVIDIR_CUENTA',          'Dividir la cuenta',                      'M05'),
  ('APLICAR_DESCUENTO',       'Aplicar un descuento autorizado',        'M05'),
  ('APLICAR_CORTESIA',        'Aplicar una cortesía',                   'M05'),
  ('REGISTRAR_PAGO',          'Registrar el pago',                      'M05'),
  ('EMITIR_COMPROBANTE',      'Emitir el comprobante fiscal',           'M05'),
  ('REGISTRAR_PROPINA',       'Registrar la propina',                   'M06'),
  ('CERRAR_PROPINAS',         'Cerrar las propinas del día',            'M06'),
  ('REALIZAR_CORTE',          'Realizar el corte de caja',              'M06'),
  ('CONSULTAR_REPORTES',      'Consultar los reportes de venta',        'M07'),
  ('ADMINISTRAR_PRODUCTOS',   'Administrar productos y precios',        'M07'),
  ('ADMINISTRAR_MESAS',       'Administrar mesas y zonas',              'M07'),
  ('ADMINISTRAR_PROMOCIONES', 'Administrar promociones',                'M07'),
  ('ADMINISTRAR_PERSONAL',    'Administrar personal, roles y permisos', 'M07'),
  ('ADMINISTRAR_PARAMETROS',  'Administrar los parámetros fiscales',    'M07'),
  ('CONSULTAR_BITACORA',      'Consultar la bitácora de auditoría',     'M07'),
  ('VER_EXISTENCIAS',         'Ver las existencias de insumos',         'M08'),
  ('MOVER_INVENTARIO',        'Registrar entradas, salidas y ajustes',  'M08'),
  ('ADMINISTRAR_INSUMOS',     'Administrar insumos y proveedores',      'M08')
ON CONFLICT (codigo) DO NOTHING;


-- =====================================================================================
--  3. La matriz, pendiente
-- =====================================================================================
--  No se inserta nada en rol_permiso. Cuando el dueño confirme la matriz
--  (docs/reglas-de-negocio.md), entra en una migración nueva, por ejemplo:
--
--    INSERT INTO rol_permiso (id_rol, id_permiso, permitido)
--    SELECT r.id_rol, p.id_permiso, FALSE FROM rol r CROSS JOIN permiso p
--    ON CONFLICT (id_rol, id_permiso) DO NOTHING;
--
--    UPDATE rol_permiso SET permitido = TRUE
--     WHERE id_rol IN (SELECT id_rol FROM rol WHERE codigo IN ('dueno','gerente'));
--
--    ... y así por cada rol.
