# SIGA-DP v2 — Sistema de gestión del Asadero Doña Pula

Reconstrucción desde cero del sistema, por fases. Cada fase se prueba y se da por
terminada antes de pasar a la siguiente.

> El plan completo está en **[`docs/plan-por-fases.md`](docs/plan-por-fases.md)**
> y es el contrato de trabajo. Las reglas del negocio están en
> **[`docs/reglas-de-negocio.md`](docs/reglas-de-negocio.md)**.

**Estado actual: Fases 6 y 7 completas.** Caja (6 de 6 módulos) y Reportes/Bitácora
están construidos y probados, pendientes de revisión del dueño. La Fase 5 quedó
completa. En la Fase 5, **Pedidos** permite al mesero abrir el pedido de una mesa ocupada, agregar líneas
con su comensal y observación, anularlas, enviarlas a cocina y seguir el avance
de cada comanda; **Cocina** muestra las comandas por estación, las avanza de
`Pendiente` a `En preparación` y a `Preparado`, y marca productos agotados o los
repone con la operación 28 (`REPORTAR_AGOTADO`); **Propinas** registra la propina
de una mesa que el empleado atendió hoy y permite cerrar el día con lo contado y
su diferencia. Todo se guarda en PostgreSQL y se refresca con lo que devolvió el
servidor, sin datos de ejemplo en el cliente. La interfaz conserva la **identidad
visual del prototipo**: la paleta de Doña Pula, Poppins, el logo y la mascota,
barra lateral oscura y tarjetas de módulo.

---

## 1. Qué hay montado

| Pieza | Tecnología | Dónde |
|---|---|---|
| Interfaz | React 19 + Vite 8 + TypeScript 6 (estricto) + Tailwind 4 | `cliente/` |
| API | Node 22+ + Express 5 | `servidor/` |
| Base de datos | PostgreSQL 13 o superior | `base-de-datos/` (migraciones y semilla) |
| Pruebas del cliente | Vitest + Testing Library | `cliente/pruebas/` |
| Pruebas de la API | Vitest + Supertest, **contra PostgreSQL de verdad** | `servidor/pruebas/` |
| Pruebas de extremo a extremo | Playwright | `e2e/` (vacía, Fase 9) |
| Calidad | ESLint (formato plano) + TypeScript estricto, sin `any` | `eslint.config.js` |

---

## 1.5 Despliegue en Google Cloud

La guía completa está en [`docs/DESPLIEGUE-GCP.md`](docs/DESPLIEGUE-GCP.md).
Resumen:

- La app se despliega como **un solo servicio** en Cloud Run: Express sirve la
  API y el cliente React compilado.
- Cloud Run se configura con `min-instances=0` y `max-instances=2`.
- La base de datos puede ser **Cloud SQL** (≈ USD 10-12/mes, cobra aunque esté
  inactiva) o **Neon Free** (≈ USD 0, con cold start de 1-5 s).
  Con presupuesto ajustado, usa Neon: es la ruta recomendada.
- Los secretos viven en **Secret Manager**; no hay contraseñas en la imagen ni
  en el repositorio.
- Los scripts de PowerShell están en `scripts/`:
  `preparar-gcp.ps1 -SinCloudSql`, `configurar-neon.ps1`, `sembrar-neon.ps1`,
  `desplegar-neon.ps1`, `verificar-servicio.ps1`.
  Para Cloud SQL: `crear-cloudsql.ps1` y `desplegar.ps1`.
- Si el remoto actual no responde, `crear-repo-github.ps1` crea un repositorio
  nuevo y sube el historial.

Ruta rápida con Neon (0 USD/mes):

```powershell
gcloud auth login
.\scripts\preparar-gcp.ps1 -ProjectId "TU_PROYECTO" -SinCloudSql -Ejecutar
# Crear el proyecto en https://console.neon.tech y copiar la cadena directa
.\scripts\configurar-neon.ps1 -ProjectId "TU_PROYECTO"
.\scripts\sembrar-neon.ps1 -ProjectId "TU_PROYECTO" -Confirmar
.\scripts\desplegar-neon.ps1 -ProjectId "TU_PROYECTO"
```

