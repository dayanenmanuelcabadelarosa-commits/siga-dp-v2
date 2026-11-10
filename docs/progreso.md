# Bitácora de avance — SIGA-DP v2

Este archivo se actualiza **al terminar cada tarea** (paso 7 del ciclo de trabajo,
sección 5 del plan). Debe reflejar lo que realmente funciona, no lo que se
pretendía hacer.

Formato de cada entrada:

- **Qué se hizo**
- **Qué se probó** (con el resultado real)
- **Qué queda pendiente**
- **Cómo comprobarlo**

---

## Fase 0 — Preparación del terreno

**Estado:** cerrada. El dueño dio el visto bueno a los criterios de salida, y con
eso se pasó a la Fase 1.

### Qué se hizo

- Se creó la carpeta `siga-dp-v2` con la estructura del plan (sección 4):
  `docs/`, `base-de-datos/`, `servidor/`, `cliente/`, `e2e/`.
- Se apartó el prototipo en `siga-dp-prototipo`, **solo lectura** (165 archivos
  marcados). Se excluyeron `node_modules/`, `dist/`, `*.log` y `servidor/.env`.
  El original `siga-dp/` quedó intacto.
- Monorepo con npm workspaces: `servidor` y `cliente` como espacios de trabajo.
- Scripts en la raíz: `dev`, `dev:api`, `dev:web`, `test`, `test:api`, `test:web`,
  `lint`, `lint:fix`, `tipos`, `build`, `verificar`.
- Servidor (Fase 0, solo el armazón): `helmet`, CORS por entorno, límite de JSON
  de 100 kb, `asyncHandler`, `ErrorDeApi`, manejador global de errores y
  `GET /api/salud` sin información interna.
- Cliente: React 19 + Vite 8 + TypeScript estricto + Tailwind 4, con Vitest y
  Testing Library. La pantalla es un marcador de posición sin datos del negocio.
- ESLint en formato plano para los dos espacios de trabajo.
- Se transcribió el plan completo a `docs/plan-por-fases.md`.
- Se escribió `docs/reglas-de-negocio.md` con las 28 reglas, su entidad y dónde
  vive cada una en el prototipo.
- `.env.example` en `servidor/` y en `cliente/`, y `.gitignore` que protege los
  `.env` reales.

### Decisiones tomadas en esta fase

| Decisión | Por qué |
|---|---|
| TypeScript 6.0.3 y no 7.x | `typescript-eslint` solo admite `typescript < 6.1.0` |
| Backend en JavaScript, cliente en TypeScript | Así lo define la estructura del plan (`app.js`, `rutas/*.js`) |
| `pnpm`/`yarn` descartados | Se mantiene `npm` (workspaces), que es lo que usa el prototipo |
| `asyncHandler` se mantiene aunque Express 5 ya capture los errores async | El plan lo exige de forma explícita; queda documentado en `app.js` |
| Un solo `tsconfig.json` en el cliente en vez de referencias | Menos piezas que puedan desincronizarse; equivalente para este tamaño |

### Qué se probó

Todo ejecutado en este equipo el 18 de octubre de 2026 (Node 24.21.0,
npm 11.19.0, Windows).

| Comprobación | Comando | Resultado |
|---|---|---|
| Dependencias instaladas | `npm install` | 340 paquetes, sin errores |
| ESLint limpio | `npm run lint` | Sin avisos ni errores |
| Tipos del cliente | `npm run tipos` | `tsc --noEmit` sin errores |
| Pruebas de la API | `npm run test:api` | **8 de 8 pasan** |
| Pruebas del cliente | `npm run test:web` | **2 de 2 pasan** |
| Compilación del cliente | `npm run build` | `dist/` generado en 629 ms |
| El servidor arranca | `npm run dev` (API) | Escucha en el puerto 4000 |
| `GET /api/salud` | `curl` | `{"ok":true,"datos":{"estado":"ok"}}` |
| Ruta inexistente | `curl /api/no-existe` | `404` con `{"ok":false,"error":{"codigo":"NO_ENCONTRADO",…}}` |
| JSON roto | `curl` con `{ roto` | `400` con `codigo: "JSON_INVALIDO"` |
| Cuerpo de 110 kb | `curl` | `413` con `codigo: "CUERPO_DEMASIADO_GRANDE"` |
| Cabeceras de seguridad | `curl -i` | Helmet presente; sin `X-Powered-By` |
| El cliente arranca y sirve | Vite en el puerto 5273 | `HTTP 200` con el HTML del cliente |

**Total: 10 pruebas automáticas pasando.**

> Nota de la comprobación: el cliente se probó en el puerto **5273** y la API en
> el **4100** porque en ese momento el prototipo viejo estaba corriendo y ocupaba
> el 4000 y el 5173. Los puertos por defecto del proyecto siguen siendo 4000 y
> 5173.

**Qué NO se probó todavía:** nada de la base de datos, porque no existe. No hay
login, ni rutas de negocio, ni persistencia. Eso es la Fase 1 y la Fase 2.

### Qué queda pendiente

- **Confirmación del dueño** de los criterios de salida de la Fase 0.
- La **matriz de permisos** (sección 8 del plan) y las 11 decisiones de la
  sección 5 de `docs/reglas-de-negocio.md`. No bloquean la Fase 0, pero sí la
  Fase 2.
- `docs/reglas-de-negocio.md` marcado como **borrador**: cada objeto se
  re-verifica al convertir el script en migraciones (Fase 1).
- Nada de la base de datos está hecho todavía: `base-de-datos/migraciones/` y
  `base-de-datos/seeds/` están vacías a propósito.

### Cómo comprobarlo

```bash
npm install          # una sola vez
npm run verificar    # lint + tipos + todas las pruebas
npm run dev          # levanta la API (4000) y el cliente (5173)
```

---

## Fase 1 — Base de datos sólida

**Estado:** terminada, verificada y aprobada por el dueño. Se cerró el 18 de
octubre de 2026 y con eso se autorizó empezar la Fase 2.

### Qué se hizo

**Las migraciones** (`base-de-datos/migraciones/`, 11 archivos numerados):

| Archivo | Qué hace | Origen |
|---|---|---|
| `001_tipos_y_dominios.sql` | Los ENUM y los dominios (`dinero`, `cantidad`, `porcentaje`) | Copiado **tal cual** del script del profesor |
| `002_tablas.sql` | Las **41** tablas con sus llaves y restricciones | Copiado tal cual |
| `003_indices.sql` | Los índices del prototipo | Copiado tal cual |
| `004_disparadores.sql` | Los disparadores (auditoría, numeración, inventario, bloqueos) | Copiado tal cual |
| `005_funciones_de_negocio.sql` | Las funciones de negocio (`fn_abrir_pedido`, `fn_cobrar_cuenta`, …) | Copiado tal cual |
| `006_vistas.sql` | Las 9 vistas de consulta | Copiado tal cual |
| `007_correcciones_de_la_auditoria.sql` | Las correcciones de la sección 7 del plan | Escrito a mano |
| `008_catalogos_del_sistema.sql` | Los 8 roles y las operaciones que controla el sistema | Escrito a mano |
| `009_correcciones_de_la_fase_1.sql` | Un defecto que encontraron las pruebas | Escrito a mano |
| `010_proveedor_y_empleado_no_se_borran.sql` | Los disparadores que le faltaban a la RN-16 | Escrito a mano |
| `011_matriz_de_permisos.sql` | La matriz de permisos que aprobó el dueño | Escrito a mano |

La palabra "copiado" es literal: las migraciones 001 a 006 se extrajeron del
script del profesor **por programa**, no se reescribieron a mano, para que no se
cuelen diferencias invisibles. Cada archivo lleva en su encabezado de dónde salió.

**El control de versiones de la base:** una tabla `migracion` guarda el nombre y la
huella SHA-256 de cada archivo aplicado. Si un archivo ya aplicado cambia de
contenido, el migrador se detiene y avisa. (Se probó a propósito: ver más abajo.)

**Las herramientas** (`servidor/herramientas/`):

| Archivo | Qué hace |
|---|---|
| `comun.js` | Rutas, datos de conexión y ayudas compartidas |
| `crear-base.js` | Crea las bases desde cero, migra y carga la semilla |
| `migrar.js` | Aplica las migraciones pendientes (y `--estado` para ver en qué va) |
| `semilla.js` | Carga los datos de desarrollo, cifrando la clave del gerente |

**Comandos** (desde la raíz del proyecto):

```bash
npm run base:crear      # crea lo que falte (siga_dp_v2 y siga_dp_v2_pruebas)
npm run base:recrear    # borra y vuelve a crear desde cero
npm run base:migrar     # aplica solo las migraciones pendientes
npm run base:estado     # muestra qué migraciones están aplicadas
npm run base:semilla    # carga los datos de desarrollo
```

**La semilla de desarrollo** (`base-de-datos/seeds/001_desarrollo.sql`): un
local, la tasa de impuesto, las secuencias de comprobantes B01 y B02, una zona,
una mesa, una estación, una categoría, una unidad, un punto de acceso, un
empleado gerente con su cuenta (`gerente` / `gerente`) y dos productos
provisionales. Todo está marcado como desarrollo. **La clave del gerente no está
escrita en el archivo**: el archivo lleva la marca `{{CLAVE_HASH}}` y la
herramienta la sustituye por un hash de `scrypt` calculado en ese momento. Así no
hay ni una contraseña en texto plano ni un hash inventado a mano.

**El código del servidor que hace falta para esto:**

- `servidor/src/db/conexion.js`: el grupo de conexiones, las consultas, y
  `conTransaccion`. Los montos (`NUMERIC`) y los enteros grandes (`BIGINT`) llegan
  a JavaScript como números, no como texto.
- `servidor/src/acceso/claves.js`: cifrar y verificar contraseñas con `scrypt`.
- El "quién opera" para la bitácora se fija **dentro de la transacción** con
  `set_config('app.usuario', …, true)`. El prototipo usaba una variable del módulo,
  y eso era una carrera de verdad: con dos peticiones a la vez, la bitácora podía
  acabar atribuyendo el trabajo al usuario equivocado.

### Qué se probó

Todo ejecutado en este equipo el 18 de octubre de 2026 (Node 24.21.0, npm 11.19.0,
PostgreSQL 18.6, Windows).

| Comprobación | Comando | Resultado |
|---|---|---|
| La base se crea desde cero | `npm run base:crear` | Crea las 2 bases y aplica las 11 migraciones, sin errores |
| Recrear de cero | `npm run base:recrear` | Borra y vuelve a crear; 11 migraciones aplicadas |
| Las migraciones quedan al día | `npm run base:estado` | 9 aplicadas, 0 faltantes |
| El guardián de migraciones | Editar una migración ya aplicada y volver a migrar | Se **detiene** con "cambió después de haberse aplicado" (probado a propósito, 2 veces) |
| La semilla carga | `npm run base:semilla` | 1 archivo, con la clave del gerente cifrada |
| Reglas de negocio | `npm run test:api` | **72 de 72** en `reglas-de-negocio.integracion.test.js` |
| Funciones de negocio | `npm run test:api` | **30 de 30** en `funciones-de-negocio.integracion.test.js` |
| El esquema completo | `npm run test:api` | **9 de 9** en `esquema.integracion.test.js` |
| Esqueleto de la Fase 0 | `npm run test:api` | **8 de 8** (siguen pasando) |
| Pruebas del cliente | `npm run test:web` | **2 de 2** |
| Las pruebas preparan su propia base | Borrar `siga_dp_v2_pruebas` y correr `npm run test:api` | La crea, la migra y la siembra sola: **119 pasan** |
| Todo junto | `npm run verificar` | lint + tipos + pruebas, limpio |

**Total: 119 pruebas automáticas contra PostgreSQL de verdad. Las 119 pasan.**

> Estas cifras son las del cierre de la Fase 1. Al terminar la Fase 2 el total
> llegó a **157** (ver la sección de la Fase 2).

Cómo están escritas: cada prueba corre **dentro de una transacción que se deshace
al terminar**, así que no hace falta limpiar nada ni ordenar los datos entre
pruebas. Las que comprueban que la base rechaza algo usan un punto de guardado
(*savepoint*): intentan la operación prohibida, comprueban que falla y vuelven
atrás. **No hay ningún doble de prueba: es la base de datos de verdad.**

### Hallazgos de esta fase

1. **Un defecto que rompía el trabajo diario, encontrado por una prueba.** Las
   columnas `diferencia` de `cierre_propina` y de `corte_caja` usaban el dominio
   `dinero`, que prohíbe los negativos. Pero una diferencia de caja **es**
   negativa cuando falta dinero. O sea: el sistema solo cuadraba cuando sobraba
   plata; justo el caso que hay que dejar registrado (el faltante) era el que la
   base rechazaba. **Corregido en la migración `009`.** Lo encontró la prueba
   "calcula lo esperado sumando las propinas del día", no una revisión a ojo.
2. **La lista de permisos del prototipo no cuadra consigo misma.** El título dice
   "Las 28 operaciones" y la lista trae 27. Se cargaron las 27 que existen. **No se
   inventó la que falta**: está anotado como decisión 13.
3. **El esquema no impedía borrar un proveedor ni un empleado** (RN-16), aunque la
   regla lo prohíbe. Borrar un proveedor dejaba sus compras con `id_proveedor` en
   `NULL` (se perdía a quién se le compró) y borrar un empleado se llevaba por
   delante su cuenta de acceso. Lo encontró la prueba de la RN-16. Se reportó como
   decisión 12, **el dueño aprobó cerrar el hueco y la migración `010` agrega los
   dos disparadores**. Mientras estaba abierto, la prueba estuvo marcada con
   `it.fails` para que el hueco no se escondiera.
4. **Son 41 tablas, no 42** como decía un comentario nuestro de la propia
   migración `002`. Corregido.
5. **Los roles y permisos son parte del modelo del sistema**, no datos de ejemplo:
   sin ellos no se puede autorizar nada. Por eso viven en la migración `008` y no
   en la semilla. Anotado como decisión 16, por si el dueño prefiere otra cosa.
6. **La matriz `rol_permiso` quedó vacía a propósito**, esperando la confirmación
   del dueño (decisión 1). Entonces había una prueba que comprobaba que seguía
   vacía, para que nadie la llenara por descuido. **Ya se resolvió:** el dueño la
   aprobó y la cargó la migración `011` en la Fase 2.

### Qué NO se probó todavía

- **Nada de la API**, porque la API de negocio no existe: la Fase 2 la construye.
  Lo único que hay del servidor es el armazón de la Fase 0 y la conexión a la base.
- **Nada de navegador ni de extremo a extremo** (Playwright): eso es la Fase 9.
- **La concurrencia de verdad** (dos cajeros cobrando a la vez): las reglas están
  escritas para soportarla (bloqueos `FOR UPDATE`, índices únicos), pero no se
  probó con carga real. Eso llega con las pruebas de extremo a extremo.
- **La restauración de un respaldo**: no se hizo ni una copia de seguridad. Antes
  de la puesta en producción (Fase 9) hay que definirla y probarla.

### Qué queda pendiente

- **Aprobación del dueño.** El dueño dio el visto bueno a la Fase 1 y decidió
  cerrar el hueco de la RN-16 (migración `010`). Quedan pendientes de su decisión
  las demás de `docs/reglas-de-negocio.md` (sección 5), y antes de la Fase 2 hace
  falta sobre todo la 1 (la matriz de permisos).
- **La matriz de permisos** (decisión 1): hace falta antes de la Fase 2.
- **El archivo `.env`** tiene la clave real de PostgreSQL del equipo y un secreto
  de sesión generado. No se sube al repositorio (está en `.gitignore`).

### Cómo comprobarlo

```bash
npm install            # una sola vez
npm run base:crear     # crea las dos bases desde cero
npm run base:estado    # muestra las 11 migraciones aplicadas
npm run verificar      # lint + tipos + las 157 pruebas
```

Para mirar la base a mano (con `psql` en el PATH, o con su ruta completa):

```bash
psql -h localhost -U postgres -d siga_dp_v2 -c "SELECT nombre FROM migracion ORDER BY nombre;"
psql -h localhost -U postgres -d siga_dp_v2 -c "SELECT codigo, nombre FROM rol ORDER BY nivel;"
```

---

## Fase 2 — Núcleo del servidor

**Estado:** terminada, verificada y **cerrada**. El dueño aprobó la matriz de
permisos el 18 de octubre de 2026 y con eso quedó completo el criterio de salida.

### Qué se hizo

**El formato de respuesta único** queda confirmado y en uso: éxito
`{ ok: true, datos }`, error `{ ok: false, error: { codigo, mensaje } }`. Está
centralizado en `servidor/src/respuesta.js` y en el manejador global de errores.

**Entrar al sistema** (`servidor/src/acceso/`):

