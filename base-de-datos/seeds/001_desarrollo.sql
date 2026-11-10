-- =====================================================================================
--  SIGA-DP v2 · Semilla 001 — Datos de desarrollo
-- =====================================================================================
--
--  ⚠  ESTOS SON DATOS DE DESARROLLO, NO DATOS DEL NEGOCIO  ⚠
--
--  El plan (regla de oro 2) exige que no haya ni un dato de ejemplo dentro del
--  código de la aplicación. Los datos mínimos para poder trabajar viven aquí, en
--  un archivo separado y marcado. Se carga con `npm run base:semilla`.
--
--  Qué deja
--    · Un gerente con su cuenta de acceso (usuario y clave documentados abajo).
--    · Una zona y una mesa.
--    · Una categoría, una estación, una unidad de medida y un punto de acceso.
--    · Dos productos (provisionales: el gerente los reemplaza en la Fase 4).
--    · Los parámetros fiscales y las secuencias de comprobantes, que las
--      funciones de la base necesitan para poder calcular el impuesto.
--
--  Qué NO deja, a propósito
--    · Nada de operación: ni pedidos, ni cuentas, ni comprobantes, ni propinas.
--      Eso lo crean las pruebas y el uso real.
--    · La matriz de permisos (rol_permiso): no va aquí. Vive en la migración 011,
--      porque es parte del modelo del sistema y la aprobó el dueño (no es un dato
--      de ejemplo).
--
--  Credenciales de desarrollo
--    usuario: gerente        clave: gerente
--    (la clave se guarda cifrada con scrypt; el texto plano solo está aquí)
--
--  Esta semilla es idempotente: se puede volver a aplicar sin duplicar filas.
-- =====================================================================================

-- Así queda registrado en la bitácora quién escribió estas filas.
SET app.usuario = 'semilla';


-- =====================================================================================
--  1. Parámetros fiscales y secuencias de comprobantes
-- =====================================================================================
--  fn_emitir_comprobante lee la tasa de aquí y toma el número de estas
--  secuencias. Sin estas filas, emitir un comprobante falla.

INSERT INTO parametro (nombre_empresa, rnc, direccion, telefono, tasa_impuesto, cuenta_pagos)
SELECT 'Asadero Doña Pula (desarrollo)', '131-45678-9', 'Dirección de desarrollo', '(809) 000-0000',
       18.00, NULL
 WHERE NOT EXISTS (SELECT 1 FROM parametro);

-- Tasa de cambio para cobrar en PayPal (cuántos pesos vale un dólar).
-- DATO DE DESARROLLO: cámbiala por la tasa real del negocio. La cuenta y el
-- corte de caja siguen en pesos; esta tasa solo se usa al hablar con PayPal.
UPDATE parametro SET tasa_cambio_usd = 60.00 WHERE tasa_cambio_usd IS NULL;

INSERT INTO secuencia_ncf (tipo, ultimo_numero, siguiente_numero) VALUES
  ('B01', 0, 1),
  ('B02', 0, 1)
ON CONFLICT (tipo) DO NOTHING;


-- =====================================================================================
--  2. Salón: una zona y una mesa
-- =====================================================================================

INSERT INTO zona (nombre, tipo_ambiente) VALUES ('Salón (desarrollo)', 'Salón')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO mesa (numero, id_zona, capacidad)
SELECT 1, z.id_zona, 4 FROM zona z WHERE z.nombre = 'Salón (desarrollo)'
ON CONFLICT (numero) DO NOTHING;


-- =====================================================================================
--  3. Catálogos mínimos
-- =====================================================================================

INSERT INTO estacion (nombre) VALUES ('Cocina') ON CONFLICT (nombre) DO NOTHING;

INSERT INTO categoria (nombre) VALUES ('Platos (desarrollo)') ON CONFLICT (nombre) DO NOTHING;

INSERT INTO unidad_medida (nombre, abreviatura) VALUES ('Unidad', 'und')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO punto_acceso (nombre, es_almacen) VALUES ('Almacén', TRUE)
ON CONFLICT (nombre) DO NOTHING;


-- =====================================================================================
--  4. El gerente y su cuenta de acceso
-- =====================================================================================
--  La clave_hash la escribe la herramienta (servidor/herramientas/semilla.js), que
--  la cifra con scrypt antes de mandar este archivo. En este archivo nunca hay una
--  clave en texto plano ni un hash falso.

INSERT INTO empleado (cedula, nombre, telefono, id_rol)
SELECT '000-0000001-1', 'Gerente de desarrollo', NULL, r.id_rol
  FROM rol r WHERE r.codigo = 'gerente'
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO usuario (usuario, clave_hash, id_empleado)
SELECT 'gerente', '{{CLAVE_HASH}}', e.id_empleado
  FROM empleado e WHERE e.cedula = '000-0000001-1'
ON CONFLICT (usuario) DO NOTHING;


-- =====================================================================================
--  5. Dos productos provisionales
-- =====================================================================================
--  Nombres y precios provisionales, solo para poder probar el flujo de pedidos.
--  El gerente los reemplaza por el menú real en la Fase 4.

INSERT INTO producto (nombre, id_categoria, id_estacion, precio)
SELECT p.nombre, c.id_categoria, e.id_estacion, p.precio
  FROM (VALUES
    ('Producto de desarrollo A', 350.00),
    ('Producto de desarrollo B', 150.00)
  ) AS p(nombre, precio)
  CROSS JOIN categoria c
  CROSS JOIN estacion  e
 WHERE c.nombre = 'Platos (desarrollo)'
   AND e.nombre = 'Cocina'
ON CONFLICT (nombre) DO NOTHING;


RESET app.usuario;