> Antes de desplegar, lee `docs/ROTACION-DE-SECRETOS.md`. En el historial de Git
> quedaron credenciales antiguas que deben rotarse.

## 2. Arrancar desde cero en otra computadora

### Requisitos

| Qué | Versión mínima | Cómo se comprueba |
|---|---|---|
| Node.js | 22 (probado con 24) | `node --version` |
| npm | 10 (probado con 11) | `npm --version` |
| Git | cualquiera reciente | `git --version` |
| PostgreSQL | 13 (probado con 18) | `psql --version` |

> PostgreSQL solo hace falta **a partir de la Fase 1** (la actual). Para poder
> correr `npm test` y `npm run base:crear` tiene que estar encendido y con la
> clave puesta en `servidor/.env`.

### Paso 1 — Traer el código

```bash
git clone <url-del-repositorio> siga-dp-v2
cd siga-dp-v2
```

### Paso 2 — Instalar las dependencias

```bash
npm install
```

`npm install` en la raíz instala **los dos espacios de trabajo** (`servidor` y
`cliente`) de una sola vez. No hay que entrar en ninguna subcarpeta.

### Paso 3 — Crear los archivos `.env`

```bash
# En Windows (PowerShell)
Copy-Item servidor/.env.example servidor/.env
Copy-Item cliente/.env.example cliente/.env

# En macOS / Linux
cp servidor/.env.example servidor/.env
cp cliente/.env.example cliente/.env
```

En la Fase 0 los valores de `.env.example` ya funcionan tal cual. A partir de la
Fase 1 hay que poner la clave real de PostgreSQL en `servidor/.env`:

```
BD_CLAVE=la-clave-del-usuario-postgres
```

Aprovecha para generar un secreto de sesión propio:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Paso 4 — Crear la base de datos

```bash
npm run base:crear
```

Esto crea **dos** bases y les aplica las 15 migraciones y la semilla de desarrollo:

| Base | Para qué |
|---|---|
| `siga_dp_v2` | La de trabajo |
| `siga_dp_v2_pruebas` | La de las pruebas automáticas, que se limpia sola |

Es seguro repetirlo: si ya existen, solo aplica lo que falte. Si quieres
empezar de cero otra vez: `npm run base:recrear` (borra y vuelve a crear).

### Paso 5 — Levantar el sistema

```bash
npm run dev
```

Esto abre dos procesos a la vez:

| Proceso | Dirección | Qué es |
|---|---|---|
| API | <http://localhost:4000> | El servidor de Express |
| Cliente | <http://localhost:5173> | La interfaz de Vite |

Comprobación rápida de que la API está viva:

<http://localhost:4000/api/salud> → `{"ok":true,"datos":{"estado":"ok"}}`

Para parar, `Ctrl+C` en la terminal.

> El cliente arranca en la pantalla de entrar. El usuario de desarrollo es
> `gerente` / `gerente` (rol Gerente, con toda la matriz aprobada). Los módulos
> que todavía no existen muestran en qué fase llegan; no fingen funcionar.

#### Si los puertos salen ocupados

`npm run dev` falla con "Port 5173 is already in use" si el **prototipo viejo**
sigue corriendo: usa esos mismos puertos (API 4000, cliente 5173). Apaga el
prototipo antes de levantar la v2.

En Windows, dos procesos pueden quedar escuchando el mismo puerto a la vez sin
avisar, y entonces las peticiones van al que no es. Para comprobar quién tiene el
puerto:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen |
  ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Si necesitas correr la v2 sin apagar el prototipo, se cambian los puertos por
línea de comandos:

```powershell
npm --workspace cliente run dev -- --port 5273
# y en otra terminal, con la API en otro puerto:
$env:PUERTO="4100"; npm --workspace servidor run start
```

Si se cambia el puerto de la API, hay que ajustar `VITE_API_URL` en
`cliente/.env` para que apunte al mismo.

---

## 3. Comandos