| Archivo | Qué hace |
|---|---|
| `claves.js` | Cifrar y verificar claves con scrypt (venía de la Fase 1) |
| `sesion.js` | Firmar y comprobar el token (HMAC-SHA256 con `CLAVE_SESION`) |
| `autenticacion.js` | El ingreso con el bloqueo de la RN-24, y las consultas de permisos |
| `middleware.js` | `requiereSesion` (401) y `requierePermiso` (403) |

Decisiones de diseño que valen la pena saber:

- **El token lleva solo el identificador del usuario.** El rol, los permisos y si
  la cuenta sigue activa se leen de la base **en cada petición**. Es a propósito:
  así una baja o un cambio de rol surten efecto en el acto (RN-23) y no hay que
  esperar a que venza el token.
- **El token viaja solo en el encabezado `Authorization`.** La auditoría (sección
  7) manda eliminar el token por la barra de direcciones; aquí no se lee de ahí
  nunca, y hay una prueba que lo comprueba.
- **No se puede averiguar qué usuarios existen.** Cuando la cuenta no existe, se
  gasta el mismo tiempo (se calcula un hash de mentira) y se devuelve *exactamente*
  el mismo mensaje que cuando la clave está mal. Hay una prueba que compara las dos
  respuestas y exige que sean iguales.
- **Se niega por defecto.** El permiso se pregunta siempre a la tabla `rol_permiso`.
  Ningún rol tiene permiso automático, ni siquiera el dueño: lo que puede hacer cada
  uno tiene que estar escrito en la matriz. Si la matriz está vacía, no pasa nadie.
- **Tres intentos fallidos bloquean la cuenta** (RN-24) y se le dice al usuario
  cuántos intentos le quedan. La fila se toma con `FOR UPDATE`, porque si no, dos
  intentos fallidos a la vez podrían leer "lleva 2" los dos y ninguno bloquearía.

**Frenos de peticiones** (`servidor/src/limites.js`): 300 peticiones por IP cada
15 minutos para toda la API y 10 intentos de ingreso. La ruta de salud queda por
fuera del freno a propósito: un chequeo automático de "está vivo" no puede quedar
bloqueado, porque avisaría de una caída que no existe.

**Validación con Zod** (`servidor/src/validaciones/`): lo que entra se revisa antes
de llegar a la ruta; lo ya revisado queda en `req.datos`.

**La matriz de permisos** (migración `011_matriz_de_permisos.sql`): las 216 casillas
(8 roles × 27 operaciones), con **90 marcadas**. El dueño aprobó la tabla que está en
`docs/reglas-de-negocio.md`, sección 4.5, y la migración la carga en la base. Se
llenan también las 126 que dicen "no", para que quede escrito que cada negativa se
pensó y no parezca un olvido.

Lo que hace fuerte a esa migración es la prueba que la acompaña
(`matriz-de-permisos.integracion.test.js`): **no lleva la matriz escrita a mano**.
Lee la tabla del documento aprobado, la traduce y la compara **casilla por casilla**
contra la base. Si alguien edita la migración y se equivoca en una sola casilla, o
si el documento y la base se separan, la prueba falla y dice exactamente cuál casilla
es y qué dice cada lado. El documento es el que manda.

**Rutas de la Fase 2**:

| Ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/acceso/entrar` | cualquiera | Devuelve el token |
| `POST /api/acceso/salir` | con sesión | Cierra la sesión |
| `GET /api/acceso/yo` | con sesión | Quién soy, con mi rol y mis permisos |
| `GET /api/parametros` | permiso `ADMINISTRAR_PARAMETROS` | Los parámetros fiscales |
| `GET /api/salud` | cualquiera | Está vivo |

`GET /api/parametros` existe en esta fase por un motivo concreto: el criterio de
salida pide demostrar el 403, y hacía falta **al menos una operación real** que
exigiera un permiso. El módulo completo de parámetros es la Fase 4.

**El arranque ya comprueba la base** (`servidor/src/index.js`): si PostgreSQL no
responde, el servidor avisa y no arranca, en vez de arrancar y fallar en la primera
venta del día. Al apagarse cierra el grupo de conexiones.

### Qué se probó

Ejecutado en este equipo el 18 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| Pruebas de la API (acceso, sesión, permisos, frenos) | `acceso.integracion.test.js` | **26 de 26** |
| La matriz aprobada, contra el documento aprobado | `matriz-de-permisos.integracion.test.js` | **10 de 10** |
| Un error async no cuelga la petición | `errores.integracion.test.js` | **2 de 2** |
| Las de la Fase 1 siguen pasando | (4 archivos) | **119 de 119** |
| Pruebas del cliente | `cliente/pruebas/` | **2 de 2** |
| Todo junto | `npm run verificar` | lint + tipos + **157 pruebas, las 157 pasan** |

El criterio de salida de la fase, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| Sin token, 401 | `GET /api/acceso/yo` sin encabezado → 401 `SIN_SESION` |
| Con rol incorrecto, 403 | El mesero pide los parámetros (la matriz no le da ese permiso) → 403 `SIN_PERMISO`; el gerente, que sí lo tiene, → 200 |
| Con datos inválidos, 400 | Entrar sin clave o con el usuario en blanco → 400 `DATOS_INVALIDOS` |
| Con JSON enorme, 413 | Un cuerpo de más de 100 kb → 413 (en `esqueleto.test.js`) |
| Un error async no cuelga | Se cierra el grupo de conexiones y se pide una ruta que usa la base: responde 500 con el mensaje genérico, sin filtrar el detalle |

Además: el token alterado un solo carácter se rechaza, el token por la barra de
direcciones se rechaza, una cuenta bloqueada no entra ni con la clave correcta, una
cuenta dada de baja no entra, y dar de baja al empleado corta la sesión en el acto.

Sobre la autorización se comprobó, además, que **manda la base y no el código**:
apagando la casilla del gerente en la matriz, el gerente recibe 403; encendiendo la
del mesero, el mesero pasa. Y que apagarle algo a un rol no se lo quita a otro.

**El servidor se arrancó de verdad** y se le hizo una petición con `curl`: salud
200, ingreso 200 con token, clave mala 401 con el aviso de los intentos, y sin
token 401.

### Qué NO se probó todavía

- **Nada del cliente.** El login de la pantalla es la Fase 3.
- **Los detalles finos del bloqueo por IP con usuarios reales** (varios equipos
  detrás del mismo router): el freno está probado, pero con las direcciones de
  prueba del propio equipo.

### Qué queda pendiente

- **Cerrar sesión no invalida el token en el servidor** (decisión 19): al cerrar
  sesión el cliente tira el token. Si hace falta invalidarlo de verdad (se perdió un
  equipo), hay que agregar una tabla de sesiones.
- **Lo demás de la lista de decisiones** (`docs/reglas-de-negocio.md`, sección 5)
  sigue pendiente de decidir, pero ya no bloquea nada: lo que bloqueaba la Fase 2
  era la matriz.

### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las 157 pruebas
npm run base:estado     # las 11 migraciones, incluida la de la matriz

# la matriz como quedó, y cuánto puede cada rol:
psql -h localhost -U postgres -d siga_dp_v2 -c \
  "SELECT r.nombre, count(*) FILTER (WHERE rp.permitido) AS puede
     FROM rol r JOIN rol_permiso rp ON rp.id_rol = r.id_rol
    GROUP BY r.nombre, r.nivel ORDER BY r.nivel DESC;"

# y a mano, con el servidor levantado:
npm run dev:api
curl -i http://localhost:4000/api/salud
curl -i -X POST http://localhost:4000/api/acceso/entrar \
     -H "Content-Type: application/json" \
     -d '{"usuario":"gerente","clave":"gerente"}'
curl -i http://localhost:4000/api/acceso/yo        # sin token: 401
```

---

## Fase 3 — Cliente base

**Estado:** terminada, verificada y **cerrada**. El dueño dio el visto bueno el
18 de octubre de 2026, después de revisar el rediseño con la identidad del
prototipo. Se abre la Fase 4.

### Qué se hizo

- **Un solo cliente HTTP** (`cliente/src/api/`). Ninguna pantalla llama a `fetch`:
  todas pasan por `pedir()`, que pone la dirección de la API, manda el token en
  `Authorization`, corta a los 15 segundos, quita el sobre `{ ok, datos }` y
  convierte cualquier fallo en un `ErrorDeApi` con un mensaje en español.
- **Sesión** (`cliente/src/sesion/`). El token se guarda en `sessionStorage`; al
  recargar, el cliente pregunta a `GET /api/acceso/yo` quién es y qué permisos
  tiene. Si el token venció, se borra y se avisa en el login. Si el servidor
  responde 401 `SIN_SESION` a mitad del trabajo, la sesión se cierra y se vuelve
  a la pantalla de entrar, en un solo lugar y no en cada pantalla.
- **Login real** (`paginas/PantallaLogin.tsx`) contra `POST /api/acceso/entrar`,
  con estado de carga, el mensaje exacto del servidor (incluidos los intentos que
  quedan) y el ojito para ver la clave.
- **Rutas protegidas** (`componentes/RutaProtegida.tsx`): sin sesión lleva a
  `/entrar` y recuerda a dónde se quería ir; con sesión pero sin el permiso lleva
  a la pantalla de acceso denegado. Escribir la dirección a mano no abre nada.
- **Catálogo de pantallas** (`modulos.ts`): cada módulo con el código de permiso
  que exige y la fase en que se construye. El menú y la tabla del inicio salen de
  ahí, filtrados por los permisos que devolvió el servidor.
- **Componentes base**: `Boton` (se deshabilita y lo dice mientras guarda),
  `Campo` (etiqueta, ayuda y error enlazados para el lector de pantalla),
  `Alerta` (error, éxito, aviso e información), `Tabla` (encabezados, vacío y
  cargando), `Cargando` y `LayoutPrincipal` (menú, cabecera y salida).
- **Pantallas de cortesía**: inicio con los datos reales de la sesión, acceso
  denegado, dirección inexistente y una pantalla honesta para los módulos que
  todavía no existen ("Llega en la Fase N").
- **Diseño base con la identidad del prototipo**: la paleta de Doña Pula
  (carbón, brasa, ladrillo, miel, crema, madera, hoja y pizarra), la tipografía
  Poppins, el logo y la mascota reales, barra lateral oscura con el menú del
  rol, tarjetas de módulo y saludo por hora. El foco del teclado se ve siempre y
  el esquema es claro aunque el sistema operativo esté en oscuro.

**Sobre el diseño:** la primera versión de esta fase salió con una paleta
genérica (piedra y ámbar) que no se parecía al prototipo. El dueño lo señaló el
18 de octubre de 2026. Se rehízo la capa visual con la identidad del prototipo
—colores, Poppins, logo, mascota, barra lateral y tarjetas— sin tocar la lógica
de sesión, permisos ni API. Las piezas nuevas (`Logo`, `Insignia`,
`EncabezadoPagina`, `TarjetaModulo`) tienen su prueba. El dueño revisó el
resultado y dio el visto bueno a la fase.

### Decisiones tomadas en esta fase

| Decisión | Por qué |
|---|---|
| El token vive en `sessionStorage`, no en `localStorage` | Aguanta recargar (lo que hace falta en el servicio) y muere al cerrar la pestaña. En una tablet compartida, nadie hereda la sesión del turno anterior. Se cambia en un solo archivo (`sesion/almacen.ts`) si el dueño prefiere recordarla |
| Los permisos **nunca** se escriben en el cliente | Se piden a `GET /api/acceso/yo`, que los lee de `rol_permiso`. Si cambian el rol o dan de baja al empleado, la siguiente petición lo refleja |
| El catálogo de módulos sí vive en el cliente | Es la navegación, no una regla de negocio. Cada entrada apunta a un código de permiso real de la base; el servidor vuelve a comprobarlo |
| Las pantallas que no existen dicen en qué fase llegan | Regla de oro 1: no se finge una pantalla ni se muestran datos falsos. La ruta y su guarda ya son reales y se prueban |
| No se agregó librería de componentes ni de estado | Tailwind y el contexto de React alcanzan para este tamaño; menos dependencias que mantener |
| Las pruebas del cliente sustituyen `fetch` | Lo que se prueba es nuestro cliente (token, sobre, errores). La API real ya tiene 157 pruebas contra PostgreSQL |

### Qué se probó

Ejecutado en este equipo el 18 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| Cliente HTTP: token, sobre, 401, red, tiempo, configuración | `api/cliente-http.test.ts` | **14 de 14** |
| Las tres llamadas del acceso | `api/acceso.test.ts` | **3 de 3** |
| Token guardado, basura y vencimiento | `sesion/almacen.test.ts` | **8 de 8** |
| Recuperar, entrar, salir y expiración | `sesion/ContextoSesion.test.tsx` | **7 de 7** |
| Alerta | `componentes/Alerta.test.tsx` | **4 de 4** |
| Botón | `componentes/Boton.test.tsx` | **5 de 5** |
| Campo | `componentes/Campo.test.tsx` | **5 de 5** |
| Tabla | `componentes/Tabla.test.tsx` | **4 de 4** |
| Logo y su respaldo si la imagen falta | `componentes/Logo.test.tsx` | **2 de 2** |
| Insignia de estado | `componentes/Insignia.test.tsx` | **1 de 1** |
| Tarjeta de módulo | `componentes/TarjetaModulo.test.tsx` | **2 de 2** |
| Encabezado de página | `componentes/EncabezadoPagina.test.tsx` | **2 de 2** |
| Guarda de rutas | `componentes/RutaProtegida.test.tsx` | **4 de 4** |
| Formulario de entrada | `paginas/PantallaLogin.test.tsx` | **7 de 7** |
| Catálogo y filtro por permisos | `modulos.test.ts` | **5 de 5** |
| Recorrido completo (login, rol, denegado, salida) | `App.test.tsx` | **6 de 6** |
| Las de la Fase 2 siguen pasando | (7 archivos del servidor) | **157 de 157** |
| Todo junto | `npm run verificar` | lint + tipos + **236 pruebas, las 236 pasan** |

El criterio de salida de la fase, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| Iniciar sesión con el usuario del seed | `gerente` / `gerente` en el navegador, contra la API y PostgreSQL de verdad |
| Ver solo las pantallas de su rol | Con el rol cambiado a Mesero en la base y la página recargada, el menú quedó en **Pedidos** y el inicio mostró una sola tarjeta |
| Cerrar sesión | El botón devolvió a `/entrar` y `sessionStorage` quedó sin token |
| Pruebas de los componentes base | **18** pruebas entre alerta, botón, campo y tabla, más **4** de la guarda de rutas y **7** de las piezas de la identidad (logo, insignia, tarjeta y encabezado) |

**Comprobación manual en el navegador** (18 de octubre de 2026), con el servidor
y el cliente levantados:

1. Clave equivocada → el mensaje del servidor: "Usuario o clave incorrectos. Te
   quedan 2 intentos antes de que la cuenta se bloquee." (un solo intento, para
   no bloquear la cuenta).
2. Ingreso correcto → inicio con el nombre real, rol **Gerente**, vencimiento de
   la sesión y las 12 pantallas del rol.
3. `/personal` → "Esta pantalla se está cocinando" y "Llega en la Fase 4".
4. Con la sesión abierta, el rol se cambió a **Mesero** en PostgreSQL y se
   recargó: `/personal` pasó a "No tienes permiso", el rol mostrado pasó a
   **Mesero** y el menú quedó solo con **Pedidos**.
5. "Salir" → `/entrar`, sin token guardado.
6. Se restauró el rol a Gerente y se volvió a entrar: las 12 pantallas
   regresaron y `intentos_fallidos` quedó en 0.

### Qué NO se probó todavía

- **Playwright / extremo a extremo.** No está instalado: el plan lo deja para la
  Fase 9. El recorrido se hizo a mano en el navegador de escritorio, no en una
  tablet ni en un teléfono.
- **El vencimiento a mitad del trabajo, en vivo.** Sería esperar 12 horas (o
  cambiar `SESION_HORAS`). La lógica está cubierta por pruebas con fechas ya
  vencidas y respuestas preparadas, no con una sesión real que venza.
- **Los módulos de gestión.** No existen todavía; sus rutas muestran la fase en
  que llegan. La primera pantalla de verdad es la Fase 4.
- **El freno por IP con varios equipos detrás del mismo router.** Ya se anotó en
  la Fase 2; sigue igual.

### Qué queda pendiente

- Reemplazar, fase por fase, cada pantalla "en construcción" por la de verdad.
  La ruta y la guarda ya están; solo cambia lo que se dibuja.
- La **decisión 19** sigue abierta: cerrar sesión no invalida el token en el
  servidor. Ahora el cliente lo borra, que es lo que el plan pedía para esta
  fase. Si hace falta invalidarlo de verdad (se perdió un equipo), hay que
  decidir una tabla de sesiones.
- No hubo decisiones de negocio nuevas. Lo que queda en
  `docs/reglas-de-negocio.md`, sección 5, sigue pendiente y no bloquea la Fase 4.

### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las 236 pruebas
npm run dev             # API en 4000 y cliente en 5173

# en el navegador: http://localhost:5173
# usuario: gerente   clave: gerente

