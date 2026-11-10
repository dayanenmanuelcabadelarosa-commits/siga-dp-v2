# SIGA-DP v2 — Plan de reconstrucción por fases

> Documento de instrucciones para el desarrollador y para la IA que trabajará el
> proyecto · 18 de octubre de 2026
>
> Transcrito desde el PDF original *"SIGA-DP v2 — Plan de reconstrucción por
> fases"*. Este archivo es el contrato de trabajo.

---

## 1. Propósito de este documento

El proyecto SIGA-DP (sistema de gestión del Asadero Doña Pula) nació como un
prototipo con datos de ejemplo. Una IA empezó a convertirlo en un sistema
funcional sobre ese mismo prototipo, y el resultado es un código donde muchas
pantallas fingen guardar, las APIs fallan y los módulos no funcionan de verdad.
La auditoría técnica lo confirma: la arquitectura es buena, pero hay un patrón
crítico en el que las pantallas muestran "éxito" sin llamar nunca al servidor.

**Decisión:** no seguir parchando el prototipo. Se crea una carpeta nueva y
limpia (`siga-dp-v2`) y el sistema se construye desde cero, por fases, donde cada
fase se prueba y se da por terminada antes de pasar a la siguiente. El prototipo
viejo queda únicamente como material de consulta (solo lectura).

Este documento es el contrato de trabajo. Quien lo lea (persona o IA) debe
seguirlo al pie de la letra.

---

## 2. Qué se conserva y qué se descarta del prototipo

### Se conserva (como referencia, copiando con criterio)

- El modelo de datos y el script `siga_dp_postgresql.sql`, aplicando las
  correcciones de la auditoría (sección 7).
- Las reglas de negocio **RN-01 a RN-26**, ya implementadas como constraints y
  triggers. Son el activo más valioso.
- La estructura general: React + Vite + TypeScript en el frontend, Express +
  PostgreSQL en el backend, API centralizada.
- Las pantallas que ya manejan bien los errores (`PantallaLogin.tsx`,
  `PantallaComprobanteFiscal.tsx`) y el patrón vigente en `useEffect` como
  modelo de buenas prácticas.
- La parametrización de consultas (`$1`, `$2`), que evita SQL injection.

### Se descarta

- Todos los datos de ejemplo (mocks, fixtures, valores hardcodeados) en el
  código de la aplicación.
- Todo estado local que "simula" guardar (`actualizarX` sin llamada a la API).
- Fechas, IDs, mesas y minutos hardcodeados (por ejemplo `fecha: "2026-10-07"`,
  `useState("5")` en propinas, `minutosEstimados` fijo en 5).
- El código del asistente de IA y de integraciones externas tal como está: se
  rehace en su propia fase, al final, cuando la base ya funciona.

---

## 3. Reglas de oro (obligatorias para la IA)

1. **Nada se simula.** Si una pantalla muestra "guardado", es porque el servidor
   respondió con éxito y el dato quedó en PostgreSQL. Está prohibido actualizar
   solo el estado local.
2. **Cero datos de ejemplo en el código.** Los datos iniciales viven únicamente
   en un script de seed separado, mínimo y marcado como datos de desarrollo.
3. **Una fase a la vez.** No se empieza la fase N+1 hasta que la fase N cumple
   todos sus criterios de salida.
4. **Cada funcionalidad nace con su prueba.** Sin prueba que pase, la tarea no
   está terminada.
5. **La base de datos es la fuente única de verdad.** Totales, secuencias
   fiscales y reglas de negocio se calculan en PostgreSQL (`fn_total_cuenta`,
   triggers), no se duplican en JavaScript.
6. **Seguridad desde el primer endpoint, no al final:** autenticación,
   autorización por rol, validación de entrada y manejo de errores van incluidos
   en cada ruta.
7. **Todo error se muestra al usuario.** Todo `try` tiene su `catch`; todo
   formulario tiene estado de carga y bloquea el doble clic.
8. **Si algo no está claro, la IA pregunta antes de inventar.** Está prohibido
   suponer reglas de negocio.
9. **Cambios pequeños y verificables.** Un commit por tarea, con mensaje claro, y
   el proyecto debe compilar y pasar las pruebas en cada commit.
10. **Se informa con honestidad.** Al terminar una tarea, la IA reporta qué probó
    y qué quedó pendiente. No se declara "listo" algo que no se ejecutó.

---

## 4. Stack y estructura de la carpeta nueva

**Stack:** React + Vite + TypeScript (frontend), Node.js + Express (backend),
PostgreSQL (base de datos). Se mantiene el stack del prototipo para reutilizar lo
que sirve.

**Herramientas de calidad que se agregan desde el día uno:**

- Validación de entrada: **Zod** en cada ruta del backend.
- Pruebas del backend: **Vitest o Jest + Supertest**, contra una base de datos de
  prueba real (no mocks de la base).