Todos se ejecutan desde la raíz del proyecto.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API y el cliente a la vez |
| `npm run dev:api` | Solo la API (con recarga automática) |
| `npm run dev:web` | Solo el cliente |
| `npm test` | Todas las pruebas (API y cliente) |
| `npm run test:api` | Solo las pruebas de la API |
| `npm run test:web` | Solo las pruebas del cliente |
| `npm run lint` | Revisa el código con ESLint |
| `npm run lint:fix` | Lo mismo, corrigiendo lo que se pueda solo |
| `npm run tipos` | Comprueba los tipos TypeScript del cliente |
| `npm run build` | Compila el cliente para entregar |
| `npm run verificar` | `lint` + `tipos` + `test`, todo seguido |

### Base de datos

| Comando | Qué hace |
|---|---|
| `npm run base:crear` | Crea las bases desde cero, migra y carga la semilla |
| `npm run base:recrear` | Borra las bases y las vuelve a crear desde cero |
| `npm run base:migrar` | Aplica solo las migraciones pendientes |
| `npm run base:estado` | Muestra qué migraciones están aplicadas y cuáles faltan |
| `npm run base:semilla` | Carga los datos de desarrollo |

El usuario de desarrollo es `gerente` con la clave `gerente`.

> `npm test` y `npm run test:api` necesitan PostgreSQL encendido: las pruebas
> corren contra una base de datos de prueba de verdad, no contra dobles de prueba.
> Si borras `siga_dp_v2_pruebas`, las pruebas la vuelven a crear solas.

---

## 3.5 Las rutas que ya existen

Todas viven bajo `/api`. Todas responden con el mismo formato:
`{ ok: true, datos }` o `{ ok: false, error: { codigo, mensaje } }`.