# para ver la separación por rol sin crear usuarios, con la sesión abierta:
#   el rol vive en empleado, no en el usuario
psql -h localhost -U postgres -d siga_dp_v2 -c \
  "UPDATE empleado SET id_rol = (SELECT id_rol FROM rol WHERE codigo = 'mesero')
    WHERE id_empleado = (SELECT id_empleado FROM usuario WHERE usuario = 'gerente');"
# recargar la página: el menú queda en Pedidos y /personal da acceso denegado
# después, devolverlo a gerente:
psql -h localhost -U postgres -d siga_dp_v2 -c \
  "UPDATE empleado SET id_rol = (SELECT id_rol FROM rol WHERE codigo = 'gerente')
    WHERE id_empleado = (SELECT id_empleado FROM usuario WHERE usuario = 'gerente');"
```

> Ojo: si el **prototipo viejo** sigue corriendo, ocupa los puertos 4000 y 5173.
> `npm run dev` falla con "Port 5173 is already in use". Apágalo primero.

---

## Fase 4 — Módulos de gestión

**Estado:** abierta. Los **módulos 1, Personal y usuarios**, **2, Productos y
catálogo**, y **3, Mesas y reservas**, están terminados y verificados. El
**módulo 4, Inventario**, está terminado y verificado contra PostgreSQL y el
cliente; falta que el dueño lo revise y confirme. La fase no se cierra hasta que
estén los cuatro y el dueño dé el visto bueno. No se abre la Fase 5 antes de eso.

### Módulo 1 — Personal y usuarios

#### Qué se hizo

- **Servidor** (`servidor/src/rutas/personal.js` y
  `servidor/src/validaciones/personal.js`). Siete rutas, todas bajo el permiso
  `ADMINISTRAR_PERSONAL`:
  - `GET /api/personal`: la lista con el **estado efectivo** (Activo, Inactivo o
    Bloqueado) y los roles que el actor puede asignar (nivel menor o igual al
    suyo).
  - `POST /api/personal`: crea el empleado y su cuenta en **una sola
    transacción**. Si la cédula o el usuario se repiten, no queda un empleado
    huérfano.
  - `PATCH /api/personal/:id`: nombre, teléfono y rol. La cédula y el nombre de
    usuario no se cambian.
  - `POST /api/personal/:id/baja`: el empleado y su cuenta pasan a `Inactivo` en
    la misma transacción; no se borra nada (RN-16, RN-23).
  - `POST /api/personal/:id/reactivar`: los dos vuelven a `Activo`, con el mismo
    usuario y el mismo historial.
  - `POST /api/personal/:id/desbloquear`: limpia `intentos_fallidos` y vuelve a
    `Activo` (RN-24).
  - `POST /api/personal/:id/clave`: restablece la clave con **mínimo 8 y máximo
    200** caracteres (decisión 20), cifrada con scrypt.
- **Dos defensas fuera de la matriz de permisos**, porque no son "qué módulo ve"
  sino "a quién puede tocar":
  1. Nadie administra a alguien de un nivel superior al suyo.
  2. Nadie se da de baja a sí mismo ni se cambia su propio rol.

  La pantalla deshabilita los botones que no aplican, pero la comprobación real
  está en el servidor.
- **Cliente** (`paginas/Personal.tsx`, `paginas/personal/ModalEmpleado.tsx`,
  `ModalClave.tsx`, `componentes/Modal.tsx`, `ModalConfirmacion.tsx`,
  `Selector.tsx` y `api/personal.ts`): tabla con cédula, empleado, usuario, rol,
  estado y acciones; alta y edición en ventana; confirmación antes de dar de
  baja, reactivar o desbloquear; cambio de clave con ojito; los errores del
  servidor se quedan dentro de la ventana; la lista se refresca con lo que
  devolvió el servidor, no con lo que el cliente cree.
- **Navegación**: `/personal` dejó de ser "en construcción". La tarjeta dice
  **Disponible**, el catálogo de módulos lo marca y el inicio lo cuenta. Los
  demás módulos siguen diciendo la fase en que llegan.
- **Decisiones del dueño** (18 de octubre de 2026), escritas en
  `docs/reglas-de-negocio.md`: baja = empleado y cuenta `Inactivo` en la misma
  transacción, cuenta conservada y botón **Reactivar** (decisión 6); clave de 8
  a 200 caracteres al crear o restablecer, login sin mínimo (decisión 20).

#### Qué se probó

Ejecutado en este equipo el 18 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| API: autorización, lista, alta, edición, baja, reactivación, desbloqueo, clave y defensas de nivel | `servidor/pruebas/personal.integracion.test.js` | **29 de 29** |
| Cliente: las llamadas del módulo (token, sobre, error y mensaje) | `cliente/pruebas/api/personal.test.ts` | **5 de 5** |
| Selector | `cliente/pruebas/componentes/Selector.test.tsx` | **4 de 4** |
| Ventana con foco atrapado y Escape | `cliente/pruebas/componentes/Modal.test.tsx` | **5 de 5** |
| Ventana de confirmación | `cliente/pruebas/componentes/ModalConfirmacion.test.tsx` | **4 de 4** |
| Pantalla: lista, error y reintento, alta, error del servidor, validación, edición, baja y reactivación, desbloqueo, clave y nivel superior | `cliente/pruebas/paginas/Personal.test.tsx` | **10 de 10** |
| Las de la Fase 2 siguen pasando | servidor | **157 de 157** (186 en total con las 29 nuevas) |
| Las de la Fase 3 siguen pasando | cliente | **79 de 79**, ampliadas con 3 casos (la tarjeta "Disponible", el catálogo y la ruta real) |
| Todo junto | `npm run verificar` | lint + tipos + **296 pruebas, las 296 pasan** |

El criterio de salida del módulo, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| El flujo completo funciona en el navegador contra la base real | Chrome sin ventana contra `siga_dp_v2`: entrar con `gerente`, ver la lista, crear un empleado, editarlo (nombre, teléfono y rol), cambiarle la clave, darlo de baja y reactivarlo. |
| Sobrevive a recargar | `Page.reload` sobre `/personal`: la sesión siguió y la tabla volvió con la fila real (1 fila y el token en `sessionStorage`). |
| Pruebas de API y de interfaz | 29 pruebas de API contra PostgreSQL y 28 del cliente (5 de API, 13 de componentes y 10 de pantalla). |
| Permisos por rol verificados | Sin sesión → 401; con un rol sin `ADMINISTRAR_PERSONAL` → 403 (pruebas). El gerente solo ve los roles de nivel ≤ 4 (no el de dueño); el dueño sí lo ve. |

**Comprobación manual en el navegador** (18 de octubre de 2026), con la API y el
cliente levantados contra `siga_dp_v2`:

1. Ingreso con `gerente` / `gerente` y apertura de `/personal`: la lista mostró
   al gerente, su cédula, su usuario, su rol y el estado **Activo**.
2. Alta de un empleado temporal: cédula `99-9999999-9`, usuario `prueba-ui`,
   rol Mesero y clave de prueba. La ventana se cerró, apareció el aviso y la fila
   entró a la tabla sin recargar a mano.
3. Edición: la cédula y el usuario estaban deshabilitados; se cambiaron nombre,
   teléfono y rol. El aviso fue "Se actualizó a…" y la fila quedó con los datos
   nuevos.
4. Cambio de clave: el campo exige 8 caracteres; se guardó una clave nueva y el
   mensaje del servidor apareció en la pantalla.
5. Baja: la confirmación avisó que la cuenta dejaría de entrar; al aceptar, la
   fila quedó **Inactivo**. Reactivar la devolvió a **Activo** con el mismo
   usuario.
6. Recarga: la página volvió a pedir la lista y la sesión siguió.
7. Limpieza: se devolvió la base de desarrollo a la semilla
   (`TRUNCATE` + `npm run base:semilla`). Quedó solo el gerente; no quedó ningún
   dato de prueba.

Las capturas de la lista, el alta, la edición, la clave, la confirmación de baja
y la reactivación se revisaron a 1440×1000. La identidad visual del prototipo se
mantiene: barra lateral oscura, Poppins, brasa, crema y las tarjetas de módulo.

#### Qué NO se probó todavía

- **Playwright / extremo a extremo.** Sigue para la Fase 9. El recorrido se hizo
  con Chrome sin ventana, no con la suite de extremo a extremo.
- **Tablet o teléfono.** La captura fue de escritorio (1440×1000). El diseño es
  responsive, pero no se revisó en un dispositivo real.
- **Dos administradores a la vez.** Si uno da de baja mientras el otro edita,
  gana la última petición: no hay bloqueo optimista. No era un requisito del
  plan, pero queda dicho.
- **Revocación del token al dar de baja.** La siguiente petición del dado de baja
  recibe 401 `CUENTA_INACTIVA` porque el middleware relee la base, pero el token
  en sí no se invalida (decisión 19, ya anotada desde la Fase 2).
- **Cambio obligatorio de clave en el siguiente ingreso.** No existe
  `debe_cambiar_clave`; el plan no lo pedía. Si el dueño lo quiere, es una
  decisión nueva.
- **Avisos al empleado.** El desbloqueo o el cambio de clave no le mandan correo
  ni WhatsApp: no hay integración.
- **Roles duplicados o de nivel igual.** El servidor permite que un gerente cree
  a otro gerente (mismo nivel) y que un dueño cree a otro dueño. La regla solo
  prohíbe administrar a un nivel **superior**. Si el negocio quiere prohibir
  iguales, hay que decidirlo y cambiar la comprobación.

#### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las pruebas actuales
npm run dev             # API en 4000 y cliente en 5173

# en el navegador: http://localhost:5173
# usuario: gerente   clave: gerente   →   Personal y usuarios

# la base de desarrollo debe tener un solo empleado:
psql -h localhost -U postgres -d siga_dp_v2 -c \
  "SELECT e.nombre, u.usuario, e.estado, u.estado
     FROM empleado e LEFT JOIN usuario u ON u.id_empleado = e.id_empleado;"
```

### Módulo 2 — Productos y catálogo

#### Qué se hizo

- **Servidor** (`servidor/src/rutas/productos.js` y
  `servidor/src/validaciones/productos.js`). Diez rutas, todas bajo el permiso
  `ADMINISTRAR_PRODUCTOS`:
  - `GET /api/productos`: el catálogo completo para la pantalla de
    administración; incluye los productos inactivos para poder reactivarlos.
  - `POST /api/productos`: crea un producto con nombre, precio, categoría y
    estación.
  - `PATCH /api/productos/:id`: edita nombre, precio, categoría o estación.
  - `PATCH /api/productos/:id/disponibilidad`: marca disponible o agotado del
    día.
  - `POST /api/productos/:id/baja`: saca el producto del catálogo con
    `activo = false`; no se borra (RN-16).
  - `POST /api/productos/:id/reactivar`: lo devuelve al catálogo conservando su
    disponibilidad.
  - `POST /api/productos/categorias` y `PATCH /api/productos/categorias/:id`:
    crean, renombran y activan o desactivan categorías.
  - `POST /api/productos/estaciones` y `PATCH /api/productos/estaciones/:id`:
    crean y renombran estaciones.
- **Reglas que viven en la base y en la transacción**:
  - Una categoría no se desactiva mientras tenga productos activos. La fila de
    la categoría se bloquea (`FOR UPDATE`) y la creación o edición de productos
    la comparte (`FOR SHARE`), para que dos peticiones no se crucen.
  - Un producto cuya categoría está inactiva no se puede reactivar hasta
    cambiarlo a una categoría activa.
  - La baja no toca `disponible`: un producto agotado sigue agotado cuando se
    reactiva. Son dos estados distintos: estar en el catálogo y estar disponible
    hoy.
  - El precio viaja como texto desde el formulario y la base lo guarda en
    `dinero` (NUMERIC(12,2)); la API lo devuelve como número y la pantalla lo
    formatea en RD$.
- **Migración `012_nombres_del_catalogo_sin_mayusculas.sql`**: agrega
  `fn_nombre_normalizado(texto)` (minúsculas y sin tildes) y tres índices únicos
  para producto, categoría y estación. Las restricciones únicas exactas siguen
  existiendo; los índices nuevos impiden que "Pollo a la brasa" y "POLLO A LA
  BRASA" convivan. El servidor traduce la violación a `NOMBRE_DUPLICADO`.
- **Cliente** (`paginas/Productos.tsx`, `paginas/productos/ModalProducto.tsx`,
  `paginas/productos/ModalCatalogo.tsx`, `api/productos.ts`, `Buscador.tsx` y
  `Pestanas.tsx`): contadores de productos, disponibles, agotados e inactivos;
  búsqueda por nombre y filtros por categoría, agotados e inactivos; tabla con
  precio, estado de catálogo, disponibilidad y acciones; alta y edición en
  ventana; confirmación antes de dar de baja o reactivar; administración de
  categorías y estaciones en una ventana aparte. Si no hay categoría activa o
  estación, el botón de crear producto se deshabilita y se indica cómo resolverlo.
- **Navegación**: `/productos` dejó de ser "en construcción". La tarjeta dice
  **Disponible** y la pantalla usa el rótulo `M07 · Productos`, igual que en el
  prototipo. Los módulos 3 y 4 de la fase siguen pendientes.
- **Fuera de alcance, a propósito**: la receta o componentes del producto queda
  para Inventario; las promociones quedan fuera de este módulo. No se inventó
  ninguno de los dos.

#### Qué se probó

Ejecutado en este equipo el 18 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| API: lista, alta, edición, disponibilidad, baja, reactivación, categorías, estaciones, nombres repetidos, categoría inactiva y defensas de la transacción | `servidor/pruebas/productos.integracion.test.js` | **32 de 32** |
| Pantalla: lista, filtros, alta, validación, error del servidor, edición, categoría inactiva, disponibilidad, baja, reactivación, baja fallida, catálogo vacío, administrador de catálogo y reintento de carga | `cliente/pruebas/paginas/Productos.test.tsx` | **13 de 13** |
| Formato de precio, buscador y pestañas | `cliente/pruebas/componentes/catalogo.test.tsx` | **4 de 4** |
| Las de la Fase 2 siguen pasando | servidor | **218 de 218** (186 anteriores + 32 nuevas) |
| Las de la Fase 3 siguen pasando | cliente | **127 de 127** (110 anteriores + 17 nuevas) |
| Todo junto | `npm run verificar` | lint + tipos + **345 pruebas, las 345 pasan** |
| Compilación de producción | `npm run build` | Vite compiló sin errores |

El criterio de salida del módulo, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| El flujo completo funciona en el navegador contra la base real | Chrome contra `siga_dp_v2`: entrar con `gerente`, abrir `/productos`, crear categoría y estación, crear un producto, editarlo, marcarlo agotado, darlo de baja y reactivarlo. |
| Sobrevive a recargar | `Page.reload` sobre `/productos`: la sesión siguió y el producto volvió con el precio, la categoría y la estación reales, y con la disponibilidad **Agotado**. |
| Pruebas de API y de interfaz | 32 pruebas de API contra PostgreSQL y 17 nuevas del cliente (13 de pantalla y 4 de componentes). |
| Permisos por rol verificados | Sin sesión → 401; con un rol sin `ADMINISTRAR_PRODUCTOS` → 403 (pruebas). |
| Los datos no se simulan | Todo se guardó en PostgreSQL. La lista se refresca con la respuesta del servidor; no hay estado local que finja guardar. |

**Comprobación manual en el navegador** (18 de octubre de 2026), con la API y el
cliente levantados contra `siga_dp_v2`:

1. Ingreso con `gerente` / `gerente` y apertura de `/productos`: aparecieron los
   dos productos de la semilla, con `2 productos · 2 disponibles · 0 agotados ·
   0 inactivos`.
2. Se crearon la categoría **Categoría de prueba** y la estación **Estación de
   prueba** desde **Categorías y estaciones**. La lista se refrescó sola.
3. Se creó **Producto de prueba** con precio `99.50`, categoría y estación
   nuevas. La fila entró a la tabla y el aviso confirmó la creación.
4. Se editó a **Producto de prueba editado** con precio `120`. La fila quedó con
   el nombre, el precio y las relaciones nuevas.
5. Se marcó **Agotado** y se recargó la página: el estado siguió agotado y el
   contador pasó a `2 disponibles · 1 agotado`.
6. Con el producto activo, se intentó desactivar su categoría: el servidor
   respondió que no se puede mientras tenga productos activos y la categoría
   siguió activa.
7. Se renombraron la categoría y la estación: la fila del producto mostró los
   nombres nuevos sin recargar a mano.
8. Se dio de baja el producto: quedó **Inactivo** y el contador lo reflejó. La
   confirmación de reactivación avisó que conservaría la disponibilidad
   **Agotado**; al reactivarlo, siguió agotado.
9. Se dio de baja otra vez y se desactivó su categoría. Con la categoría
   inactiva, el botón **Reactivar** quedó deshabilitado con el aviso de que había
   que cambiar el producto de categoría. Se reactivó la categoría y después el
   producto.