- Pruebas del frontend: **Vitest + Testing Library**.
- Pruebas de extremo a extremo: **Playwright** para los flujos críticos.
- Seguridad: **helmet**, límite de JSON, **rate limiting**, **asyncHandler** para
  rutas async.
- Calidad: **ESLint**, **TypeScript en modo estricto**, sin `any`.

**Estructura propuesta:**

```
siga-dp-v2/
├── README.md                 # cómo instalar, correr y probar
├── docs/
│   ├── reglas-de-negocio.md  # RN-01 a RN-28 explicadas
│   ├── plan-por-fases.md     # este documento
│   └── progreso.md           # bitácora de avance por fase
├── base-de-datos/
│   ├── migraciones/          # un archivo SQL numerado por cambio
│   └── seeds/                # datos mínimos solo para desarrollo
├── servidor/
│   ├── src/
│   │   ├── app.js            # helmet, límites, asyncHandler, errores
│   │   ├── acceso/           # login, sesión, roles
│   │   ├── rutas/            # una por módulo
│   │   ├── validaciones/     # esquemas Zod
│   │   └── db/               # conexión y transacciones
│   └── pruebas/
├── cliente/
│   ├── src/
│   │   ├── api/              # cliente HTTP único y tipado
│   │   ├── paginas/
│   │   ├── componentes/
│   │   └── hooks/
│   └── pruebas/
└── e2e/                      # pruebas Playwright
```

---

## 5. Cómo se trabaja cada tarea (ciclo obligatorio)

Para cada funcionalidad, la IA sigue estos pasos **en orden**:

1. Leer la regla de negocio y los criterios de la fase.
2. Escribir la prueba primero (o junto con el código) que describe el
   comportamiento esperado.
3. Implementar la ruta del servidor (con validación, rol y transacción si toca
   varias tablas).
4. Implementar la pantalla conectada a esa ruta real, con estados de carga, error
   y éxito.
5. Ejecutar las pruebas y la aplicación, y verificar manualmente el flujo
   completo.
6. Comprobar la persistencia: crear el dato, recargar la página y confirmar que
   sigue ahí.
7. Registrar en `docs/progreso.md` qué se hizo, qué se probó y qué falta.

### Definición de "terminado" para cualquier tarea

- El dato se guarda en PostgreSQL y sobrevive a recargar la página.
- La ruta valida la entrada, verifica el rol y maneja errores.
- El usuario ve mensajes claros ante éxito y ante fallo.
- El botón se deshabilita mientras se procesa (sin registros duplicados).
- Hay pruebas automáticas que pasan.
- No existe ningún dato de ejemplo ni valor hardcodeado.

---

## 6. Plan por fases

Cada fase tiene un objetivo, un alcance y criterios de salida. No se avanza sin
cumplirlos.

### Fase 0 — Preparación del terreno

**Objetivo:** tener una base limpia y reproducible.

- Crear la carpeta `siga-dp-v2` y el repositorio Git. Copiar el proyecto viejo a
  una carpeta aparte `siga-dp-prototipo` como solo lectura.
- Configurar el entorno: Node, PostgreSQL local, variables en `.env` (con un
  `.env.example`), scripts `npm run dev`, `npm test`, `npm run lint`.
- Escribir `docs/reglas-de-negocio.md` extrayendo las RN-01 a RN-26 del script
  SQL.
- Configurar ESLint, TypeScript estricto y el flujo de pruebas.

**Criterio de salida:** un comando levanta servidor y cliente vacíos, las
pruebas de ejemplo corren y el README explica cómo arrancar desde cero en otra
computadora.

### Fase 1 — Base de datos sólida

**Objetivo:** el esquema correcto, versionado y probado.

- Convertir el script SQL en migraciones numeradas.
- Aplicar las correcciones de la auditoría (sección 7).
- Crear un seed mínimo: un usuario gerente, un par de productos y una mesa, solo
  para desarrollo.
- Probar las reglas de negocio directamente en SQL: cada constraint y trigger
  debe tener una prueba que intente violarlo y falle como se espera.

**Criterio de salida:** la base se crea desde cero con un comando, las
migraciones se aplican sin error y las reglas RN-01 a RN-26 tienen pruebas.

### Fase 2 — Núcleo del servidor

**Objetivo:** un backend seguro antes de agregar módulos.

- `app.js` con helmet, `express.json({ limit: "100kb" })`, CORS configurado,
  `asyncHandler` y manejador global de errores con respuestas consistentes (un
  único formato de respuesta).
- Autenticación: login, sesión con token solo en el header `Authorization`
  (nunca por query string), bloqueo tras intentos fallidos y rate limiting.