| Ruta | Quién puede | Qué hace |
|---|---|---|
| `GET /api/salud` | cualquiera | Dice si el proceso está vivo. No da información interna |
| `POST /api/acceso/entrar` | cualquiera | Recibe usuario y clave, devuelve el token |
| `POST /api/acceso/salir` | con sesión | Cierra la sesión |
| `GET /api/acceso/yo` | con sesión | Quién soy, con mi rol y mis permisos |
| `GET /api/parametros` | permiso `ADMINISTRAR_PARAMETROS` | Los parámetros fiscales |
| `GET /api/personal` | permiso `ADMINISTRAR_PERSONAL` | Empleados, su estado efectivo y los roles que el actor puede asignar |
| `POST /api/personal` | permiso `ADMINISTRAR_PERSONAL` | Crea el empleado y su cuenta en una sola transacción |
| `PATCH /api/personal/:id` | permiso `ADMINISTRAR_PERSONAL` | Edita nombre, teléfono y rol; la cédula y el usuario no cambian |
| `POST /api/personal/:id/baja` | permiso `ADMINISTRAR_PERSONAL` | Da de baja al empleado y a su cuenta |
| `POST /api/personal/:id/reactivar` | permiso `ADMINISTRAR_PERSONAL` | Reactiva al empleado y a su cuenta |
| `POST /api/personal/:id/desbloquear` | permiso `ADMINISTRAR_PERSONAL` | Habilita una cuenta bloqueada y limpia los intentos |
| `POST /api/personal/:id/clave` | permiso `ADMINISTRAR_PERSONAL` | Restablece la clave (mínimo 8 caracteres) |
| `GET /api/productos` | permiso `ADMINISTRAR_PRODUCTOS` | Productos, categorías y estaciones; incluye los inactivos |
| `POST /api/productos` | permiso `ADMINISTRAR_PRODUCTOS` | Crea un producto |
| `PATCH /api/productos/:id` | permiso `ADMINISTRAR_PRODUCTOS` | Edita nombre, precio, categoría o estación |
| `PATCH /api/productos/:id/disponibilidad` | permiso `ADMINISTRAR_PRODUCTOS` | Marca disponible o agotado del día |
| `POST /api/productos/:id/baja` | permiso `ADMINISTRAR_PRODUCTOS` | Saca el producto del catálogo sin borrarlo |
| `POST /api/productos/:id/reactivar` | permiso `ADMINISTRAR_PRODUCTOS` | Devuelve el producto al catálogo |
| `POST /api/productos/categorias` | permiso `ADMINISTRAR_PRODUCTOS` | Crea una categoría |
| `PATCH /api/productos/categorias/:id` | permiso `ADMINISTRAR_PRODUCTOS` | Renombra o activa/desactiva una categoría |
| `POST /api/productos/estaciones` | permiso `ADMINISTRAR_PRODUCTOS` | Crea una estación |
| `PATCH /api/productos/estaciones/:id` | permiso `ADMINISTRAR_PRODUCTOS` | Renombra una estación |
| `GET /api/inventario` | permiso `VER_EXISTENCIAS` | Insumos, puntos, unidades y existencias por punto |
| `GET /api/inventario/movimientos` | permiso `VER_EXISTENCIAS` | Historial de movimientos, filtrable por insumo |
| `GET /api/inventario/proveedores` | permiso `MOVER_INVENTARIO` | Proveedores, activos e inactivos |
| `POST /api/inventario/insumos` | permiso `ADMINISTRAR_INSUMOS` | Crea un insumo |
| `PATCH /api/inventario/insumos/:id` | permiso `ADMINISTRAR_INSUMOS` | Edita nombre, unidad, mínimo o estado |
| `POST /api/inventario/proveedores` | permiso `ADMINISTRAR_INSUMOS` | Crea un proveedor |
| `PATCH /api/inventario/proveedores/:id` | permiso `ADMINISTRAR_INSUMOS` | Edita nombre, teléfono o estado |
| `POST /api/inventario/movimientos` | permiso `MOVER_INVENTARIO` | Registra una entrada, una salida o un ajuste por conteo |
| `GET /api/productos/disponibles` | permiso `VER_DISPONIBILIDAD` | Solo lo que se puede pedir hoy: activo y disponible |
| `GET /api/pedidos` | permiso `CAPTURAR_PEDIDO` | Todos los pedidos abiertos, con sus líneas |
| `GET /api/pedidos/:mesa` | permiso `CAPTURAR_PEDIDO` | El pedido abierto de una mesa, o `null` |
| `POST /api/pedidos/:mesa/abrir` | permiso `CAPTURAR_PEDIDO` | Abre un pedido en una mesa ocupada |
| `POST /api/pedidos/:mesa/lineas` | permiso `CAPTURAR_PEDIDO` | Agrega una línea con producto, cantidad y comensal |
| `PATCH /api/pedidos/lineas/:id` | permiso `CAPTURAR_PEDIDO` | Cambia la cantidad o la observación de una línea |
| `DELETE /api/pedidos/lineas/:id` | permiso `CAPTURAR_PEDIDO` | Anula una línea (no la borra) con su motivo |
| `POST /api/pedidos/:mesa/enviar` | permiso `CAPTURAR_PEDIDO` | Crea una comanda por estación y marca las líneas como enviadas |
| `GET /api/cocina/estaciones` | permiso `CONFIRMAR_PREPARACION` | Estaciones y cuántas comandas pendientes tiene cada una |
| `GET /api/cocina/comandas` | permiso `CONFIRMAR_PREPARACION` | Comandas activas, filtrables por estación |
| `POST /api/cocina/comandas/:id/iniciar` | permiso `CONFIRMAR_PREPARACION` | Pasa la comanda a `En preparación` |
| `POST /api/cocina/comandas/:id/preparar` | permiso `CONFIRMAR_PREPARACION` | Pasa la comanda a `Preparado` |
| `GET /api/cocina/productos` | permiso `REPORTAR_AGOTADO` | Productos activos, disponibles y agotados, para poder reponerlos |
| `PATCH /api/cocina/productos/:id/disponibilidad` | permiso `REPORTAR_AGOTADO` | Marca agotado (`false`) o repone (`true`) un producto |
| `GET /api/propinas` | permiso `REGISTRAR_PROPINA` | Las mesas que abrió el empleado hoy, sus propinas y su total |
| `POST /api/propinas` | permiso `REGISTRAR_PROPINA` | Registra una propina con mesa explícita, monto y forma de pago |
| `GET /api/propinas/cierre` | permiso `CERRAR_PROPINAS` | Lo esperado, lo contado y la diferencia de cada empleado hoy |
| `POST /api/propinas/cierre` | permiso `CERRAR_PROPINAS` | Cierra las propinas de un empleado y guarda quién las cerró |
| `GET /api/cuentas` | permiso `GENERAR_CUENTA` | Cuentas abiertas y mesas con pedido pendientes de cuenta, con sus totales |
| `GET /api/cuentas/:mesa` | permiso `GENERAR_CUENTA` | Detalle de la cuenta abierta de una mesa, o `null` |
| `POST /api/cuentas/:mesa/generar` | permiso `GENERAR_CUENTA` | Genera la cuenta desde el pedido enviado; idempotente |
| `POST /api/cuentas/:mesa/descuentos` | permiso `APLICAR_DESCUENTO` | Aplica un descuento (máximo el 10 % del total) |
| `POST /api/cuentas/:mesa/cortesias` | permiso `APLICAR_CORTESIA` | Aplica una cortesía (solo el dueño) |
| `POST /api/cuentas/:mesa/asignaciones` | permiso `DIVIDIR_CUENTA` | Asigna una línea de la cuenta a un comensal |
| `POST /api/cuentas/:mesa/cobrar` | permiso `REGISTRAR_PAGO` | Cobra la cuenta (efectivo, tarjeta, PayPal o crédito); no puede cobrarla quien la abrió |
| `POST /api/cuentas/:mesa/comprobantes` | permiso `EMITIR_COMPROBANTE` | Emite el comprobante fiscal electrónico (el número lo asigna la plataforma de la DGII) |
| `GET /api/comprobantes/:id/estado` | permiso `EMITIR_COMPROBANTE` | Cómo va el comprobante en la plataforma |
| `GET /api/comprobantes/:id/track` | permiso `EMITIR_COMPROBANTE` | Estado del timbre en la DGII |
| `GET /api/comprobantes/:id/xml` | permiso `EMITIR_COMPROBANTE` | El XML firmado |
| `POST /api/webhooks/paypal` | público (verifica la firma) | Lo que PayPal avisa: cobra y factura solo |
| `POST /api/comprobantes/:ncf/anular` | permiso `EMITIR_COMPROBANTE` | Anula un comprobante emitido (el número no se reutiliza) |
| `GET /api/bitacora` | permiso `CONSULTAR_BITACORA` | Registros de auditoría, filtrables por fecha, acción y tabla |
| `GET /api/reportes/ventas` | permiso `CONSULTAR_REPORTES` | Ventas por día |
| `GET /api/reportes/propinas` | permiso `CONSULTAR_REPORTES` | Propinas por empleado y día |
| `GET /api/reportes/inventario` | permiso `CONSULTAR_REPORTES` | Insumos bajo mínimo |
| `GET /api/reportes/agotados` | permiso `CONSULTAR_REPORTES` | Productos agotados con horas |
| `GET /api/asistente/sugerencias/:mesa` | permiso `VER_ASISTENTE` | Qué platos encajan con lo que pidió la mesa |
| `POST /api/paypal/pedidos` | permiso `REGISTRAR_PAGO` | Crea el pedido de PayPal de una cuenta abierta |
| `GET /api/paypal/pedidos/:id` | permiso `REGISTRAR_PAGO` | En qué estado está el pedido de PayPal |
| `POST /api/paypal/pedidos/:id/capturar` | permiso `REGISTRAR_PAGO` | Captura el pago confirmado y lo registra en la base |
| `GET /api/integraciones/estado` | permiso `ADMINISTRAR_PARAMETROS` | Revisa qué le falta a cada API externa |
| `GET /api/ofertas` | permiso `ADMINISTRAR_PROMOCIONES` | Las ofertas del local |
| `POST /api/ofertas` | permiso `ADMINISTRAR_PROMOCIONES` | Crea una oferta (porcentaje o monto fijo) |
| `PATCH /api/ofertas/:id` | permiso `ADMINISTRAR_PROMOCIONES` | Edita una oferta |
| `POST /api/ofertas/:id/activar` | permiso `ADMINISTRAR_PROMOCIONES` | Activa una oferta |
| `POST /api/ofertas/:id/desactivar` | permiso `ADMINISTRAR_PROMOCIONES` | Desactiva una oferta |
| `GET /api/ofertas/activas` | permiso `REGISTRAR_PAGO` | Las ofertas que el cajero puede aplicar al cobrar |
| `POST /api/cuentas/:mesa/ofertas` | permiso `REGISTRAR_PAGO` | Aplica una oferta a la cuenta (la base recalcula el total) |
| `POST /api/asistente/chat` | con sesión | Pregunta al chat de Doña Pula (solo consulta) |