10. Limpieza: se recrearon las bases de desarrollo y de pruebas con
    `npm run base:recrear`; las dos quedaron con la semilla. No quedó ningún
    producto, categoría o estación de prueba.

#### Qué NO se probó todavía

- **Playwright / extremo a extremo.** Sigue para la Fase 9. El recorrido se hizo
  con Chrome, no con la suite de extremo a extremo.
- **Tablet o teléfono.** La revisión fue de escritorio. El diseño es responsive,
  pero no se revisó en un dispositivo real.
- **Dos administradores a la vez.** Las transacciones y los bloqueos protegen la
  regla de la categoría, pero no hay bloqueo optimista para dos ediciones del
  mismo producto: gana la última petición.
- **Receta y componentes.** No existen todavía; llegan con Inventario.
- **Promociones.** No forman parte de este módulo.
- **Revocación del token y cambio obligatorio de clave.** Siguen igual que en el
  módulo 1: la sesión se revalida contra la base en cada petición, pero no hay
  revocación explícita ni cambio obligatorio.

#### Qué queda en la Fase 4

1. Mesas y reservas (documentado abajo).
2. Inventario.

El módulo 2 quedó aprobado por el dueño. El módulo 3 está terminado y pendiente
de su revisión. La Fase 4 no se cierra hasta que estén los cuatro módulos y el
dueño apruebe el criterio de salida.

#### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las pruebas actuales
npm run build           # compilación de producción del cliente
npm run dev             # API en 4000 y cliente en 5173

# en el navegador: http://localhost:5173
# usuario: gerente   clave: gerente   →   Productos y catálogo
```

La base de desarrollo debe tener el catálogo mínimo de la semilla:

```sql
SELECT p.nombre, c.nombre AS categoria, e.nombre AS estacion, p.precio,
       p.disponible, p.activo
  FROM producto p
  JOIN categoria c ON c.id_categoria = p.id_categoria
  JOIN estacion e  ON e.id_estacion = p.id_estacion
 ORDER BY p.nombre;
```

Deben aparecer **Producto de desarrollo A** y **Producto de desarrollo B**, en
**Platos (desarrollo)** y **Cocina**, sin filas de prueba.

### Módulo 3 — Mesas y reservas

#### Qué se hizo

- **Servidor** (`servidor/src/rutas/mesas.js` y
  `servidor/src/validaciones/mesas.js`). Trece rutas, con el permiso de la matriz
  en cada una:
  - `GET /api/mesas` (`VER_MESAS`): las zonas y las mesas con su estado, sus
    personas, la hora de llegada, el mesero de la orden y el estado del pedido.
  - `POST /api/mesas`, `PATCH /api/mesas/:id` y `DELETE /api/mesas/:id`
    (`ADMINISTRAR_MESAS`): crear, editar número, zona o capacidad, y eliminar
    una mesa sin historial.
  - `PATCH /api/mesas/:id/estado` (`ASIGNAR_MESA`): ocupar con personas,
    mandar a limpieza o liberar.
  - `GET /api/mesas/reservas?fecha=AAAA-MM-DD`, `POST /api/mesas/reservas`,
    `PATCH /api/mesas/reservas/:id`, `POST /api/mesas/reservas/:id/cancelar` y
    `POST /api/mesas/reservas/:id/abrir` (`GESTIONAR_RESERVA`). Abrir exige
    **también** `ASIGNAR_MESA`.
  - `POST /api/mesas/zonas`, `PATCH /api/mesas/zonas/:id` y
    `DELETE /api/mesas/zonas/:id` (`ADMINISTRAR_MESAS`).
- **Reglas que viven en la transacción y en la base**:
  - Abrir una reserva deja la reserva en `Abierta` y la mesa en `ocupada` con
    las personas de la reserva y `hora_llegada = now()`, en la misma
    transacción. La reserva y la mesa se bloquean con `FOR UPDATE`; si algo
    falla, no queda ni lo uno ni lo otro.
  - Una mesa con un pedido `Abierto`/`Enviado` o una cuenta `Abierta` no se
    libera ni se manda a limpieza (`MESA_CON_SERVICIO_ABIERTO`). Abrir una
    reserva revisa lo mismo: si quedó un servicio viejo colgando, no se abre
    encima. Una prueba fuerza ese caso por SQL, porque el flujo normal no deja
    crear un pedido huérfano.
  - La capacidad se revisa al ocupar, al reservar y al crear o editar una mesa
    (RN-20). Bajar la capacidad no puede dejarla por debajo de las personas que
    hay ahora ni de una reserva de hoy o de más adelante
    (`CAPACIDAD_MENOR_QUE_PERSONAS`, `CAPACIDAD_MENOR_QUE_RESERVAS`).
  - Dos reservas vivas no pueden coincidir en mesa, fecha y hora (RN-21). Lo
    impiden la comprobación de la ruta y el índice único
    `uq_reserva_por_mesa_hora`; la violación se traduce a `RESERVA_DUPLICADA`.
  - Una zona con mesas no se elimina (`ZONA_CON_MESAS`, RN-15). Una mesa con
    reservas, pedidos o cuentas tampoco (`MESA_CON_HISTORIAL`): no se borra el
    historial.
  - El nombre de la zona se compara sin mayúsculas ni tildes con
    `fn_nombre_normalizado`, la misma función que trajo la migración `012` para
    el catálogo. La restricción exacta `uq_zona_nombre` sigue existiendo.
  - Las fechas y las horas viajan como texto (`AAAA-MM-DD` y `HH:MM`), no como
    instantes, para que el navegador y PostgreSQL no se peleen por la zona
    horaria.
- **Cliente** (`paginas/Mesas.tsx`, `paginas/mesas/ModalReserva.tsx`,
  `ModalCancelarReserva.tsx`, `ModalLlegada.tsx`, `ModalZonasMesas.tsx`,
  `api/mesas.ts` y `utilidades/fecha.ts`):
  - **Mapa**: filtro por zona, contadores de libres, ocupadas y en limpieza,
    tarjetas con capacidad y personas, y las acciones de la mesa elegida
    (registrar llegada, mandar a limpieza, liberar). Si el rol no tiene
    `ASIGNAR_MESA`, el mapa se ve pero las acciones no.
  - **Reservas**: agenda por fecha con botón **Hoy**, alta y edición en
    ventana, cancelación con motivo, y apertura con confirmación. La reserva
    cancelada sigue en la agenda con su motivo; no se borra.
  - **Configuración**: ventana con pestañas **Zonas** y **Mesas** para crear,
    editar y eliminar. Los ambientes son Salón, Terraza, Barra, Privado y
    Exterior. Solo se dibuja con `ADMINISTRAR_MESAS`.
  - Después de cada acción se vuelven a pedir el mapa y la agenda al servidor.
    Si la acción falla, el mensaje del servidor se queda dentro de la ventana o
    en la pantalla; no se muestra un éxito falso.
  - `formatearFecha` interpreta la fecha como día de calendario en UTC y
    `fechaDeHoy` la arma con la fecha local. Así una reserva no se corre de día
    al mostrarla.
- **Navegación y permisos**:
  - `/mesas` dejó de ser "en construcción". La tarjeta dice **Disponible** y
    usa el rótulo `M02 · Mesas y reservas`, como el prototipo.
  - La tarjeta y la ruta `/mesas` piden `GESTIONAR_RESERVA`, así que la pantalla
    completa la ven dueño, gerente y anfitrión. El API del mapa sigue aceptando
    `VER_MESAS` y el de las mesas `ASIGNAR_MESA`; la matriz se respeta en el
    servidor, no solo en el menú.
  - La configuración de zonas y mesas queda para `ADMINISTRAR_MESAS` (dueño y
    gerente). El anfitrión gestiona reservas y estados, pero no crea zonas ni
    mesas.
- **Sin migración nueva.** Las tablas `zona`, `mesa` y `reserva`, sus
  restricciones y la función `fn_nombre_normalizado` de la migración `012`
  alcanzaron. No se tocó ninguna migración aplicada.

#### Qué se probó

Ejecutado en este equipo el 19 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| API: permisos, mapa, zonas, mesas, reservas, apertura, capacidad, historial y servicio abierto | `servidor/pruebas/mesas.integracion.test.js` | **30 de 30** |
| Pantalla: mapa, llegada, error de llegada, reintento, agenda por fecha, alta, edición, cancelación, apertura, error de apertura, configuración, alta de zona y mesa y mesa con historial | `cliente/pruebas/paginas/Mesas.test.tsx` | **13 de 13** |
| Fechas locales y formato sin corrimiento de día | `cliente/pruebas/utilidades/fecha.test.ts` | **3 de 3** |
| Las de la Fase 2 siguen pasando | servidor | **248 de 248** (218 anteriores + 30 nuevas) |
| Las de la Fase 3 siguen pasando | cliente | **143 de 143** (127 anteriores + 16 nuevas) |
| Todo junto | `npm run verificar` | lint + tipos + **391 pruebas, las 391 pasan** |
| Compilación de producción | `npm run build` | Vite compiló sin errores |

El criterio de salida del módulo, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| El flujo completo funciona en el navegador contra la base real | Chrome contra `siga_dp_v2`: entrar con `gerente`, abrir `/mesas`, crear una reserva, editarla, cancelarla con motivo, abrir otra reserva, ver la mesa ocupada, liberarla y registrar una llegada con personas. También se crearon y eliminaron una zona y una mesa desde la configuración. |
| Sobrevive a recargar | Se creó **Prueba recarga** (21:00, Mesa 1), se recargó `/mesas` y la sesión siguió: la reserva volvió de PostgreSQL con su hora, sus personas y su teléfono. |
| Pruebas de API y de interfaz | 30 pruebas de API contra PostgreSQL y 16 nuevas del cliente (13 de pantalla y 3 de fechas). |
| Permisos por rol verificados | Sin sesión → 401; el mesero ve el mapa pero recibe 403 al gestionar reservas o configurar; el anfitrión gestiona reservas y estados pero recibe 403 al crear zonas o mesas. La pantalla esconde **Zonas y mesas** sin `ADMINISTRAR_MESAS`. |
| Los datos no se simulan | Todo se guardó en PostgreSQL. La agenda y el mapa se refrescan con la respuesta del servidor; no hay reservas ni mesas de ejemplo en el cliente. |

**Comprobación manual en el navegador** (19 de octubre de 2026), con la API y el
cliente levantados contra `siga_dp_v2`:

1. Ingreso con `gerente` / `gerente` y apertura de `/mesas`: apareció **Salón
   (desarrollo)** con la **Mesa 1**, capacidad 4, en **Libre**, y los contadores
   `1 libre · 0 ocupadas · 0 en limpieza`.
2. Se creó la reserva de **Cliente de prueba** para las 19:30, 2 personas, Mesa
   1. Quedó **Pendiente** en la agenda y el aviso confirmó la creación.
3. Se abrió con **Abrir reserva**: la confirmación avisó que la mesa quedaría
   ocupada con las 2 personas. Al aceptar, la reserva pasó a **Abierta** y el
   mapa mostró la Mesa 1 **Ocupada**, con 2 personas y la hora de llegada.
4. Se liberó la mesa y se registró una llegada nueva con 3 personas: el mapa
   volvió a mostrar **Ocupada** con las 3 personas. Después se liberó otra vez.
5. Se creó otra reserva, **Cliente dos**, para las 20:15, 2 personas. Se editó
   a **Cliente dos editado**, 20:45 y 3 personas; la tarjeta se actualizó con el
   nombre, la hora y las personas nuevos.
6. Se canceló con el motivo "El cliente avisó que no puede llegar." La reserva
   siguió en la agenda como **Cancelada**, con el motivo visible.
7. En **Zonas y mesas** se creó **Zona temporal** (Terraza) y la **Mesa 99**
   (capacidad 2). Se eliminó la mesa y después la zona. La zona **Salón
   (desarrollo)** tenía el botón **Eliminar** deshabilitado porque todavía tenía
   una mesa.
8. Se recargó `/mesas` con **Prueba recarga** en la agenda: la sesión siguió y
   la reserva volvió con sus datos. La consola del navegador no mostró errores.
9. Limpieza: se borraron las reservas de prueba por SQL y se devolvió la Mesa 1
   a **Libre**. La base de desarrollo quedó con una sola zona, una sola mesa y
   cero reservas.

#### Qué NO se probó todavía

- **Playwright / extremo a extremo.** Sigue para la Fase 9. El recorrido se hizo
  con el navegador, no con la suite de extremo a extremo.
- **Tablet o teléfono.** La revisión fue de escritorio. El diseño es responsive,
  pero no se revisó en un dispositivo real.
- **Dos administradores a la vez.** Las transacciones y los bloqueos protegen
  la apertura de una reserva y el estado de la mesa, pero no hay bloqueo
  optimista para dos ediciones del mismo registro: gana la última petición.
- **Roles distintos en el navegador.** La base de desarrollo solo trae al
  gerente. Los permisos de mesero y anfitrión se comprobaron en las pruebas de
  API; no se crearon cuentas temporales para repetir el recorrido a mano.
- **Revocación del token y cambio obligatorio de clave.** Siguen igual que en
  los módulos anteriores: la sesión se revalida contra la base en cada petición,
  pero no hay revocación explícita ni cambio obligatorio.
- **Estado `reservada` de la mesa.** El mapa sabe dibujarlo y la base lo admite,
  pero este módulo no lo asigna al crear una reserva. Solo **Abrir reserva**
  pasa la mesa a `ocupada`, que es lo que pediste. Si quieres que una reserva
  marque la mesa como reservada antes de que llegue el cliente, es una decisión
  nueva.
- **Duración de las reservas.** RN-21 solo compara mesa, fecha y hora exactas.
  No hay hora de fin ni duración: dos reservas para la misma mesa a las 20:00 y
  a las 21:00 se permiten, aunque en la vida real se solapen. Crear una reserva
  tampoco compara contra el estado actual de la mesa; solo contra otras reservas
  vivas.
- **Nombres de zona con carreras.** La ruta comprueba el nombre normalizado
  antes de insertar, pero `zona` no tiene un índice único normalizado como el
  catálogo. Dos peticiones simultáneas con "Terraza" y "TERRAZA" podrían pasar
  las dos si llegan a la vez. La restricción exacta `uq_zona_nombre` no cubre
  mayúsculas ni tildes.

### Módulo 4 — Inventario

#### Qué se hizo

- **Migración `013_ajuste_de_inventario_con_diferencia.sql`**. La restricción
  `ck_movimiento_signo` exigía `cantidad > 0` para `Ajuste por conteo`, lo que
  contradecía RN-14 (el ajuste guarda la diferencia, que puede ser negativa). Se
  cambió a `cantidad <> 0`. No se tocó ninguna migración aplicada.
- **Servidor** (`servidor/src/rutas/inventario.js` y
  `servidor/src/validaciones/inventario.js`). Nueve rutas, con el permiso de la
  matriz en cada una:
  - `GET /api/inventario` (`VER_EXISTENCIAS`): insumos (activos e inactivos),
    puntos, unidades y existencias por punto. La existencia total es la suma de
    todos los puntos.
  - `GET /api/inventario/movimientos` (`VER_EXISTENCIAS`): historial, filtrable
    por insumo.
  - `GET /api/inventario/proveedores` (`MOVER_INVENTARIO`): proveedores activos
    e inactivos, con el número de compras.
  - `POST /api/inventario/insumos`, `PATCH /api/inventario/insumos/:id`
    (`ADMINISTRAR_INSUMOS`): crear y editar insumo. La unidad solo cambia si no
    tiene movimientos (si no, se reinterpretaría el historial).
  - `POST /api/inventario/proveedores`, `PATCH /api/inventario/proveedores/:id`
    (`ADMINISTRAR_INSUMOS`): crear y editar proveedor. Un proveedor nunca se
    borra: se desactiva (RN-16).
  - `POST /api/inventario/movimientos` (`MOVER_INVENTARIO`): entrada de compra,
    salida por consumo o ajuste por conteo.
- **Reglas que viven en la transacción y en la base**:
  - La existencia nunca queda negativa (RN-13). Se comprueba antes de insertar
    para dar un mensaje claro y el disparador de la base vuelve a comprobarlo
    con la fila bloqueada (`FOR UPDATE`). Dos salidas simultáneas no pueden
    dejar un saldo negativo.
  - El ajuste guarda la diferencia, no el conteo final (RN-14). El servidor
    calcula `conteo - existencia`, guarda la diferencia y arma el detalle
    (`Ajuste por conteo: había X, se contaron Y.`). Un conteo igual a la
    existencia se rechaza con `SIN_DIFERENCIA`.
  - Un movimiento no se edita ni se borra: el disparador de la base lo impide y
    aquí no hay rutas para hacerlo. El empleado que registra sale de la sesión,
    no del cuerpo de la petición.
  - Ni los insumos ni los proveedores se borran. Un insumo se desactiva y un
    proveedor inactivo conserva sus compras, pero no se puede usar en una
    entrada nueva.
  - Los nombres repetidos se rechazan sin distinguir mayúsculas ni tildes
    (migración `012`).
- **Cliente** (`paginas/Inventario.tsx`, `paginas/inventario/ModalInsumo.tsx`,
  `ModalProveedor.tsx`, `ModalMovimiento.tsx`, `api/inventario.ts`,
  `utilidades/formato.ts`):
  - **Existencias**: existencia por punto o suma de todos, búsqueda por nombre,
    aviso de los insumos bajo el mínimo y su estado.
  - **Movimientos**: historial con los tres tipos y su signo, filtrable por
    insumo, con fecha y hora.
  - **Insumos y proveedores**: solo con `ADMINISTRAR_INSUMOS`. Alta y edición de
    insumos y proveedores; un insumo con movimientos no cambia de unidad.
  - **Registrar movimiento**: entrada (proveedor obligatorio), salida (cantidad
    positiva, el servidor la guarda negativa) y ajuste por conteo (se escribe lo
    contado y el servidor calcula la diferencia). La existencia actual se muestra
    en el ajuste.
  - Después de cada acción se vuelven a pedir las listas al servidor. Si la
    acción falla, el mensaje del servidor se queda dentro de la ventana o en la
    pantalla.
  - `formatearCantidad` y `formatearCantidadConSigno` muestran las cantidades
    sin ceros de relleno; `formatearFechaHora` muestra un instante.
- **Navegación y permisos**:
  - `/inventario` dejó de ser "en construcción". La tarjeta dice **Disponible**
    y usa el rótulo `M08 · Inventario`.
  - La tarjeta y la ruta piden `VER_EXISTENCIAS` (dueño, gerente, cocina y
    almacén). Los controles de mover piden `MOVER_INVENTARIO` y los de
    administrar, `ADMINISTRAR_INSUMOS`. El servidor vuelve a comprobar cada
    permiso.
  - La cocina solo tiene `VER_EXISTENCIAS`: consulta el historial y recibe un
    aviso honesto de que no puede registrar. Los proveedores se cargan solo si
    el rol puede mover o administrar.

#### Qué se probó

Ejecutado en este equipo el 19 de octubre de 2026.

| Comprobación | Archivo | Resultado |
|---|---|---|
| API: permisos, insumos, proveedores, movimientos, ajustes, concurrencia, inmutabilidad | `servidor/pruebas/inventario.integracion.test.js` | **21 de 21** |
| Regla RN-14 con diferencia negativa directa en la base | `servidor/pruebas/reglas-de-negocio.integracion.test.js` | **incluida en 73** |
| Pantalla: existencias, filtros, historial, cocina de solo lectura, entrada, salida sin stock, ajuste, administración de insumos y proveedores, error de carga | `cliente/pruebas/paginas/Inventario.test.tsx` | **10 de 10** |
| Formato de cantidades y fechas | `cliente/pruebas/utilidades/formato.test.ts`, `cliente/pruebas/utilidades/fecha.test.ts` | **4 de 4** |
| Las del servidor siguen pasando | servidor | **270 de 270** (249 anteriores + 21 nuevas) |
| Las del cliente siguen pasando | cliente | **158 de 158** (148 anteriores + 10 nuevas) |
| Todo junto | `npm run verificar` | lint + tipos + **428 pruebas, las 428 pasan** |
| Compilación de producción | `npm run build` | Vite compiló sin errores |

El criterio de salida del módulo, punto por punto:

| Lo que pedía el plan | Cómo se comprobó |
|---|---|
| El flujo completo funciona en el navegador contra la base real | Chrome contra `siga_dp_v2`: se creó un insumo, se registró un ajuste por conteo y la existencia se actualizó; al recargar, el insumo y su existencia volvieron de PostgreSQL. |
| Sobrevive a recargar | Se creó **Prueba manual**, se registró un ajuste de +4 und y se recargó `/inventario`: el insumo y su existencia (4 und) volvieron de la base. |
| Pruebas de API y de interfaz | 21 pruebas de API contra PostgreSQL y 10 nuevas del cliente. |
| Permisos por rol verificados | Sin sesión → 401; el mesero no tiene `VER_EXISTENCIAS` y recibe 403; la cocina ve existencias e historial, pero no mueve ni administra. |
| Los datos no se simulan | Todo se guardó en PostgreSQL. Las listas se refrescan con la respuesta del servidor; no hay insumos ni proveedores de ejemplo en el cliente. |

**Comprobación manual en el navegador** (19 de octubre de 2026), con la API y el
cliente levantados contra `siga_dp_v2`:

1. Ingreso con `gerente` / `gerente` y apertura de `/inventario`: la pantalla
   mostró **0 insumos · todo por encima del mínimo · 1 punto**, con el aviso
   honesto de que no había insumos.
2. En **Insumos y proveedores** se creó **Prueba manual** (Unidad, mínimo 5).
   La tabla y el subtítulo se actualizaron a **1 insumo · 1 por debajo del
   mínimo** y el aviso de bajo mínimo apareció.
3. Se registró un **Ajuste por conteo** de 4 und para **Prueba manual**: el
   mensaje confirmó `+4 und` y la existencia en Almacén quedó en 4 und. La
   tabla mostró **4 und**.
4. Se recargó `/inventario`: el insumo, su mínimo, su existencia (4 und) y el
   historial volvieron de PostgreSQL. La consola del navegador no mostró errores.
5. Se limpió la base de desarrollo con `base:recrear` y se verificó que
   `/inventario` volviera a mostrar **0 insumos**.

#### Qué NO se probó todavía

- **Playwright / extremo a extremo.** Sigue para la Fase 9.
- **Tablet o teléfono.** La revisión fue de escritorio.
- **Roles distintos en el navegador.** La cocina se comprobó en las pruebas de
  API; no se creó una cuenta temporal para repetir el recorrido a mano.
- **Revocación del token y cambio obligatorio de clave.** Siguen igual que en los
  módulos anteriores.

#### Qué queda en la Fase 4

Nada por implementar. El módulo 4 queda pendiente de la revisión del dueño. La
Fase 4 no se cierra hasta que el dueño apruebe el criterio de salida de los
cuatro módulos.

#### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las 428 pruebas
npm run build           # compilación de producción del cliente
npm run dev             # API en 4000 y cliente en 5173

# en el navegador: http://localhost:5173
# usuario: gerente   clave: gerente   →   Inventario
```

