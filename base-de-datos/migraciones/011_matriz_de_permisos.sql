-- =====================================================================================
--  SIGA-DP v2 · Migración 011 — La matriz de permisos
-- =====================================================================================
--
--  Qué hace
--    Llena la tabla `rol_permiso`: qué puede hacer cada uno de los 8 roles con cada
--    una de las 27 operaciones del sistema. Hasta ahora esa tabla estaba vacía a
--    propósito, y el servidor negaba todo (regla de oro 6: se niega por defecto).
--
--  De dónde sale esta matriz
--    Del documento docs/reglas-de-negocio.md, sección 4.5. La propuso la IA a partir
--    de la matriz de 5 roles del plan (sección 8) y de la descripción que cada rol
--    tiene en la migración 008, y EL DUEÑO LA APROBÓ el 18 de octubre de 2026.
--    Ese documento es la versión oficial: si esta migración y el documento se
--    contradicen, el documento manda y hay que corregirlo con una migración nueva.
--
--  Por qué se llena entera (las 216 casillas) y no solo las que dicen "sí"
--    Porque `permitido` existe justamente para eso. Al dejar una fila en FALSE queda
--    escrito que alguien lo pensó y dijo que no; si no hubiera fila, no se sabría si
--    es un "no" decidido o un olvido. Con la matriz completa, la pregunta "¿este rol
--    puede esto?" siempre tiene una respuesta guardada.
--
--  Nota sobre el dueño
--    Tiene las 27, pero no por ser el dueño: tiene las 27 porque están escritas aquí.
--    El servidor no le da ningún permiso automático a nadie (ver
--    servidor/src/acceso/autenticacion.js, función `puede`).
-- =====================================================================================


-- =====================================================================================
--  1. Las 216 casillas, en falso
-- =====================================================================================
--  8 roles × 27 operaciones. ON CONFLICT DO NOTHING para que la migración se pueda
--  volver a aplicar sin duplicar.
-- =====================================================================================

INSERT INTO rol_permiso (id_rol, id_permiso, permitido)
SELECT r.id_rol, p.id_permiso, FALSE
  FROM rol r
 CROSS JOIN permiso p
ON CONFLICT (id_rol, id_permiso) DO NOTHING;


-- =====================================================================================
--  2. Las que sí: la matriz aprobada
-- =====================================================================================
--  Cada fila es una casilla marcada con "sí" en docs/reglas-de-negocio.md (sección
--  4.5). Están agrupadas por operación, en el mismo orden que la tabla del documento,
--  para poder comparar las dos de un vistazo.
-- =====================================================================================