> En Personal, además del permiso, el servidor comprueba a quién se toca: nadie
> administra a alguien de un nivel superior al suyo, y nadie se da de baja ni se
> cambia el rol a sí mismo. La pantalla deshabilita esos botones, pero la
> seguridad está en el servidor.

> En Productos, la base es la que manda: los nombres repetidos se rechazan sin
> distinguir mayúsculas ni tildes (migración `012`), una categoría con productos
> activos no se puede desactivar y un producto no se puede reactivar mientras su
> categoría esté inactiva. La baja nunca borra: conserva el historial.

> En Pedidos y Cocina, el avance de la comanda es hacia adelante y no se puede
> saltar: `Pendiente` → `En preparación` → `Preparado`. La comanda se bloquea
> mientras se mueve y cada paso queda en `historial_linea` con el empleado de la
> sesión. `GET /api/productos/disponibles` existe para que el mesero consulte qué
> se puede pedir con `VER_DISPONIBILIDAD`, sin darle el permiso de administración
> del catálogo. **"Reportar agotado" y "reposición" ya están**: el dueño aprobó la
> operación 28 como `REPORTAR_AGOTADO` el 19 de octubre de 2026 (migración `014`)
> y se la dio a dueño, gerente y cocina. El pedido incluye además las comandas con
> su estado, para que el mesero vea el avance sin entrar a la pantalla de cocina.