#### Cómo comprobarlo

```bash
npm run verificar       # lint + tipos + las 391 pruebas
npm run build           # compilación de producción del cliente
npm run dev             # API en 4000 y cliente en 5173

# en el navegador: http://localhost:5173
# usuario: gerente   clave: gerente   →   Mesas y reservas
```

La base de desarrollo debe tener el salón de la semilla y ninguna reserva de
prueba:

```sql
SELECT z.nombre, z.tipo_ambiente, m.numero, m.capacidad, m.estado
  FROM zona z
  LEFT JOIN mesa m ON m.id_zona = z.id_zona
 ORDER BY z.nombre, m.numero;

SELECT count(*) AS reservas FROM reserva;
```

Debe aparecer **Salón (desarrollo)**, con la **Mesa 1** en **libre**, y
**0 reservas**. Los datos de prueba del recorrido manual no se quedan en la
base.

---

# Fase 5 — Operación del restaurante

La Fase 4 quedó aprobada por el dueño. La Fase 5 empezó el 19 de octubre de
2026 y se construye por módulos: primero Pedidos, después Cocina y al final
Propinas. Cada módulo se prueba contra PostgreSQL de verdad antes de pasar al
siguiente.

## Módulo 1 — Toma de pedido (mesero)

### Qué se hizo

- **Servidor** (`servidor/src/rutas/pedidos.js` y
  `servidor/src/validaciones/pedidos.js`). Siete rutas bajo `/api/pedidos`, todas
  con el permiso `CAPTURAR_PEDIDO` (dueño, gerente, capitán y mesero):
  - `GET /api/pedidos/:mesa`: el pedido abierto de una mesa, con sus líneas y
    las comandas que salieron de él (número, estación, estado y líneas), o
    `null` si la mesa no tiene ninguno. Es el seguimiento que ve el mesero.
  - `GET /api/pedidos`: todos los pedidos abiertos.
  - `POST /api/pedidos/:mesa/abrir`: abre el pedido. Usa `fn_abrir_pedido`, que
    exige la mesa **ocupada**; si no lo está, responde
    `409 CONFLICTO_DE_ESTADO` con un mensaje entendible.
  - `POST /api/pedidos/:mesa/lineas`: agrega una línea con producto, cantidad,
    comensal y observación. El nombre y el precio se copian del producto
    (RN-02).
  - `PATCH /api/pedidos/lineas/:id`: cambia cantidad u observación mientras la
    línea siga `Guardada`.
  - `DELETE /api/pedidos/lineas/:id`: anula la línea con un motivo; no la borra.
  - `POST /api/pedidos/:mesa/enviar`: agrupa las líneas `Guardada` por la
    estación de su producto, crea una `comanda` por estación con sus
    `linea_comanda`, y marca las líneas como `Enviada`. Lo ya enviado no se
    vuelve a mandar.
- **Cliente** (`cliente/src/paginas/Pedidos.tsx` y
  `cliente/src/api/pedidos.ts`). La pantalla permite elegir la mesa, abrir el
  pedido, agregar líneas, anular las que siguen guardadas y enviar a cocina.
  Después de cada acción vuelve a pedir el pedido al servidor; no guarda una
  copia propia de la verdad. Cuando ya hay comandas, muestra la sección
  **Seguimiento en cocina** con el estado de cada una.
- **Un arreglo de permisos necesario.** La pantalla necesita el catálogo, pero
  `GET /api/productos` exige `ADMINISTRAR_PRODUCTOS`, que el mesero no tiene. Se
  agregó `GET /api/productos/disponibles` con `VER_DISPONIBILIDAD`, que es la
  operación que la matriz le da al mesero para consultar qué hay. Solo devuelve
  productos activos y disponibles; la lista de administración conservó su
  permiso. Sin este arreglo, el mesero habría recibido 403 al abrir Pedidos.

### Qué se probó

| Qué | Cómo | Resultado |
|---|---|---|
| Permisos de Pedidos | 2 pruebas de API con cuentas reales de gerente y mesero | Sin sesión 401; el rol sin `CAPTURAR_PEDIDO` 403; el mesero sí puede |
| Abrir en mesa libre y ocupada | Pruebas de API | La libre se rechaza con 409; la ocupada abre |
| Agregar una línea | Prueba de API | Copia nombre y precio, guarda comensal y observación |
| Enviar a cocina | Prueba de API | Crea las comandas por estación y deja las líneas `Enviada` |
| Enviar sin nada pendiente | Prueba de API | Responde 409, no inventa una comanda vacía |
| La pantalla de Pedidos | 9 pruebas de interfaz con la API sustituida | Abre, agrega, anula, envía, muestra el seguimiento, muestra errores y pide `/api/productos/disponibles` |
| El mesero puede ver el catálogo | 2 pruebas de API nuevas en Productos | `/api/productos/disponibles` responde 200; `/api/productos` sigue en 403 |

### Verificación manual

El recorrido se hizo contra la base de desarrollo, no contra dobles:

1. Sesión como `gerente`, mesa 1 libre.
2. Mesa 1 a `ocupada` con 2 personas.
3. Pedido abierto en la mesa 1.
4. `GET /api/productos/disponibles` devolvió 2 productos.
5. Línea agregada (producto 1, cantidad 2, comensal 1, observación
   `prueba manual`).
6. Envío: se creó la comanda **1041** en la estación **Cocina**.
7. El pedido siguió `Abierto` y la línea quedó `Enviada`.
8. La cocina vio la comanda `Pendiente` con su línea.
9. `iniciar` la dejó `En preparación`.
10. `preparar` la dejó `Preparado`, con `hora_preparado` en la línea.
11. Al recargar la lista, la comanda siguió `Preparado`: el dato está en la base.

En el navegador (cliente en `localhost:5173`, API en `localhost:4000`), con la
sesión del gerente:

- `/pedidos` mostró el pedido #1 de la mesa 1, el mesero, la línea con cantidad,
  precio, comensal, observación y estado `Enviada`.
- `/cocina` mostró la comanda 1041, su mesa, su estación y sus líneas, con el
  estado `Preparado` y el aviso **Lista para servir**.

Después del recorrido se corrió `npm run base:recrear`, así que las dos bases
quedaron limpias y con el usuario `gerente` / `gerente`.

## Módulo 2 — Cocina y estaciones

### Qué se hizo

- **Servidor** (`servidor/src/rutas/cocina.js` y
  `servidor/src/validaciones/cocina.js`). Cuatro rutas, todas con
  `CONFIRMAR_PREPARACION` (dueño, gerente y cocina):
  - `GET /api/cocina/estaciones`: las estaciones y cuántas comandas pendientes o
    en preparación tiene cada una.
  - `GET /api/cocina/comandas`: las comandas activas (`Pendiente`, `En
    preparación` y `Preparado`), con mesa, mesero, estación y líneas; se pueden
    filtrar con `?estacion=`.
  - `POST /api/cocina/comandas/:id/iniciar`: pasa la comanda de `Pendiente` a
    `En preparación` y sella `iniciada_en` y `hora_inicio` de cada línea.
  - `POST /api/cocina/comandas/:id/preparar`: pasa de `En preparación` a
    `Preparado` y sella `hora_preparado` de cada línea.
- **El avance no se puede saltar ni repetir.** La comanda se lee con
  `FOR UPDATE` dentro de una transacción; si el estado no es el esperado,
  responde `409 CONFLICTO_DE_ESTADO`. Así dos pantallas de cocina no pueden
  mover la misma comanda a la vez.
- **Rastro.** Cada cambio escribe una fila en `historial_linea` con el empleado
  de la sesión (`req.sesion.idEmpleado`), no con un empleado inventado.
- **Cliente** (`cliente/src/paginas/Cocina.tsx` y `cliente/src/api/cocina.ts`).
  Tablero con filtro por estación, tarjetas por comanda, botones **Empezar** y
  **Listo**, y el aviso **Lista para servir**. Los botones solo aparecen con
  `CONFIRMAR_PREPARACION`; el servidor vuelve a comprobarlo.
- **La operación 28: reportar agotado y reponer.** El plan del módulo pedía
  "reportar agotado" y "reposición", pero la matriz original no tenía una
  operación para eso. El dueño la aprobó el 19 de octubre de 2026 como
  `REPORTAR_AGOTADO`, para dueño, gerente y cocina, y la cargó la migración
  `014`. Es una sola operación: `disponible = false` para agotar y
  `disponible = true` para reponer.
- **Servidor de disponibilidad** (`servidor/src/rutas/cocina.js`):
  - `GET /api/cocina/productos`: los productos activos, estén disponibles o
    agotados. Los agotados se devuelven a propósito, para poder reponerlos.
  - `PATCH /api/cocina/productos/:id/disponibilidad`: recibe `{disponible:
    true|false}`, bloquea el producto con `FOR UPDATE`, rechaza los inactivos
    (`409 PRODUCTO_INACTIVO`) y los inexistentes (`404 NO_ENCONTRADO`).
- **Cliente de disponibilidad.** La pantalla de Cocina tiene dos pestañas:
  **Comandas** y **Disponibilidad**. La segunda lista los productos con su
  estado, permite buscar y tiene un botón **Marcar agotado** o **Reponer**. Solo
  aparece con `REPORTAR_AGOTADO`; el servidor lo vuelve a comprobar.
- **Seguimiento del mesero.** El pedido incluye ahora las comandas con su estado
  y sus líneas. Pedidos muestra la sección **Seguimiento en cocina** en cuanto
  el pedido tiene comandas, con el número, la estación, la hora de envío y el
  estado (`Pendiente`, `En preparación` o `Preparado`). No se agregó un permiso
  nuevo: se lee con el mismo `CAPTURAR_PEDIDO` del pedido.

### Qué se probó

| Qué | Cómo | Resultado |
|---|---|---|
| Permisos de Cocina | 3 pruebas de API | Sin sesión 401; mesero 403; cocina 200 |
| Comandas al enviar | Prueba de API | La cocina ve la comanda con mesa, mesero, estación y líneas |
| Filtro por estación | Prueba de API | Solo devuelve la estación pedida; una estación inválida da 400 |
| Estaciones y pendientes | Prueba de API | Cuenta las comandas `Pendiente` y `En preparación` |
| Avance | 2 pruebas de API | `Pendiente` → `En preparación` → `Preparado`, con horas en las líneas |
| Saltos y repeticiones | 2 pruebas de API | Preparar sin empezar y empezar dos veces dan 409 |
| Historial | Prueba de API | Cada paso queda con el empleado de la sesión |
| Comanda inexistente | Prueba de API | 404 |
| Agotado y reposición | 6 pruebas de API | El mesero recibe 403; la cocina marca, ve el agotado en la lista y repone; 400 sin `disponible`, 404 si no existe y 409 si está inactivo |
| Seguimiento del mesero | Prueba de API | `GET /api/pedidos/:mesa` devuelve la comanda en `Pendiente`, luego `En preparación` y luego `Preparado` |
| La pantalla de Cocina | 13 pruebas de interfaz con la API sustituida | Lista, filtra, avanza, marca agotado, repone, muestra errores, oculta lo que no tiene permiso y refresca |
| El seguimiento en Pedidos | Prueba de interfaz | Después de enviar, aparece la comanda con su estación y su estado |