- Middleware de autorización por rol reutilizable.
- Capa de validación con Zod y utilidad de transacciones.
- Ruta de salud mínima que no exponga información interna.

**Criterio de salida:** pruebas que demuestran que sin token se responde 401, con
rol incorrecto 403, con JSON enorme 413, con datos inválidos 400, y que un error
async no deja la petición colgada.

### Fase 3 — Cliente base

**Objetivo:** la estructura del frontend lista para conectar módulos.

- Cliente HTTP único y tipado en `cliente/src/api/`, con manejo central de
  errores y expiración de sesión.
- Pantalla de login real conectada a la API, rutas protegidas por rol y diseño
  base.
- Componentes reutilizables: formulario con estado de carga, mensajes de error y
  éxito, tabla.

**Criterio de salida:** se puede iniciar sesión con el usuario del seed, ver solo
las pantallas de su rol y cerrar sesión; hay pruebas de los componentes base.

### Fase 4 — Módulos de gestión (uno por uno)

Cada módulo es una mini-fase con su propio ciclo completo (sección 5). El orden
propuesto va de lo más simple y base a lo más complejo:

1. **Personal y usuarios** (gerencia): crear, editar, dar de baja, desbloquear,
   cambio de clave; transacción empleado + usuario.
2. **Productos y catálogo** (gerencia): crear, editar, disponibilidad.
3. **Mesas y reservas** (anfitrión): crear, cancelar, abrir reservas; marcar mesa
   ocupada.
4. **Inventario**: insumos, proveedores, movimientos (solo roles autorizados).

**Criterio de salida de cada módulo:** el flujo completo funciona en el
navegador contra la base real, sobrevive a recargar, tiene pruebas de API y de
interfaz, y los permisos por rol están verificados.

### Fase 5 — Operación del restaurante

**Objetivo:** el ciclo diario del servicio.

1. Toma de pedido (mesero) y seguimiento.
2. Cocina / estaciones: comandas, reportar agotado, reposición.
3. Propinas: la mesa se elige explícitamente, sin valor por defecto.

**Criterio de salida:** un pedido recorre todo el camino mesero → cocina → listo
sin pérdida de datos.

### Fase 6 — Caja y fiscalidad (la fase más delicada)

**Objetivo:** dinero y comprobantes correctos.

1. Cuenta y detalle de cuenta: los totales salen de `fn_total_cuenta` de
   PostgreSQL, sin recalcular en JS.
2. Descuentos y cortesías: solo roles autorizados, con tope máximo y transacción;
   todo queda en la bitácora.
3. Dividir cuenta por persona.
4. Cobro: un mesero no puede cobrar su propia cuenta.
5. Comprobantes fiscales (NCF): un solo comprobante por cuenta (índice único),
   anulación solo por rol autorizado, fecha real del servidor.
6. Corte de caja: cierre solo por rol autorizado, con totales verificados contra
   los pagos.

**Criterio de salida:** pruebas que comparan los totales de la API con los de la
base, que prueban el rechazo de un segundo comprobante para la misma cuenta, y
que cubren cada permiso por rol.

### Fase 7 — Reportes y bitácora

- Reportes del gerente (ventas, propinas, inventario, horas trabajadas).
- Revisar el cálculo de horas del catálogo, donde el `/ 10` del prototipo parece
  un error: **primero aclarar la fórmula correcta con el dueño del negocio** y
  después implementarla con prueba.
- Consulta de la bitácora de auditoría.

### Fase 8 — Integraciones y asistente de IA

Solo cuando todo lo anterior funciona.

- Diagnosticar por qué fallaron las APIs externas (claves, URL, permisos, formato
  de respuesta) con pruebas aisladas de cada integración.
- PayPal (si se mantiene), con pruebas en modo sandbox.
- Asistente de IA: tiempos estimados reales tomados de la tabla de productos o
  estaciones, nunca fijos; manejo de errores cuando la API externa no responde.

### Fase 9 — Pruebas de extremo a extremo y puesta en producción

- Flujos Playwright: abrir mesa → pedido → cocina → cuenta → cobro → comprobante
  → corte de caja.
- Pruebas con volumen de datos razonable para comprobar el rendimiento de los
  índices.
- Revisión de seguridad final, respaldos de la base y guía de despliegue.

**Criterio de salida:** un día simulado completo de operación sin un solo error y
sin ningún dato falso en pantalla.

---

## 7. Correcciones de la auditoría que se incorporan desde el inicio

### Base de datos

- Ajustar `ck_pedido_cierre`: `cerrado_en` solo es obligatorio para `Cerrado` y
  `Anulado`, no para `Enviado`.
- Activar `trg_auditar_descuento` también en `UPDATE` y `DELETE`.
- Crear `UNIQUE INDEX uq_comprobante_por_cuenta ON comprobante(id_cuenta)` y hacer
  que `fn_emitir_comprobante` verifique si la cuenta ya tiene comprobante.