> En Cuentas, el total **no se calcula en JavaScript**: sale de
> `fn_total_cuenta` en PostgreSQL y la pantalla solo lo pinta. La cuenta se genera
> una sola vez por mesa (RN-05); si ya hay una abierta, se devuelve la que existe.
> Si el pedido tiene líneas sin enviar, la ruta responde 409; la función de la base
> genera una cuenta de RD$ 0 en ese caso (decisión 5 pendiente de dónde corregir),
> y mientras se decide la ruta impide que eso llegue a la pantalla. Esta pantalla
> no cobra ni emite comprobantes: son los módulos siguientes de la Fase 6.

> En el cobro, el campo **Recibido** solo aparece con efectivo: es cuánto dio
> el cliente, y de ahí sale el cambio (que ya descuenta la propina). Con tarjeta,
> PayPal o crédito, el sistema cobra el total de la cuenta más la propina.

> En PayPal, se abre una ventana para que el cliente apruebe el pago y la cuenta
> se marca como pagada **sola** en cuanto lo aprueba (sin botón de "confirmar").
> PayPal cobra en dólares: el monto se convierte con la tasa que escribió el
> dueño en `parametro.tasa_cambio_usd` (cuántos pesos vale un dólar) y esa tasa
> queda congelada en el cobro. La venta y el corte de caja siguen en pesos.