### Qué no se probó todavía

- **No hay pruebas de extremo a extremo con navegador real** (Playwright). Eso
  es la Fase 9. La verificación de esta fase fue manual, con el navegador
  abierto, y quedó registrada arriba.
- **No se probó en tableta ni en teléfono.** La cocina suele usar tablet; el
  diseño es responsivo, pero no se midió en un dispositivo real.
- **No se probó con una cuenta real de cocina en el navegador.** El recorrido
  manual usó la cuenta de gerente, que también tiene `CONFIRMAR_PREPARACION`.
  Los permisos de cocina y mesero sí están cubiertos por las pruebas de API con
  cuentas creadas para eso.
- **No se probó la revocación de un token** ni el cambio forzado de clave; son
  deudas anteriores, no de este módulo.
- **No se probó el cambio de disponibilidad con una cuenta real de cocina en el
  navegador.** El recorrido manual de la fase usó gerente, que también tiene
  `REPORTAR_AGOTADO`. El permiso de cocina y el 403 del mesero sí están cubiertos
  por las pruebas de API.

### Estado de las pruebas

- Servidor: **299 pruebas**, todas contra PostgreSQL de verdad.
- Cliente: **180 pruebas** con Vitest y Testing Library.
- Total: **479 pruebas**.
- `npm run lint`, `npm --workspace cliente run tipos` y `npm run build` pasan.
- Las suites completas se corren por separado. Correr la del servidor y la del
  cliente al mismo tiempo en este equipo las hizo fallar por contención, no por
  una prueba rota: por separado pasan las 299 y las 180.
- Después de aprobar la operación 28 se volvió a correr la matriz: **8 roles ×
  28 operaciones = 224 casillas**, **93 marcadas**, y la tabla del documento
  coincide con la base.

## Módulo 3 — Propinas

### Qué se hizo

- **Servidor** (`servidor/src/rutas/propinas.js` y
  `servidor/src/validaciones/propinas.js`). Cuatro rutas:
  - `GET /api/propinas` (`REGISTRAR_PROPINA`): las mesas que la persona abrió hoy,
    con su propina si ya la registró, sus propinas del día y el total.
  - `POST /api/propinas` (`REGISTRAR_PROPINA`): registra una propina con **mesa
    explícita**, monto, forma y referencia cuando es tarjeta. La mesa no tiene
    valor por defecto; sin mesa, la validación responde 400.
  - `GET /api/propinas/cierre` (`CERRAR_PROPINAS`): lo esperado por cada empleado
    que tiene propinas hoy, lo contado, la diferencia y quién cerró.
  - `POST /api/propinas/cierre` (`CERRAR_PROPINAS`): cierra las propinas de un
    empleado. Solo acepta propinas de hoy y rechaza un segundo cierre del mismo
    empleado y fecha (`409 CONFLICTO_DE_ESTADO`).
- **RN-03 y RN-04 en el servidor.** El empleado de la propina se copia del pedido
  (`pedido.id_mesero`), no de lo que mande el cliente. Solo se permite registrar
  sobre una mesa cuyo pedido de hoy abrió la persona de la sesión; otro empleado
  recibe `403 SIN_PERMISO`. Una propina por empleado, mesa y día; la segunda
  intentona responde 409. La comprobación está en el servidor; la pantalla
  esconde las mesas ajenas, pero eso no es la seguridad.
- **Formas de pago.** Mientras las decisiones 9 y 11 del documento de reglas
  sigan pendientes, la API y la pantalla solo ofrecen **Efectivo** y **Tarjeta**.
  No se inventó PayPal ni el registro en mesas ajenas. Con tarjeta, la referencia
  es obligatoria (Zod, base y mensaje en la pantalla).
- **Cierre con autor (migración `015`).** La versión original de
  `fn_cerrar_propinas` no guardaba quién cerraba. No se editó la migración ya
  aplicada: se agregó
  `015_cierre_propinas_con_autor.sql`, con una versión de cuatro argumentos que
  recibe `p_cerrado_por` y compara la fecha en `America/Santo_Domingo`. La versión
  de tres argumentos se conserva por compatibilidad; la API usa la de cuatro.
  La migración se aplicó a la base de desarrollo y a la de pruebas.
- **Cliente** (`cliente/src/paginas/Propinas.tsx` y
  `cliente/src/api/propinas.ts`). La pestaña **Registrar** tiene el desplegable de
  mesa empezando en `""` (sin valor por defecto), monto, forma de pago y
  referencia condicional. Después de registrar usa el resumen que devolvió el
  servidor. La pestaña **Cierre del día** solo aparece con `CERRAR_PROPINAS`;
  muestra lo esperado, recibe lo contado, pide confirmación y pinta el cierre
  oficial de la base. La diferencia que se ve antes de cerrar es solo una vista
  previa; la oficial la calcula PostgreSQL.
- **Módulo habilitado.** `cliente/src/modulos.ts` ahora pide
  `REGISTRAR_PROPINA` y marca Propinas como disponible; `App.tsx` registra
  `/propinas`. El mesero ve Pedidos y Propinas, no Cocina ni el cierre.

### Qué se probó

| Qué | Cómo | Resultado |
|---|---|---|
| Permisos de Propinas | 4 pruebas de API | Sin sesión 401; cajero sin `REGISTRAR_PROPINA` 403; mesero sin `CERRAR_PROPINAS` 403; capitán ve el cierre |
| Mesas propias | Prueba de API | El mesero solo ve las mesas que abrió hoy |
| Registro en efectivo | Prueba de API | Guarda monto, forma y mesa; el resumen sale de PostgreSQL |
| Tarjeta | 2 pruebas de API | Con referencia guarda; sin referencia 400 y no guarda |
| Mesa ajena | Prueba de API | `403 SIN_PERMISO`; no se puede saltar desde el cliente |
| Propina repetida | Prueba de API | `409 CONFLICTO_DE_ESTADO` (RN-04) |
| Mesa obligatoria y monto | 3 pruebas de API | Sin mesa 400; monto cero 400; mesa inexistente 404 |
| Dos meseros en la misma mesa | Prueba de API | La base lo permite si cada uno tuvo su pedido hoy; queda escrita la contradicción de la decisión 11 |
| Cierre | 6 pruebas de API | Lista lo esperado; cierra y guarda el autor; acepta contado cero y anota el faltante; rechaza segundo cierre, empleado sin propinas y contado con más de dos decimales |
| Función de cierre | Prueba de la base | La versión de cuatro argumentos guarda `id_cerrado_por` y la fecha del negocio |
| La pantalla de Propinas | 12 pruebas de interfaz con la API sustituida | Mesa sin valor por defecto, solo mesas libres, registro en efectivo y tarjeta, referencia obligatoria, rechazo del servidor, sin mesas, error de carga, Refrescar, cierre visible solo con permiso, confirmación, contado inválido y cierre rechazado |
| El módulo en el menú | Pruebas de módulos y de App | El mesero ve Pedidos y Propinas; el gerente ve las 7 pantallas disponibles |

### Verificación manual

El recorrido se hizo en el navegador contra la base de desarrollo, no contra
dobles:

1. Sesión como `gerente`; mesa 1 libre.
2. Mesa 1 a `ocupada` con 2 personas desde **Mesas y reservas**.
3. Pedido abierto en la mesa 1 desde **Pedidos**.
4. `/propinas` mostró **Registrar** y **Cierre del día** (el gerente tiene los dos
   permisos), el desplegable de mesa vacío y la mesa 1 como única opción.
5. Se registró una propina de **RD$ 50.00** en **Efectivo**. Apareció el aviso
   `Propina de la mesa 1 registrada.` y el total pasó a **RD$ 50.00**.
6. Se recargó la página: la mesa 1 siguió **Registrada**, el total siguió en
   **RD$ 50.00** y el formulario ya no ofreció esa mesa.
7. **Cierre del día** mostró esperado **RD$ 50.00**, contado **RD$ 0.00** y el
   renglón del gerente en **Abierto**.
8. Se escribió **50.00** como contado, se confirmó el cierre y quedó
   **Cerrado** con `Gerente de desarrollo · 19/10/2026 23:22`; la diferencia fue
   **RD$ 0.00**.
9. En PostgreSQL quedaron la fila de `propina` (50.00, Efectivo) y la de
   `cierre_propina` (esperado 50.00, contado 50.00, diferencia 0.00, cerrado por
   el gerente). Se comprobó con una consulta directa, no con la pantalla.

Después del recorrido se corrió `npm run base:recrear`, así que las dos bases
quedaron limpias y con el usuario `gerente` / `gerente`.

### Qué no se probó todavía

- **No hay pruebas de extremo a extremo con navegador real** (Playwright). Eso es
  la Fase 9. La verificación de este módulo fue manual y quedó registrada arriba.
- **No se probó en tableta ni en teléfono.**
- **No se probó con una cuenta real de mesero en el navegador.** El recorrido
  manual usó gerente, que tiene los dos permisos. El 403 del mesero al abrir el
  cierre y el 403 del cajero al registrar sí están cubiertos por las pruebas de
  API con cuentas creadas para eso.
- **No se ofreció PayPal**, porque la decisión 9 sigue pendiente. Tampoco se
  permite registrar en una mesa ajena, porque la decisión 11 sigue pendiente y se
  implementó la regla escrita.
- **No se hizo una prueba de concurrencia** con dos cierres simultáneos. La
  unicidad la garantiza `uq_cierre_empleado_fecha` y el segundo intento recibe
  409, pero no se lanzó una carrera real.

### Estado de las pruebas

- Servidor: **440 pruebas**, todas contra PostgreSQL de verdad.
- Cliente: **210 pruebas** con Vitest y Testing Library.
- Total: **650 pruebas**.
- `npm run lint`, `npm --workspace cliente run tipos` y `npm run build` pasan.
- Las suites completas se corren por separado. Correr la del servidor y la del
  cliente al mismo tiempo en este equipo las hizo fallar por contención, no por
  una prueba rota: por separado pasan las 320 y las 192.
- La matriz de permisos sigue en **8 roles × 28 operaciones = 224 casillas**,
  **92 marcadas**, y coincide con la base.

## Cierre de la Fase 5

Los tres módulos de la Fase 5 —Pedidos, Cocina y Propinas— están construidos,
probados y verificados a mano. **La fase queda lista para la revisión del dueño;
no se da por cerrada hasta que él la apruebe.** Para cerrarla falta:

1. Que el dueño revise el recorrido completo mesero → cocina → listo y el
   registro y cierre de propinas.
2. Que confirme las decisiones **9** (referencia de PayPal) y **11** (quién puede
   registrar la propina). Hoy el sistema implementa la regla escrita y no ofrece
   PayPal, para no inventar negocio.
3. Que se decida si se corrige la contradicción de RN-04 en la base (el índice
   permite dos meseros en la misma mesa) o se deja como está y se cambia la
   comprobación del servidor.


## Fase 6 - Caja y fiscalidad

### Módulo 1 - Cuentas: cuenta y detalle (en progreso)

Construido y verificado:

- Servidor: GET /api/cuentas, GET /api/cuentas/:mesa y
  POST /api/cuentas/:mesa/generar, bajo GENERAR_CUENTA. El total sale de
  n_total_cuenta en PostgreSQL, sin recalcular en JavaScript.
- La generación es idempotente (RN-05): si ya hay cuenta abierta, se devuelve
  la que existe. Bloquea la mesa para evitar dos cuentas a la vez.
- Si el pedido tiene líneas sin enviar, la ruta responde 409
  CONFLICTO_DE_ESTADO y no crea cuenta. Lo mismo si no hay consumo enviado.
- La cuenta copia solo las líneas enviadas y no anuladas; las anuladas no entran.
- Al generar se cierra el pedido y la mesa queda en Cuenta pedida.
- Cliente: cliente/src/api/cuentas.ts y cliente/src/paginas/Cuentas.tsx,
  con lista de mesas por facturar, lista de cuentas abiertas y detalle con
  líneas y total. La pantalla no ofrece cobro, descuentos ni comprobantes: son
  módulos posteriores.
- Módulo habilitado en modulos.ts con GENERAR_CUENTA y marcado disponible.
  El mesero no lo ve; el cajero, el capitán, el gerente y el dueño sí.

Pruebas:

- Servidor: 18 pruebas nuevas en cuentas.integracion.test.js; las 338 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: 9 pruebas nuevas en Cuentas.test.tsx; las 201 del cliente pasan.
- Total actual: 539 pruebas.
- `npm run lint`, `npm run tipos` y `npm run build` pasan.

Decisión 5: la ruta responde 409 si hay líneas sin enviar. La función
`fn_generar_cuenta` de la base sigue generando una cuenta de RD$ 0 si se llama
directamente; queda pendiente decidir si se corrige ahí o se deja así.

No se probó todavía en el navegador contra la base de desarrollo para este
módulo: la verificación quedó en las pruebas automatizadas y en la revisión del
dueño.

### Módulo 2 - Descuentos y cortesías (en progreso)

Construido y verificado:

- Servidor: POST /api/cuentas/:mesa/descuentos (APLICAR_DESCUENTO) y
  POST /api/cuentas/:mesa/cortesias (APLICAR_CORTESIA). Ambas en
  transacción, con el total recalculado por n_total_cuenta.
- El descuento no puede pasar del 10 % del total de la cuenta. La cortesía no
  puede superar el total.
- La cortesía queda marcada en cuenta.cortesia y solo el dueño la aplica
  (migración 016 revoca APLICAR_CORTESIA al gerente).
- El detalle de la cuenta ahora incluye los descuentos aplicados.
- Cliente: formularios en el detalle de la cuenta, visibles según el permiso.

Pruebas:

- Servidor: 7 pruebas nuevas en cuentas.integracion.test.js; las 345 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 546 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Módulo 3 - División por persona (en progreso)

Construido y verificado:

- Servidor: POST /api/cuentas/:mesa/asignaciones (DIVIDIR_CUENTA), que
  asigna una línea de la cuenta a un comensal, con monto opcional. El detalle
  devuelve la suma asignada por comensal.
- Cliente: sección "División por persona" en el detalle, con tabla de totales
  por comensal y formulario para asignar una línea (solo con DIVIDIR_CUENTA).

Pruebas:

- Servidor: 6 pruebas nuevas en cuentas.integracion.test.js; las 351 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 552 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Módulo 4 - Cobro (en progreso)

Construido y verificado:

- Servidor: POST /api/cuentas/:mesa/cobrar (REGISTRAR_PAGO), con forma
  Efectivo, Tarjeta, PayPal o Crédito. Usa n_cobrar_cuenta, calcula el
  cambio, registra el pago y deja la cuenta en Pagada.
- Un mesero no puede cobrar una cuenta que él mismo abrió (403).
- Con tarjeta o PayPal la referencia es obligatoria.
- Cliente: formulario de cobro en el detalle de la cuenta, visible solo con
  REGISTRAR_PAGO.

Pruebas:

- Servidor: 5 pruebas nuevas en cuentas.integracion.test.js; las 356 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 557 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Módulo 5 - Comprobantes fiscales (en progreso)

Construido y verificado:

- Servidor: POST /api/cuentas/:mesa/comprobantes (EMITIR_COMPROBANTE) emite
  el NCF con n_emitir_comprobante, solo sobre una cuenta pagada y sin
  comprobante previo. POST /api/comprobantes/:ncf/anular anula con
  n_anular_comprobante; el número no se reutiliza.
- Cliente: formulario de emisión en el detalle de la cuenta.

Pruebas:

- Servidor: 5 pruebas nuevas en cuentas.integracion.test.js; las 361 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 562 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Módulo 6 - Corte de caja (en progreso)

Construido y verificado:

- Servidor: GET /api/corte y POST /api/corte/cerrar (REALIZAR_CORTE).
  Usa n_cerrar_corte, recalcula los totales con lo realmente cobrado y guarda
  el efectivo declarado y la diferencia. Solo el dueño reabre un corte cerrado.
- Cliente: pantalla Corte.tsx con resumen del día y formulario de cierre.

Pruebas:

- Servidor: 7 pruebas nuevas en corte.integracion.test.js; las 368 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 569 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Fase 7 - Bitácora (en progreso)

Construido y verificado:

- Servidor: GET /api/bitacora (CONSULTAR_BITACORA), filtrable por fecha,
  acción y tabla. Solo lectura (RN-26).
- Cliente: pantalla Bitacora.tsx con filtros y tabla.

Pruebas:

- Servidor: 4 pruebas nuevas en itacora.integracion.test.js; las 372 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 573 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Fase 7 - Reportes del gerente (en progreso)