- Crear índices en columnas de estado y fecha: `pedido.estado`, `cuenta.estado`,
  `linea_pedido.estado`, `linea_comanda.estado`, `reserva.estado`,
  `comprobante.estado`, `pago.forma_pago`, `bitacora.accion`,
  `bitacora.tabla_afectada`, `pedido.abierto_en`, `cuenta.abierta_en`,
  `pago.pagado_en`, `pago_paypal.estado`.
- Evaluar guardar en la bitácora solo las columnas relevantes en lugar de
  `to_jsonb(NEW)` completo.

### Servidor

- `asyncHandler` en todas las rutas async.
- Eliminar el token por query string.
- `helmet`, límite de JSON de 100 kb y rate limiting en `/api/acceso/entrar`.
- Verificación de rol en: descuentos, anular comprobantes, cerrar corte,
  parámetros del sistema, crear personal, cambiar claves, movimientos de
  inventario y cobro.
- Transacciones en operaciones multi-tabla (descuentos, edición de personal).
- Validación completa de body: reservas (personas, hora, teléfono, mesa), tope de
  descuentos, parámetros sin vacíos, mínimo de insumos mayor o igual a 0, formato
  de teléfono, hora y email.
- Un formato de respuesta único para toda la API.
- `/api/salud` sin información interna sensible.

### Cliente

- Todas las pantallas de gestión conectadas a la API real: Reservas, Personal,
  Productos, Propinas, Detalle de cuenta, Dividir cuenta, Corte de caja y
  Estación de cocina.
- `catch` visible en acciones como `crearCuenta`, estados de carga en todos los
  formularios, y cero valores hardcodeados.

---

## 8. Matriz de permisos (a confirmar con el dueño)

Antes de la Fase 2 hay que fijar qué rol puede hacer qué. Propuesta inicial para
validar:

> La IA debe usar esta matriz como punto de partida y pedir confirmación ante
> cualquier duda; la versión final se guarda en `docs/reglas-de-negocio.md`.

| Acción | Gerente | Caja | Mesero | Anfitrión | Cocina |
|---|---|---|---|---|---|
| Administrar personal y parámetros | Sí | No | No | No | No |
| Productos y catálogo | Sí | No | No | No | No |
| Reservas y mesas | Sí | No | No | Sí | No |
| Tomar pedidos | Sí | No | Sí | No | No |
| Cocina / estaciones | Sí | No | No | No | Sí |
| Descuentos, cortesías y anulaciones | Sí | Con tope | No | No | No |
| Cobrar cuentas | Sí | Sí | No | No | No |
| Corte de caja | Sí | Sí | No | No | No |
| Movimientos de inventario | Sí | No | No | No | Limitado |

---

## 9. Prompt de arranque para la IA

Copiar y pegar al iniciar la sesión de trabajo:

> Vas a construir el proyecto SIGA-DP v2 desde cero en la carpeta `siga-dp-v2`.
> Antes de escribir código, lee `docs/plan-por-fases.md` y
> `docs/reglas-de-negocio.md`. El prototipo anterior está en
> `siga-dp-prototipo` solo para consulta: no lo modifiques ni copies datos de
> ejemplo.
>
> Trabajamos por fases. Hoy trabajas únicamente en la **Fase [N]**. Reglas: nada
> se simula, cero datos de ejemplo o valores hardcodeados, cada funcionalidad
> lleva su prueba, y toda pantalla llama a la API real y persiste en PostgreSQL.
> Si algo no está claro, pregúntame antes de suponer.
>
> Al terminar cada tarea: ejecuta las pruebas, verifica que el dato sobrevive a
> recargar la página, actualiza `docs/progreso.md` y dime exactamente qué probaste
> y qué quedó pendiente. No pases a la siguiente fase hasta que yo confirme que
> se cumplieron los criterios de salida.

---

## 10. Cómo revisar el trabajo de la IA (para el dueño del proyecto)

No basta con que la IA diga "ya quedó". En cada entrega, comprobar:

1. ¿Corre `npm test` y pasa todo?
2. ¿Creo un dato, recargo la página y sigue ahí?
3. ¿Si apago el servidor, la pantalla muestra un error claro en lugar de
   "éxito"?
4. ¿Un usuario sin permiso recibe rechazo al intentar la acción?
5. ¿Hay algún dato de ejemplo o valor fijo en el código? (buscar fechas, IDs y
   números sueltos)
6. ¿El `docs/progreso.md` coincide con lo que realmente funciona?

Si alguna respuesta es "no", la tarea no está terminada.

---

## 11. Resumen en una frase

Carpeta nueva, base de datos primero, servidor seguro después, pantallas
conectadas de verdad, una fase a la vez y nada se da por hecho sin una prueba que
pase.