> En Descuentos y ofertas, la gerencia crea las ofertas (un porcentaje o un monto
> fijo) y el cajero elige una al cobrar. El descuento se guarda en la base y la
> cuenta se recalcula sola. **La IA no interviene en esto.**
>
> En el chat de Doña Pula (el muñequito de la esquina) se puede preguntar por el
> menú y, si el rol tiene permiso, por las ventas. El chat **solo consulta**: no
> cambia nada, y las ventas solo se le enseñan a la gerencia. Para habilitar la
> IA, configura `GROQ_API_KEY` en `servidor/.env`; crea la clave en
> [Groq Console](https://console.groq.com/keys). No guardes claves en el código.

> En la facturación electrónica, el número fiscal **lo asigna la plataforma de la
> DGII** (no se manda `eNCF` en el JSON), y ese número es el que se guarda y se
> muestra. La venta se sigue guardando en pesos. El webhook de PayPal verifica
> la firma antes de hacer nada: sin la firma válida, no se cobra a nadie.

> En Integraciones, no hay simulador: si falta la clave de PayPal o de Groq, el
> sistema lo dice y no cobra nada. El tiempo estimado de cada plato se escribe
> en **Productos** y el asistente de IA lo toma de ahí, nunca de un número fijo.
>
> Las claves de las integraciones se revisan con un comando, que llama a cada
> servicio de verdad y dice si la clave sirve:
> ```
> npm run claves:verificar
> ```
> Cómo se rota cada clave (y por qué hay que hacerlo) está en
> [`docs/rotacion-de-claves.md`](docs/rotacion-de-claves.md).

> En Reportes, todo sale de PostgreSQL: ventas por día, propinas por empleado,
> insumos bajo mínimo y productos agotados. Las horas de un producto agotado se
> calculan con **minutos / 60**, no con el `/ 10` del prototipo (decisión 3
> resuelta por el dueño el 20 de octubre de 2026).

> En Corte de caja, el corte se cierra con el efectivo declarado y la diferencia
> se calcula contra lo que realmente se cobró. Solo el dueño puede reabrir un corte
> ya cerrado. La fecha es la del negocio (America/Santo_Domingo).

> En Descuentos y cortesías, el descuento no puede pasar del 10 % del total de la
> cuenta y la cortesía no puede superar el total. La cortesía solo la aplica el
> dueño (migración 016). Todo queda en `descuento` con su autorizante y la bitácora
> registra quién lo hizo.

> En Propinas, la mesa **siempre se elige**: no hay un valor por defecto y solo se
> ofrecen las mesas cuya orden abrió hoy la persona que está dentro (RN-04). Una
> mesa no puede repetir propina el mismo día. Con tarjeta, la referencia es
> obligatoria (RN-28). Mientras las decisiones 9 y 11 sigan pendientes, la pantalla
> solo ofrece **Efectivo** y **Tarjeta**, y no se inventa un permiso para registrar
> en mesas ajenas. El cierre guarda quién lo hizo y la hora del negocio (migración
> `015`).

El token se manda en el encabezado, **nunca en la dirección**:

```
Authorization: Bearer <token>
```

Probar el login a mano (con el servidor levantado):

```bash
curl -i -X POST http://localhost:4000/api/acceso/entrar \
     -H "Content-Type: application/json" \
     -d '{"usuario":"gerente","clave":"gerente"}'
```

> **La matriz de permisos ya está cargada** (migraciones `011` y `014`), aprobada
> por el dueño. Son 8 roles × 28 operaciones, con 92 casillas marcadas. La versión
> oficial está en `docs/reglas-de-negocio.md`, sección 4.5, y hay una prueba que
> compara la base contra esa tabla casilla por casilla. Si se pide una operación
> para la que el rol no tiene permiso, la respuesta es 403 `SIN_PERMISO`; si no hay
> sesión, 401.

---

## 4. Trabajar desde Visual Studio Code

Abre **la carpeta `siga-dp-v2`** (no la carpeta que la contiene).

En `.vscode/` hay tareas y configuraciones de depuración listas:

| Tarea (`Ctrl+Shift+B`) | Qué hace |
|---|---|
| Levantar todo (API + cliente) | Arranca los dos procesos |
| Ejecutar las pruebas | `npm test` |
| Ejecutar ESLint | `npm run lint` |
| Comprobar los tipos | `npm run tipos` |

Para depurar con puntos de parada: elige **"Depurar la API"** en el panel de
ejecución y pulsa `F5`.

---

## 5. Estructura del proyecto

```
siga-dp-v2/
├── README.md
├── package.json              # espacios de trabajo y scripts de arriba
├── eslint.config.js
├── docs/
│   ├── plan-por-fases.md     # el contrato de trabajo
│   ├── reglas-de-negocio.md  # RN-01 a RN-28
│   └── progreso.md           # bitácora de avance
├── base-de-datos/
│   ├── migraciones/          # 21 archivos SQL numerados (001 a 021)
│   └── seeds/                # datos mínimos de desarrollo
├── servidor/
│   ├── .env.example
│   ├── vitest.config.js
│   ├── herramientas/         # crear-base, migrar, semilla (línea de comandos)
│   ├── pruebas/              # pruebas contra PostgreSQL de verdad, sin dobles
│   └── src/
│       ├── index.js          # arranca el servidor (y comprueba la base)
│       ├── app.js            # helmet, CORS, límites, manejador de errores
│       ├── errores.js        # ErrorDeApi y asyncHandler
│       ├── respuesta.js      # el formato único de respuesta
│       ├── limites.js        # rate limiting
│       ├── acceso/           # claves, sesión (token), ingreso y permisos
│       ├── rutas/            # una por módulo: acceso, parametros, ...
│       ├── validaciones/     # esquemas Zod
│       └── db/               # conexion.js: consultas y transacciones
├── cliente/
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── pruebas/
│   └── src/
│       ├── main.tsx          # router + proveedor de sesión + App
│       ├── App.tsx           # mapa de rutas
│       ├── modulos.ts        # catálogo de pantallas y el permiso de cada una
│       ├── estilos/
│       ├── api/              # cliente HTTP único y tipado
│       ├── sesion/           # token guardado, contexto y hook de sesión
│       ├── paginas/          # login, inicio, Personal, Productos, Mesas, Inventario, Pedidos, Cocina, Propinas, Cuentas, Corte y Bitácora
│       ├── componentes/      # botón, campo, alerta, tabla, logo, tarjeta, insignia, guarda y marco
│       └── hooks/            # hooks propios (todavía ninguno)
└── e2e/                      # Fase 9: pruebas Playwright
```

---

## 6. Estado por fases

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Preparación del terreno | **Terminada** |
| 1 | Base de datos sólida | **Terminada** (aprobada por el dueño) |
| 2 | Núcleo del servidor | **Terminada** (aprobada por el dueño) |
| 3 | Cliente base | **Terminada** (aprobada por el dueño) |
| 4 | Módulos de gestión | **Terminada** (aprobada por el dueño) |
| 5 | Operación del restaurante | **Terminada** (aprobada por el dueño) |
| 6 | Caja y fiscalidad | **Completa** (6 de 6 módulos), pendiente de revisión del dueño |
| 7 | Reportes y bitácora | **Completa** (Reportes y Bitácora), pendiente de revisión del dueño |
| 8 | Integraciones y asistente de IA | **En progreso** (asistente, PayPal, facturación, ofertas y chat) |
| 9 | Pruebas de extremo a extremo y producción | No empezada |

El detalle de cada fase y sus criterios de salida está en
`docs/plan-por-fases.md`. El avance real, con qué se probó y qué queda pendiente,
está en `docs/progreso.md`.

---

## 7. El prototipo anterior

Está en **`siga-dp-prototipo/`**, congelado y en **solo lectura**. Sirve
únicamente como material de consulta:

- **Se conserva como referencia:** el modelo de datos, las reglas de negocio, y
  el patrón de buen manejo de errores de `PantallaLogin.tsx`.
- **Se descarta:** todos los datos de ejemplo, los valores hardcodeados y todo
  estado local que finja guardar.

Ver `siga-dp-prototipo/LEER-PRIMERO.md` antes de mirarlo.

---

## 8. Las diez reglas de oro

1. **Nada se simula.** Si dice "guardado", PostgreSQL lo confirmó.
2. **Cero datos de ejemplo en el código.** Solo en el seed de desarrollo.
3. **Una fase a la vez**, con sus criterios de salida cumplidos.
4. **Cada funcionalidad nace con su prueba.**
5. **La base de datos es la fuente única de verdad.**
6. **Seguridad desde el primer endpoint.**
7. **Todo error se muestra al usuario**, y todo botón se bloquea mientras procesa.
8. **Si algo no está claro, se pregunta antes de inventar.**
9. **Cambios pequeños y verificables**, un commit por tarea.
10. **Se informa con honestidad:** qué se probó y qué quedó pendiente.

El texto completo está en `docs/plan-por-fases.md`, sección 3.