Construido y verificado:

- Servidor: GET /api/reportes/ventas, /propinas, /inventario y /agotados
  (CONSULTAR_REPORTES). Todo sale de PostgreSQL.
- Las horas de un producto agotado se calculan con **minutos / 60**, segun
  decidió el dueno el 20 de octubre de 2026 (decision 3 resuelta). El / 10
  del prototipo quedo atras.
- Cliente: pantalla Reportes.tsx con ventas, propinas, insumos bajo minimo y
  productos agotados.

Pruebas:

- Servidor: 3 pruebas nuevas en eportes.integracion.test.js; las 375 de la
  API pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 576 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

### Fase 8 - Integraciones y asistente (en progreso)

Decisiones del dueno (20 de octubre de 2026): se mantiene PayPal, el asistente
usa Groq y el tiempo estimado vive en cada producto.

Construido y verificado:

- Migracion 017: producto.tiempo_estimado_minutos y la tabla pago_paypal
  (con su indice y su rastro en la bitacora).
- servidor/src/servicios/paypal.js: la API real de PayPal (sandbox o
  produccion). Sin simulador: sin credenciales avisa que falta la configuracion.
- servidor/src/servicios/asistente.js: Groq. El modelo elige el plato y el
  motivo; el precio y los minutos SIEMPRE salen del catalogo. Si el modelo
  inventa un plato, se descarta; si la API no responde, se avisa y se usan los
  datos del local.
- GET /api/integraciones/estado: revisa cada API externa y dice que falta
  (clave, permisos o formato de respuesta).
- GET /api/asistente/sugerencias/:mesa, POST /api/paypal/pedidos,
  GET /api/paypal/pedidos/:id y POST /api/paypal/pedidos/:id/capturar.
- Cliente: pantalla Integraciones, panel de sugerencias en Pedidos, cobro con
  PayPal en Cuentas y el campo de minutos estimados en Productos.

Pruebas:

- Servidor: 22 pruebas nuevas en integraciones.integracion.test.js (las
  integraciones se prueban aisladas, con un etch de mentira: sin claves, con
  credenciales, con respuesta que no es JSON y sin conexion). Las 397 de la API
  pasan contra PostgreSQL de verdad.
- Cliente: las 201 del cliente pasan.
- Total actual: 598 pruebas.
- 
pm run lint, 
pm run tipos y 
pm run build pasan.

Lo que falta para que las integraciones hablen de verdad: poner
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET y GROQ_API_KEY en
servidor/.env (esta en blanco, con el ejemplo en .env.example).

#### Verificacion real de las integraciones (20 de octubre de 2026)

Con las claves puestas en servidor/.env:

- Diagnostico: PayPal sandbox y el proveedor de IA respondian "listo".
- Asistente: GET /api/asistente/sugerencias/1 respondio origen: "gemini" con
  motivos reales. El precio y los minutos salen del catalogo (los platos de
  desarrollo no tienen tiempo estimado, asi que-sale "null", no un numero
  inventado).
- PayPal: se creo un pedido real en el sandbox (7GF87515N1043930N) para la
  cuenta abierta de la mesa 1, con su enlace de aprobacion, y quedo guardado en
  pago_paypal con estado CREATED. GET /api/paypal/pedidos/:id consulta el
  estado en PayPal de verdad.
- Lo que NO se pudo probar: la captura del pago, porque falta aprobar el pedido
  con una cuenta compradora del sandbox. Y el cambio de divisa: el monto se
  manda tal cual con la moneda de PAYPAL_MONEDA (USD), asi que una cuenta de
  RD$ 496 se pide como 496 USD. Falta decidir con el dueno como se maneja eso.

Correcciones que salieron de esta prueba:

- El modelo por defecto de Gemini era gemini-2.0-flash, que ya no existe; la
  API lo rechazo y el sistema cae en las sugerencias de la base, como debe. El
  cambio posterior a gemini-3.8-flash tampoco era valido; se corrigio a
  gemini-2.5-flash, disponible en la API.
- Las claves estaban en servidor/.env.example (que SI se sube a Git). Se
  movieron a servidor/.env, que esta en el .gitignore.
- Las pruebas de integraciones ahora quitan las claves un momento, para que no
  dependan de lo que haya en el .env de la maquina ni gasten tokens.

#### Correccion del cobro: el cambio ya descuenta la propina (Fase 6)

Al revisar el campo "Recibido" del cobro aparecieron dos problemas reales:

1. La funcion n_cobrar_cuenta comparaba el efectivo recibido solo con el total
   de la cuenta. Con propina, el cambio salia con la propina metida adentro: el
   cajero devolvia de menos. La migracion **018** la reemplaza (una migracion
   aplicada no se edita): ahora lo que hay que cobrar es el total MAS la
   propina.
2. Con tarjeta, PayPal o credito, el monto cobrado era el que escribia el
   cajero (a veces 0), y una venta asi no contaba en el corte de caja. Ahora el
   servidor cobra el total mas la propina, y el campo "Recibido" solo se usa
   con efectivo.

En la pantalla: "Recibido" aparece unicamente con efectivo, se deja con el
total de la cuenta, y arriba se ve "Total a cobrar" y el "Cambio" en vivo.

Pruebas: 4 nuevas en el servidor (3 de API y 1 de la funcion de la base).
Servidor **401**, cliente **202**, total **603**.

#### PayPal: conversion de divisa y cobro automatico (Fase 8)

Dos cosas que pidio el dueno:

1. **Conversion de divisa.** La migracion **019** agrega
   parametro.tasa_cambio_usd (cuantos pesos vale un dolar). El dueno la escribe
   a mano; el sistema no consulta ninguna API de cambio, para que el cobro no
   dependa de que un servicio externo este respondiendo. La tasa queda
   congelada en el cobro (pago_paypal.tasa_cambio) y el monto en pesos tambien
   (pago_paypal.monto_rd). La semilla de desarrollo deja 60.00 como dato de
   desarrollo, para cambiar por la tasa real. Verificado en el sandbox: una
   cuenta de RD$ 496 se pidio como **US$ 8.27**.

2. **Cobro automatico.** Al elegir PayPal se abre una ventana con la pagina de
   PayPal encima de la pantalla y el sistema empieza a mirar el pedido. Cuando
   el cliente aprueba, el servidor captura el cobro, la cuenta queda Pagada y
   la lista se actualiza sola: no hay que pulsar "Confirmar el pago". Queda el
   boton "Verificar el pago ahora" como respaldo. El pago se registra en la
   base en PESOS (el total de la cuenta), no en dolares.

Pruebas: 3 nuevas en el servidor (conversion, falta de tasa y el resto del
paquete) y 1 en el cliente (ventana, espera y cuenta pagada sola).
Servidor **403**, cliente **203**, total **606**.

#### Facturacion electronica y webhook de PayPal (Fase 8)

Decisiones del dueno (20 de octubre de 2026): el numero electronico REPLACE al
local, la tasa de cambio se escribe en la base y los codigos de forma de pago son
los de la DGII.

Construido y verificado:

- servidor/src/servicios/imecf.js: el cliente de la plataforma. Manda el
  comprobante a POST /api/v1/ecf/send con el encabezado X-API-Key, y consulta
  el estado, el track y el XML.
- servidor/src/servicios/comprobante-fiscal.js: arma el JSON de la factura
  (gravado, impuesto, forma de pago y lineas). NO manda eNCF: el numero lo
  asigna la plataforma.
- servidor/src/servicios/facturacion.js: el camino completo: lee la cuenta
  pagada, arma el JSON, lo manda y guarda el comprobante con el numero fiscal
  real (n_registrar_comprobante_electronico).
- servidor/src/rutas/comprobantes.js: GET /api/comprobantes/:id/estado,
  /track y /xml.
- servidor/src/servicios/pago-paypal.js y servidor/src/rutas/webhooks.js: el
  webhook de PayPal. PRIMERO verifica la firma con PayPal; sin firma valida no
  cobra a nadie. Cuando el pago se completo, cobra la cuenta (en pesos) y emite
  la factura solo, sin que nadie pulse nada.
- Migracion **020**: el numero de la plataforma se respeta, el comprobante
  guarda id de plataforma, trackId, enlace del timbre y estado, y pago_paypal
  guarda el correo del comprador y el cajero que creo el pedido.
- Cliente: la pantalla de Cuentas muestra el numero fiscal, el estado y el
  enlace del timbre, con un boton para consultar el estado.

Pruebas: 17 nuevas del servidor (el JSON de la factura, el cliente de la
plataforma, la base y el camino completo con el webhook). Servidor **420**,
cliente **203**, total **623**.

Lo que falta para probarlo de verdad:

- Poner IMECF_API_KEY en servidor/.env (la clave de la empresa).
- Poner PAYPAL_WEBHOOK_ID y apuntar el webhook de PayPal a una direccion
  publica del servidor, en /api/webhooks/paypal.

#### Descuentos y ofertas, y el chat de Dona Pula (Fase 8)

Lo que pidio el dueno:

- **Un modulo de descuentos y ofertas** donde se crean, editan, activan y
  desactivan. En la pantalla de cobro, quien cobra elige una oferta activa y la
  cuenta se recalcula con ese descuento guardado en la base. **La IA no
  interviene.**
- **El muneco de Dona Pula en una esquina de todas las pantallas**, que abre un
  chat para preguntar por el menu (productos, precios, disponibilidad) y por
  las ventas. El chat solo consulta: no modifica nada, y las ventas solo se le
  enseñan a los roles autorizados (CONSULTAR_REPORTES).

Construido y verificado:

- Migracion **021**: promocion.tipo_valor y promocion.valor, para que una
  oferta sepa cuanto descuenta (porcentaje o monto fijo).
- servidor/src/rutas/ofertas.js: listar, crear, editar, activar y desactivar
  (permiso ADMINISTRAR_PROMOCIONES, el de la gerencia). GET
  /api/ofertas/activas es la que ve el cajero (REGISTRAR_PAGO).
- POST /api/cuentas/:mesa/ofertas: aplica la oferta. El descuento se guarda en
  la tabla descuento y n_total_cuenta recalcula la cuenta sola.
- servidor/src/servicios/chat.js y POST /api/asistente/chat: el modelo
  recibe el menu (y las ventas, solo si el rol tiene permiso) leido de
  PostgreSQL, y redacta la respuesta. Sin permiso, el prompt dice que no hay
  datos de ventas: el modelo ni se entera.
- Cliente: pantalla Ofertas.tsx, el selector de oferta en la pantalla de cobro
  y el componente ChatDoñaPula.tsx (el muneco) en el marco de todas las
  pantallas.

Pruebas: 9 del servidor para las ofertas, 8 para el chat y 3 del cliente para el
muneco. Servidor **440**, cliente **210**, total **650**.

#### Migracion del asistente de Gemini a Groq

- Chat y sugerencias usan el endpoint compatible con OpenAI de Groq. El modelo
  predeterminado es `openai/gpt-oss-120b`; la clave se configura en
  `GROQ_API_KEY` y no se guarda en el repositorio.
- Verificado: API **444/444**, cliente **213/213**, tipos, ESLint y compilación.
  La integración real queda pendiente de confirmar en el entorno del dueño.
- El dueño informó que Groq rechazaba `llama-3.3-70b-versatile` por no existir
  o no estar habilitado. Se cambió al modelo recomendado en la documentación de
  Groq; falta confirmar el chat con la clave del dueño.

#### Correccion del flujo de cobro y comprobantes

- El cobro ahora queda antes de las opciones secundarias, que aparecen
  plegadas; el comprobante fiscal solo se ofrece despues de confirmar el pago.
- Al agregar propina, el efectivo exacto se ajusta automaticamente mientras el
  cajero no lo haya editado. Los datos incompletos se explican antes de llamar
  a la API.
- Verificado: pruebas del cliente **213/213**, tipos, lint y compilacion.

#### El error 500 de la pantalla de Cuentas (20 de octubre de 2026)

Lo que reporto el dueno: al abrir el detalle de una cuenta, la API contestaba
500 y la pantalla se quedaba en blanco.

- **Causa:** el codigo del cobro por comensal (migraciones `022` y `023`) estaba
  escrito en el repositorio, pero **las migraciones no se habian aplicado** en
  la base de desarrollo. Las consultas de la pantalla usaban
  `asignacion_persona.cantidad`, `pago.comensal` y `fn_total_comensal`, que
  todavia no existian. Aplicadas con `npm run base:migrar`.
- **Lo que se reviso ademas** (migracion `024`):
  - Con el cobro por comensal se quito el `UNIQUE` de `pago.id_cuenta` y quedo
    un hueco: dos cobros completos de la misma cuenta pasaban sin que la base
    se quejara. La `024` lo cierra con `uq_pago_cuenta_completo` (un cobro
    completo por cuenta) sin quitar el cobro por comensal.
  - `fn_cobrar_cuenta` y `fn_cobrar_comensal` vuelven a decir "no se puede
    cobrar" (RN-06) cuando la cuenta ya no esta abierta.
  - La propina vuelve a llevar su propia referencia `COBRO-<cuenta>` (RN-28): la
    autorizacion de la tarjeta se queda en el pago.
- **Pruebas ajustadas** al modelo nuevo: un cobro no puede tener dos
  comprobantes fiscales (`uq_comprobante_por_pago`) y una cuenta dividida puede
  tener un comprobante por cobro.
- **Verificado en el navegador:** dividir la cuenta (2 comensales x RD$ 350),
  cobrar la parte de uno, cobrar la del otro (la cuenta se cierra sola) y
  comprobar que a la segunda persona no se le puede cobrar dos veces.
- La regla del cobro por comensal quedo anotada en `docs/reglas-de-negocio.md`
  (decision 24) como **pendiente de confirmacion del dueno**.

#### El chat respondia "Eso no lo se" (20 de octubre de 2026)

- **Causa:** el prompt armaba el menu y las reglas, pero **nunca incluia la
  pregunta**. El modelo no tenia nada que contestarle y se refugiaba en la
  frase que el propio prompt le autorizaba ("eso no lo se"). La pregunta ahora
  va en el prompt, con una prueba que lo vigila.
- **Verificado en vivo** (con la clave real, contra PostgreSQL): "¿Qué precios
  tienen los platos?" responde con el menu y los precios; "¿Cuánto se ha
  cobrado hoy?" responde con el total de las cuentas del dia. Origen: `groq`, en
  un segundo.
- La clave real de Groq estaba pegada en `servidor/.env.example` (que si se sube
  a Git). Se dejo el ejemplo vacio. **Las claves que ya quedaron en el
  historial de Git hay que rotarlas:** PayPal, Groq (antes Gemini) e IMECF.
- **El dueño confirmo las reglas del cobro por comensal** (20 de octubre de
  2026): el total se reparte proporcional a lo que pidio cada comensal y cada
  comensal que paga puede pedir su propio comprobante fiscal. Quedo anotado
  como decision 24 en `docs/reglas-de-negocio.md`.

#### Limpieza del historial de Git (20 de octubre de 2026)
- Las claves reales (PayPal, Gemini, Groq e IMECF) se habian quedado pegadas en
  `servidor/.env.example`, que si se sube a Git. Por decision del dueno se
  limpio la historia local:
  - `git filter-branch` dejo cada variable con su nombre pero sin valor en
    todos los commits (79).
  - Se borraron los respaldos `refs/original`, se expiró el reflog y se hizo
    `git gc --prune=now`.
  - Verificado: `git cat-file --batch-all-objects` no encuentra ninguna clave
    real en ningun objeto del repositorio, ni siquiera en los sueltos.
- El repositorio es local y no tiene remoto, asi que el historial se reescribio
  sin affectar a nadie. **Aun asi hay que rotar las claves**: la de Groq, la de
  PayPal y la de IMECF, y borrar las de Gemini si se van a volver a usar.
- `servidor/.env` (que esta en el `.gitignore`) sigue con las claves que
  funcionan; `servidor/.env.example` es la plantilla y va vacia.

#### El comprobante fiscal que no se dejaba emitir (20 de octubre de 2026)

Lo que reporto el dueno: la pantalla de Cuentas no le dejaba emitir el
comprobante. Eran dos cosas, una en el sistema y otra en la plataforma:

**1. El sistema emitia sobre la cuenta equivocada (arreglado).**

- La ruta de `POST /api/cuentas/:mesa/comprobantes` buscaba "la cuenta de la
  mesa" sin mirar el cobro. Como una mesa puede tener varias cuentas (una por
  cada pedido que se le cobra), el comprobante se iba a la cuenta vieja y
  moría con un 404: "Ese pago no pertenece a la cuenta".
- Ahora la cuenta sale del **pago** que se esta facturando. Hay dos pruebas
  nuevas: una que reproduce el fallo (dos cuentas en la misma mesa) y otra que
  rechaza el comprobante de un pago de otra mesa.