WITH aprobadas (codigo_rol, codigo_permiso) AS (
  VALUES
    --                                 Dueño  Gerente  Capitán  Mesero  Anfitrión  Cocina  Cajero  Almacén
    ('dueno',     'VER_MESAS'),        --  S      S        S        S        S        —      S       —
    ('gerente',   'VER_MESAS'),
    ('capitan',   'VER_MESAS'),
    ('mesero',    'VER_MESAS'),
    ('anfitrion', 'VER_MESAS'),
    ('cajero',    'VER_MESAS'),

    ('dueno',     'ASIGNAR_MESA'),     --  S      S        S        S        S        —      —       —
    ('gerente',   'ASIGNAR_MESA'),
    ('capitan',   'ASIGNAR_MESA'),
    ('mesero',    'ASIGNAR_MESA'),
    ('anfitrion', 'ASIGNAR_MESA'),

    ('dueno',     'GESTIONAR_RESERVA'),--  S      S        —        —        S        —      —       —
    ('gerente',   'GESTIONAR_RESERVA'),
    ('anfitrion', 'GESTIONAR_RESERVA'),

    ('dueno',     'CAPTURAR_PEDIDO'),  --  S      S        S        S        —        —      —       —
    ('gerente',   'CAPTURAR_PEDIDO'),
    ('capitan',   'CAPTURAR_PEDIDO'),
    ('mesero',    'CAPTURAR_PEDIDO'),

    ('dueno',      'VER_DISPONIBILIDAD'),  -- S   S        S        S        S        S      S       —
    ('gerente',    'VER_DISPONIBILIDAD'),
    ('capitan',    'VER_DISPONIBILIDAD'),
    ('mesero',     'VER_DISPONIBILIDAD'),
    ('anfitrion',  'VER_DISPONIBILIDAD'),
    ('cocina',     'VER_DISPONIBILIDAD'),
    ('cajero',     'VER_DISPONIBILIDAD'),

    ('dueno',     'VER_ASISTENTE'),    --  S      S        —        —        —        —      —       —
    ('gerente',   'VER_ASISTENTE'),

    ('dueno',     'CONFIRMAR_PREPARACION'),  -- S  S        —        —        —        S      —       —
    ('gerente',   'CONFIRMAR_PREPARACION'),
    ('cocina',    'CONFIRMAR_PREPARACION'),

    ('dueno',     'MARCAR_ENTREGA'),   --  S      S        S        S        —        —      —       —
    ('gerente',   'MARCAR_ENTREGA'),
    ('capitan',   'MARCAR_ENTREGA'),
    ('mesero',    'MARCAR_ENTREGA'),

    ('dueno',     'GENERAR_CUENTA'),   --  S      S        S        —        —        —      S       —
    ('gerente',   'GENERAR_CUENTA'),
    ('capitan',   'GENERAR_CUENTA'),
    ('cajero',    'GENERAR_CUENTA'),

    ('dueno',     'DIVIDIR_CUENTA'),   --  S      S        S        —        —        —      S       —
    ('gerente',   'DIVIDIR_CUENTA'),
    ('capitan',   'DIVIDIR_CUENTA'),
    ('cajero',    'DIVIDIR_CUENTA'),

    ('dueno',     'APLICAR_DESCUENTO'),--  S      S        S        —        —        —      S       —
    ('gerente',   'APLICAR_DESCUENTO'),
    ('capitan',   'APLICAR_DESCUENTO'),
    ('cajero',    'APLICAR_DESCUENTO'),

    ('dueno',     'APLICAR_CORTESIA'), --  S      S        —        —        —        —      —       —
    ('gerente',   'APLICAR_CORTESIA'),

    ('dueno',     'REGISTRAR_PAGO'),   --  S      S        —        —        —        —      S       —
    ('gerente',   'REGISTRAR_PAGO'),
    ('cajero',    'REGISTRAR_PAGO'),

    ('dueno',     'EMITIR_COMPROBANTE'),      -- S  S        —        —        —        —      S       —
    ('gerente',   'EMITIR_COMPROBANTE'),
    ('cajero',    'EMITIR_COMPROBANTE'),

    ('dueno',     'REGISTRAR_PROPINA'),--  S      S        S        S        —        —      —       —
    ('gerente',   'REGISTRAR_PROPINA'),
    ('capitan',   'REGISTRAR_PROPINA'),
    ('mesero',    'REGISTRAR_PROPINA'),

    ('dueno',     'CERRAR_PROPINAS'),  --  S      S        S        —        —        —      —       —
    ('gerente',   'CERRAR_PROPINAS'),
    ('capitan',   'CERRAR_PROPINAS'),

    ('dueno',     'REALIZAR_CORTE'),   --  S      S        —        —        —        —      S       —
    ('gerente',   'REALIZAR_CORTE'),
    ('cajero',    'REALIZAR_CORTE'),

    ('dueno',     'CONSULTAR_REPORTES'),      -- S  S        S        —        —        —      S       —
    ('gerente',   'CONSULTAR_REPORTES'),
    ('capitan',   'CONSULTAR_REPORTES'),
    ('cajero',    'CONSULTAR_REPORTES'),

    ('dueno',     'ADMINISTRAR_PRODUCTOS'),   -- S  S        —        —        —        —      —       —
    ('gerente',   'ADMINISTRAR_PRODUCTOS'),

    ('dueno',     'ADMINISTRAR_MESAS'),       -- S  S        —        —        —        —      —       —
    ('gerente',   'ADMINISTRAR_MESAS'),

    ('dueno',     'ADMINISTRAR_PROMOCIONES'), -- S  S        —        —        —        —      —       —
    ('gerente',   'ADMINISTRAR_PROMOCIONES'),

    ('dueno',     'ADMINISTRAR_PERSONAL'),    -- S  S        —        —        —        —      —       —
    ('gerente',   'ADMINISTRAR_PERSONAL'),

    ('dueno',     'ADMINISTRAR_PARAMETROS'),  -- S  S        —        —        —        —      —       —
    ('gerente',   'ADMINISTRAR_PARAMETROS'),

    ('dueno',     'CONSULTAR_BITACORA'),      -- S  S        —        —        —        —      —       —
    ('gerente',   'CONSULTAR_BITACORA'),

    ('dueno',     'VER_EXISTENCIAS'),         -- S  S        —        —        —        S      —       S
    ('gerente',   'VER_EXISTENCIAS'),
    ('cocina',    'VER_EXISTENCIAS'),
    ('almacen',   'VER_EXISTENCIAS'),

    ('dueno',     'MOVER_INVENTARIO'),        -- S  S        —        —        —        —      —       S
    ('gerente',   'MOVER_INVENTARIO'),
    ('almacen',   'MOVER_INVENTARIO'),

    ('dueno',     'ADMINISTRAR_INSUMOS'),     -- S  S        —        —        —        —      —       S
    ('gerente',   'ADMINISTRAR_INSUMOS'),
    ('almacen',   'ADMINISTRAR_INSUMOS')
)
UPDATE rol_permiso rp
   SET permitido = TRUE
  FROM aprobadas a
  JOIN rol     r ON r.codigo = a.codigo_rol
  JOIN permiso p ON p.codigo = a.codigo_permiso
 WHERE rp.id_rol     = r.id_rol
   AND rp.id_permiso = p.id_permiso;

COMMENT ON TABLE rol_permiso IS
  'Matriz de permisos: qué rol puede hacer qué operación. La aprobó el dueño; la versión oficial está en docs/reglas-de-negocio.md, sección 4.5.';