- Ademas: si la emision falla, el comprobante se puede emitir **despues**, sin
  volver a cobrar. El detalle de la cuenta trae sus cobros, y hay una seccion
  "Cobros sin comprobante" (`GET /api/cuentas/comprobantes-pendientes`) con el
  boton para emitir cada uno.

**2. La plataforma de la DGII rechaza todos los documentos (NO es del sistema).**

Evidencia, con la clave real y en el ambiente de pruebas de la plataforma
(`TesteCF`):

- El sistema llega a la plataforma, la plataforma asigna el eNCF y se lo
  devuelve, pero al mandarlo a la DGII esta responde 400. Los documentos quedan
  en `ERROR_AL_ENVIAR_A_DGII` con el mensaje "Request failed with status code
  400" (el detalle del error del upstream no lo devuelve la plataforma).
- Se probaron quince variantes del JSON: con y sin fecha de emision, con
  "Comprador" y con "Adquirente", envio diferido e inmediato, los items con el
  monto gravado y con el monto con impuesto, el payload minimo y un payload
  identico a un ejemplo publico que funciona con otra pasarela. **Todas**
  fallan igual. El problema no esta en lo que manda SIGA-DP.
- Lo que si quedo bien del lado nuestro: el aviso ahora lleva el
  identificador del documento que creo la plataforma (para seguirlo en su
  panel) y el diagnostico de Integraciones consulta la plataforma de verdad y
  dice en que quedo el ultimo comprobante, en vez de "la clave esta puesta".
- **Lo que tiene que hacer el dueno:** revisar la plataforma (certificado y
  sesion con la DGII del ambiente de pruebas para el RNC 131599826). Ningun
  documento se ha emitido de verdad: todos quedaron rechazados y en el
  ambiente de pruebas.

#### Con acceso al panel de la plataforma (20 de octubre de 2026)

El dueno dio acceso al panel de IMECF (la plataforma de la DGII) y se pudo
mirar de cerca. Lo que se averiguo:

- **El panel de la empresa:** INVERSIONES CORDOVA VASQUEZ SRL, RNC 131599826.
  Certificado digital subido y activo, secuencias configuradas, ambiente
  "Pruebas / TesteCF". Panel: "22 enviados, 0 aceptados, 22 rechazados" (al
  final eran 28, todos mios de las pruebas).
- **El JSON del sistema no era el problema:** se mando el ejemplo de la propia
  plataforma (el de "E31 Basico"), el JSON que genera su propio formulario
  visual y el de su ejemplo de restaurante. **Los tres fallan igual.** El
  documento lo crea la plataforma, la plataforma le pone el numero y la DGII
  lo rechaza con 400 sin dar detalle.
- **Lo que si estaba mal en nuestro JSON** (corregido, aunque no era la causa
  del rechazo): las lineas iban con el ITBIS adentro (la plataforma exige
  "Precio unitario SIN ITBIS"), faltaba `TotalITBIS1`, el item iba como bien
  (1) en vez de servicio (2) y se mandaba el bloque de Comprador con el RNC
  vacio. Ahora el JSON sale igual que el que genera la plataforma.
- **Falta lo que hace la plataforma, no el sistema:** en el ambiente de
  certificacion (CerteCF) la plataforma avisaba "No tiene secuencia configurada
  para E32. Vaya a Configuracion > Secuencias para inicializarla". Se
  inicializaron las secuencias en los dos ambientes (Pruebas y Certificacion).
  Despues de eso, el un error que queda es el 400 de la DGII.
- **La cuenta no tiene el plan activado:** la pagina de Suscripcion ofrece
  "Activar Plan - $30/mes" (Stripe). Sin plan, la integracion con la DGII no
  esta completa.
- **Lo que sigue (del dueno, con la ayuda del soporte de la plataforma,
  WhatsApp +1 829-282-7556):** activar el plan y dejar a la empresa
  habilitada ante la DGII en el ambiente que se vaya a usar, con el
  certificado de ese ambiente. El camino que recomienda la plataforma es
  TesteCF -> CerteCF -> Produccion (eCF), que es el unico que genera
  comprobantes validos.

#### La causa real: el certificado (20 de octubre de 2026, con el panel abierto)

Con el acceso al panel se reviso el flujo completo que documenta la plataforma
("Flujo Completo", en /docs/api-reference) y el estado de cada empresa:

| Paso de la documentacion | Estado |
|---|---|
| 1. Empresa con RNC, datos y ambiente | Listo (RNC 131599826, ambiente, direccion, telefono y correo) |
| 2. Certificado .p12 **emitido por la DGII** | Subido por el dueno el 20 de octubre; **la DGII lo rechaza** |
| 3. Secuencias eNCF | Inicializadas E31 a E47 en Pruebas y en Certificacion |
| 4. Suscripcion ($30/mes) | Sin activar (la plataforma tiene el boton) |
| 5. API Key | La que usa el sistema (activa) |
| 6. Enviar documentos | El sistema los manda con el JSON que pide la plataforma |

- **La prueba de que el problema no es el sistema ni la plataforma:** la misma
  plataforma, con la empresa **UTESA** (RNC 132907401), tiene **694
  comprobantes aceptados** (73 % de exito) con el certificado que subio Ivan
  Mendoza el 29 de mayo. El codigo es el mismo; lo unico que cambia es el
  certificado (y el alta de la empresa ante la DGII).
- **Se probaron los dos ambientes** con el certificado actual (Pruebas y
  Certificacion): la DGII responde 400 en los dos. El error de la DGII no
  distingue el motivo, asi que lo unico que se puede decir es que la firma no
  la acepto: el .p12 no es el que la DGII emitio para el RNC 131599826 en ese
  ambiente, o la empresa no esta habilitada ante la DGII todavia.
- **El certificado era de relleno (20 de octubre de 2026, la causa de raiz).** El
  `.p12` que el dueno subio al panel ("certificado_dona_paula.p12", con su
  `cert.crt` al lado) tiene este sujeto:
  `CN=Dona Paula (Sin Certificado Activo), O=Dona Paula SRL`. Ese es el
  certificado de relleno que entrega el portal de la DGII cuando se descarga el
  `.p12` **antes de activar el certificado** de la empresa: sirve para pruebas
  de manejo, pero la DGII no acepta ninguna firma hecha con el. Por eso la
  plataforma rechazaba los 35 documentos, con el mismo 400, sin importar el JSON.
- **La empresa que hay que usar es "Doña Pula" (RNC 131456789)**, la que creo
  el dueno (ahí el es owner, y por eso se le puede crear la API Key). Quedo
  lista: datos de la empresa, ambiente, las diez secuencias y la API Key nueva
  (creada y puesta en `servidor/.env`). Con la clave de esa empresa, la
  plataforma responde: "No hay certificado activo para esta empresa. Sube un
  certificado .p12 en Configuracion" — o sea, la plataforma ya resuelve bien la
  empresa y solo falta el certificado de verdad.
- **Para que la DGII acepte la firma** hay que completar el proceso de
  certificacion de la empresa ante la DGII (la pagina "Certificacion" del
  panel es la guia de 16 pasos: 1. Registrado, 2. Pruebas de Datos e-CF, ...
  14. Verificacion de Estatus, 16. Delegacion de Roles) y descargar de nuevo
  el `.p12`, que ya sale con el certificado activo. Ese archivo se sube en
  Configuracion > Certificados de la empresa Doña Pula.
- Mientras tanto, la via que ya da comprobantes aceptados es la empresa
  **UTESA** (RNC 132907401), que tiene el certificado activo: sus comprobantes
  salen con Utesa como emisor, tal como el PDF de ejemplo.

#### La prueba definitiva: el certificado (20 de octubre de 2026)

Se comparo el certificado con el que la DGII **ACEPTO** un comprobante (sacado
del `KeyInfo` del XML firmado de un documento aceptado de Utesa) contra el
certificado del asadero:

| | Utesa (aceptado) | El del asadero (rechazado) |
|---|---|---|
| Emisor | `digifirma CA Subordinada 1, O=Cámara de Comercio y Producción de Santo Domingo` | `CN=Dona Paula (Sin Certificado Activo), O=Dona Paula SRL` |
| Firmado por la CCSD | Si | **No (autofirmado)** |
| Identificador del titular | `IDCDO-03105632925` | ninguno |
| Validez | 15/05/2026 - 14/05/2028 | 20/10/2026 - 20/10/2027 |

El `.p12` del asadero es el **certificado de relleno** que entrega la Cámara de
Comercio de Santo Domingo cuando el certificado digital de la empresa todavia no
esta activo (por eso dice "(Sin Certificado Activo)"). La DGII no valida una
firma que no venga de la CCSD, asi que rechaza el documento con 400 aunque el
JSON sea exactamente el mismo que el de un comprobante aceptado (se comparo uno
por uno: los items van sin ITBIS y el impuesto se suma encima, igual que en el
XML aprobado).

**Lo que hay que hacer (del dueno, en la CCSD):** activar el certificado
digital de **INVERSIONES CORDOVA VASQUEZ SRL (RNC 131599826)** y descargar de
nuevo el `.p12` (ese sale ya con el certificado activo y firmado por la CCSD).
Despues:
```
npm run certificados:preparar -- "C:\ruta\certificado.p12" <clave>
```
y se sube en Configuracion > Certificados de la empresa. El sistema no cambia:
la clave, el JSON, las secuencias y el flujo de emision ya estan listos.
- Mientras tanto, el sistema hace lo que puede: el aviso dice que la plataforma
  creo el documento y que la DGII lo rechazo, con el identificador para
  seguirlo en el panel.

#### Rotacion de las claves (20 de octubre de 2026)

Las claves de PayPal, Groq y de la plataforma de facturacion estuvieron
escritas en el historial de Git (en `servidor/.env.example`, que si se sube).
Por eso se rotaron:

- **Plataforma de facturacion (IMECF): rotada.** Se revoco la clave activa
  (la plataforma solo permite una por empresa y pide revocar antes de crear) y
  se creo una nueva, que se escribio directo en `servidor/.env` (sin pasar por
  el chat ni por la terminal). La clave nueva se ve una sola vez, al crearla.
- **Groq y PayPal: falta rotarlas.** Necesitan el ingreso del dueno en sus
  paneles. El procedimiento exacto esta en `docs/rotacion-de-claves.md`.
- **PayPal: el webhook quedo sin registrar.** El tunel de Cloudflare sin cuenta
  cambia de direccion cada vez que se levanta, asi que el webhook apuntando a
  la direccion vieja dejo de servir. Ademas la API de PayPal no deja crear
  webhooks en el sandbox ("The request JSON is not well formed"), asi que hay
  que registrarlo en el panel del desarrollador. Mientras tanto, el pago se
  captura desde la pantalla del cajero, que es el camino normal.
- **Herramienta nueva:** `npm run claves:verificar` llama a cada servicio de
  verdad y dice si la clave sirve y que falta (sin imprimir ninguna clave). La
  pantalla de Integraciones ahora tambien revisa que el webhook de PayPal siga
  registrado.

#### El flujo del comprobante, como lo pidió el dueño (20 de octubre de 2026)

El dueño pidió que la emisión quedara así, y así quedó:

1. **Se cobra la cuenta** (como siempre).
2. **Se pregunta**: "¿Quiere comprobante fiscal?", con dos botones: "Sí, emitir
   comprobante" y "No, gracias". El formulario (tipo, cliente, RNC) no sale
   hasta que dice que sí.
3. **Al emitir**, sale el **visto verde** abajo a la derecha: un círculo con
   un palomita, "Comprobante aprobado" y el número del eNCF ("Enviado a la
   DGII").
4. **A los cinco segundos**, el visto verde desaparece y la pantalla vuelve a
   la lista de cuentas (el detalle se cierra solo).

- Los cobros que quedaron sin comprobante ya no salen como una tabla grande en
  medio de la pantalla: ahora van al final, **plegados**, como "Cobros que
  esperan comprobante (N)". Sirven para recuperar un cobro al que no se le
  emitió comprobante, sin estorbar el flujo normal.
- El comprobante emitido **sale de esa lista** (la lista se vuelve a pedir al
  servidor apenas se emite).
- Pruebas: 3 nuevas del cliente (la pregunta, el "no, gracias" y el visto
  verde con los cinco segundos). Cliente **218/218**.

**Ojo con el visto verde:** sale cuando la plataforma acepta el documento. Con
la plataforma de la DGII todavia rechazando todo (ver arriba), lo que sale es
el aviso del rechazo, que es lo honesto.

- El dueno no sabia si hacia falta y delego la decision ("si hace falta
  agregalo"). Mirando la documentacion de la plataforma, **si hace falta**: la
  plataforma tiene un ejemplo de "E32 para Restaurantes con Propina Legal
  (10 %)" que declara ese cargo aparte, como `MontoImpuestoAdicional`.
- Migracion **025**: el parametro `parametro.propina_legal_porcentaje` (nace en
  **0, apagado**), las columnas `pago.servicio` y `cuenta.servicio`, y las
  funciones `fn_servicio_de_la_cuenta` y `fn_servicio_del_comensal` (el 10 %
  **del gravado**, como en el ejemplo de la plataforma).
- `fn_cobrar_cuenta` y `fn_cobrar_comensal` cobran ese servicio junto con la
  cuenta: si el efectivo no cubre, la base lo rechaza. La pantalla de cobro lo
  muestra aparte ("Incluye RD$ X de servicio (propina legal)") para que el
  cajero no se coma el vuelto.
- El comprobante lo declara como `MontoImpuestoAdicional` y el `MontoTotal` lo
  incluye.
- **Queda apagado** porque activarlo suma un 10 % a cada cuenta y eso es
  decision del dueno (decision 25 en `docs/reglas-de-negocio.md`). Se activa
  con un solo `UPDATE` en `parametro` cuando el dueno lo diga.
- La propina voluntaria al mesero sigue siendo otra cosa: no entra en el
  comprobante.


---

# Reorganización del flujo (R1) — pedir la cuenta

## Hecho en R1

- Migración `027_pedir_la_cuenta.sql`: columna `mesa.cuenta_pedida_en`,
  funciones `fn_pedir_cuenta`, `fn_quitar_cuenta_pedida`, `fn_cerrar_servicio_mesa`
  y disparador `trg_cerrar_servicio_al_pagar`.
- `POST/DELETE /api/pedidos/:mesa/pedir-cuenta` con `CAPTURAR_PEDIDO`.
- `GET /api/cuentas` devuelve `pedidas` (mesas que ya pidieron la cuenta) y
  `porGenerar` (las que todavía no). La cola se refresca sola cada 15 segundos.
- Pedidos: botón "Pedir cuenta" con estado y "Quitar pedido de cuenta".
- Cuentas: sección "Mesas que pidieron la cuenta" antes de "Mesas por facturar".
- Al cobrar una cuenta, la mesa pasa a limpieza sola (trigger).
- Pruebas: 470 API y 222 web en verde; lint, tipos y build en verde.

---

# Reorganización del flujo (R4) — Salón para mesero, capitán y cajero

## Hecho en R4

- `/mesas` ahora exige `VER_MESAS` en vez de `GESTIONAR_RESERVA`, así mesero,
  capitán, cajero y anfitrión pueden entrar al salón.
- La pestaña y las acciones de reservas solo aparecen para quien tiene
  `GESTIONAR_RESERVA`; "Zonas y mesas" solo para administración.
- Mesero y capitán siguen pudiendo ocupar, marcar en limpieza y liberar mesas;
  el cajero entra en modo solo lectura.
- Pruebas web actualizadas: 222 en verde; lint, tipos y build en verde.

---

# Reorganización del flujo (R2) — Inicio y entrada por rol

## Hecho en R2

- Después de entrar, cada rol va a su pantalla de trabajo: mesero, capitán y
  anfitrión al salón; cajero a cuentas; cocina a cocina; gerencia y dueño al
  menú principal.
- Se respeta `desde` si la persona intentó abrir una ruta concreta antes de entrar.
- Inicio sigue mostrando solo los módulos permitidos para el rol.
- Pruebas web: 222 en verde; lint, tipos y build en verde.

---

# Reorganización del flujo (R3) — Cuentas por pasos

## Hecho en R3

- Cobrar con propina ahora exige `REGISTRAR_PROPINA` en el servidor; el campo se oculta
  si el rol no lo tiene.
- La pantalla de Cuentas muestra los pasos del flujo arriba: elegir mesa, generar cuenta,
  cobrar y emitir comprobante.
- Pruebas: 470 API y 222 web en verde; lint, tipos y build en verde.

---

# Reorganización del flujo (R5) — textos, estados y pulido

## Hecho en R5

- Se quitaron códigos internos (M02, M05, M06...) y la etiqueta "Disponible/Fase N"
  de las tarjetas del inicio.
- EnConstruccion ya no muestra la ruta ni el número de fase.
- El estado del pedido pasa a "Enviado" al mandarlo a cocina, y el filtro funciona.
- Se agregó contexto visual ("Pasos" en Cuentas, "Cuenta pedida" en Pedidos).
- Pruebas: 470 API y 222 web en verde; lint, tipos y build en verde.