# Despliegue de SIGA-DP v2 en Google Cloud

Guía práctica para publicar el sistema en Internet con Cloud Run, Cloud Build,
Artifact Registry y PostgreSQL. Está escrita para ejecutarse desde **Windows
PowerShell**, sin Docker local y sin escribir secretos en el repositorio.

> **Antes de crear cualquier recurso facturable, lee la sección de costes.**
> Cloud Run puede escalar a cero y no cobra CPU inactiva. **Cloud SQL sí cobra
> mientras la instancia existe**, aunque no haya usuarios.

---

## 1. Qué se va a desplegar

La aplicación ya tiene una arquitectura de **un solo servicio**:

```
Navegador
   │  HTTPS
   ▼
Cloud Run  ──  Express 5 (Node 22)
   │             ├── /api/*        API REST
   │             └── /*            React 19 compilado (Vite)
   │
   ▼
PostgreSQL (Cloud SQL o proveedor externo)
```

No hace falta separar frontend y backend: Express sirve el cliente compilado
desde `cliente/dist` y la API desde `/api`. Cloud Run ejecuta un solo
contenedor, lo que reduce costes y simplifica el despliegue.

Servicios usados:

| Servicio | Para qué |
|---|---|
| GitHub | Repositorio y control de versiones |
| Docker | Imagen multi-stage (Node 22 Alpine) |
| Cloud Build | Construcción y despliegue automatizado |
| Artifact Registry | Almacenamiento de la imagen |
| Cloud Run | Ejecución con escala a cero |
| Cloud SQL PostgreSQL | Base de datos (opción con coste fijo) |
| Secret Manager | Contraseñas y claves de integraciones |
| Cloud Logging | Registros del servicio |

---

## 2. Estado actual del proyecto (análisis)

- **Frontend:** React 19, React Router 7, Vite 8, TypeScript 6, Tailwind 4.
- **Backend:** Node.js 22, Express 5, `pg` 8, `helmet`, `cors`,
  `express-rate-limit`, `zod`.
- **Base de datos:** PostgreSQL con 27 migraciones (`base-de-datos/migraciones`).
  Conservan tablas, relaciones, restricciones, índices, disparadores, funciones,
  vistas y la matriz de permisos.
- **Autenticación:** token HMAC-SHA256 firmado con `CLAVE_SESION`, enviado en
  `Authorization: Bearer`. La sesión se valida contra la base en cada petición.
- **Contraseñas:** scrypt con sal (`servidor/src/acceso/claves.js`).
- **Migraciones:** `servidor/herramientas/migrar.js`, idempotente y con candado
  de PostgreSQL para evitar carreras entre instancias.
- **Cliente y API en el mismo origen:** `VITE_API_URL=""` en la imagen; el
  navegador llama a `/api` en la misma URL.
- **Archivos de despliegue existentes:** `Dockerfile`, `cloudbuild.yaml`,
  `cloudrun-service.yaml` y `.github/workflows/deploy.yml`. Fueron corregidos y
  endurecidos.

### Problema de seguridad encontrado

`docker-entrypoint.sh` y `cargar-demo.mjs` tenían **credenciales reales escritas**
(PostgreSQL, PayPal, IMECF, Groq y clave de sesión), y ya estaban en el historial
de Git. Los archivos fueron limpiados, pero **borrar el archivo no borra el
historial**. Hay que rotar esas claves. Ver `docs/ROTACION-DE-SECRETOS.md`.

---

## 3. Costes: leer antes de autorizar

### 3.1 Cloud SQL (opción 100 % Google Cloud)

Precios de lista aproximados en `us-central1` (2026), sin créditos:

| Concepto | Configuración | USD/mes |
|---|---|---:|
| Instancia | `db-f1-micro` (0.6 GB, shared core) | 7.67 |
| Almacenamiento | SSD 10 GB (mínimo de Cloud SQL) | 1.70 |
| Copias automáticas | 10 GB, 7 días | 0.80 |
| **Total Cloud SQL** | | **≈ 10.17** |

Otros servicios para este uso:

| Servicio | Estimación | Comentario |
|---|---:|---|
| Cloud Run | 0.00 | 2 M solicitudes, 180 000 vCPU-s y 360 000 GiB-s gratis al mes; `min-instances=0` |
| Cloud Build | 0.00 | 120 minutos/día gratis; un build tarda ~2-4 min |
| Artifact Registry | 0.00-0.10 | 0.5 GB gratis; una imagen ronda 150-250 MB |
| Secret Manager | 0.00-0.12 | 6 versiones activas gratis; aquí hay 8 |
| Cloud Logging | 0.00 | 50 GiB/mes gratis |
| Egress | 0.00 | 1 GB/mes gratis en Norteamérica; el cliente pesa ~140 KB gzip |
| **Total realista** | **≈ 10-12 USD/mes** | Depende del tipo de cambio y de la región |

**Lo importante:**

- Cloud SQL cobra **mientras la instancia existe**, aunque no haya tráfico.
- Se puede **detener** (`activation-policy=NEVER`): deja de cobrar CPU/memoria,
  pero **sigue cobrando almacenamiento y copias** (≈ 2.50 USD/mes).
- Cloud Run **sí** escala a cero y no cobra CPU inactiva.
- Con 50 USD, Cloud SQL dura aproximadamente **4-5 meses** si no se detiene.
  Si esos 50 USD son un **retenido de la tarjeta** y no crédito promocional, el
  cargo puede acabar en tu método de pago. Configura una alerta de presupuesto.

### 3.2 Alternativa sin Cloud SQL (coste 0)

| Proveedor | Plan gratis | Límite | Inconveniente |
|---|---|---|---|
| **Neon** | Free | 100 CU-horas/mes, 0.5-1 GB, autosuspensión | Cold start de ~0.5-2 s tras inactividad |
| Supabase | Free | 500 MB, 5 GB egress | Se pausa tras 7 días sin actividad |

La base actual pesa ~12 MB; cualquiera de los dos sobra. **Neon es la opción
recomendada si el objetivo es no gastar nada**: la app ya soporta PostgreSQL
externo con TLS (`BD_SSL=true`).

Con Neon/Supabase, Cloud Run sigue siendo el mismo y el coste de GCP es 0
dentro del nivel gratuito.

---

## 4. Requisitos previos

1. Cuenta de Google Cloud con facturación habilitada (aunque sea la prueba).
2. `gcloud` instalado (ya está en este equipo).
3. Git y acceso al repositorio `cabadayan-png/siga-dp`.
4. PowerShell 5.1 o superior.
5. No hace falta Docker local: Cloud Build construye la imagen.

Autenticarse:

```powershell
gcloud auth login
gcloud config set project TU_PROYECTO
```

Comprobar el estado sin crear nada:

```powershell
.\scripts\verificar-gcp.ps1
```

---

## 5. Preparación (sin coste fijo)

Este paso crea Artifact Registry, cuentas de servicio, permisos y secretos.
**No crea Cloud SQL ni Cloud Run.**

```powershell
# Con Neon (no habilita Cloud SQL ni genera bd-clave):
.\scripts\preparar-gcp.ps1 -ProjectId "TU_PROYECTO" -SinCloudSql -Ejecutar

# Con Cloud SQL:
.\scripts\preparar-gcp.ps1 -ProjectId "TU_PROYECTO" -Ejecutar
```

El script:

- Habilita las APIs: Run, Build, Artifact Registry, Secret Manager, IAM,
  Logging y Monitoring (SQL Admin solo si no se usa `-SinCloudSql`).
- Crea el repositorio `siga-dp` en Artifact Registry.
- Crea `siga-dp-run` (ejecución) y `siga-dp-build` (build).
- Concede permisos mínimos:
  - `siga-dp-run`: `cloudsql.client`, `secretmanager.secretAccessor`,
    `logging.logWriter`.
  - `siga-dp-build`: `cloudbuild.builds.builder`, `run.admin`,
    `artifactregistry.writer`, `iam.serviceAccountUser`, `logging.logWriter`.
- Crea los secretos:
  - `bd-clave` (contraseña de PostgreSQL, generada). Con `-SinCloudSql` no se
    crea: la carga `configurar-neon.ps1` con la clave real del proveedor.
  - `clave-sesion` (firma de sesiones, generada).
  - `clave-admin` (contraseña inicial del usuario `gerente`, generada).
  - `paypal-client-id`, `paypal-client-secret`, `paypal-webhook-id`,
    `imecf-api-key`, `groq-api-key` (se piden por consola; si se dejan vacíos se
    guarda `no-configurado` para que el despliegue no falle).

> No se imprimen contraseñas. Para recuperar la del administrador:
> `gcloud secrets versions access latest --secret=clave-admin --project=TU_PROYECTO`

---

## 6. Base de datos

### Opción A — Cloud SQL (facturable, requiere autorización)

```powershell
# Primero muestra el plan y NO crea nada:
.\scripts\crear-cloudsql.ps1 -ProjectId "TU_PROYECTO"

# Cuando estés de acuerdo con el gasto:
.\scripts\crear-cloudsql.ps1 -ProjectId "TU_PROYECTO" -ConfirmarGasto
```

Crea:

- Instancia `siga-dp-db`, PostgreSQL 16, `db-f1-micro`, zonal, 10 GB SSD.
- Base `siga_dp_v2`.
- Copias automáticas de 7 días (se pueden quitar con `-SinBackups`).
- Protección contra borrado accidental.
- Aplica como contraseña del usuario `postgres` el valor de `bd-clave`.

La conexión desde Cloud Run usa el **socket Unix** que monta Cloud SQL:

```
BD_HOST=/cloudsql/TU_PROYECTO:us-central1:siga-dp-db
```

No hay contraseña en el código ni en la imagen: llega por Secret Manager.

### Opción B - Neon (sin coste fijo, recomendado)

Neon Free no tiene costo mensual. La contraseña la define Neon, no Secret
Manager, así que el flujo es: crear el proyecto, guardar su cadena y sembrar.

1. Entra en https://console.neon.tech y crea un proyecto (plan Free).
2. Copia la cadena de conexión **directa** (sin `-pooler`). Las migraciones usan
   candados de sesión y el agrupador no los soporta:
   `postgresql://USUARIO:CLAVE@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
3. Guarda la cadena y genera la configuración local:
   ```powershell
   .\scripts\configurar-neon.ps1 -ProjectId "TU_PROYECTO"
   ```
   Pide la cadena sin mostrarla, guarda la contraseña en el secreto `bd-clave` y
   escribe `.neon-config.json` (sin contraseña, ignorado por Git).
4. Aplica las migraciones y crea el administrador:
   ```powershell
   .\scripts\sembrar-neon.ps1 -ProjectId "TU_PROYECTO" -Confirmar
   ```
   La clave inicial queda en el secreto `clave-admin`.
5. Despliega:
   ```powershell
   .\scripts\desplegar-neon.ps1 -ProjectId "TU_PROYECTO"
   ```

La app usa TLS con verificación de certificado (`BD_SSL=true`,
`BD_SSL_VERIFICAR=true`). El host y el puerto salen de la cadena.

> **Copiar datos existentes (opcional):**
> `.\scripts\migrar-datos-neon.ps1 -ProjectId "TU_PROYECTO" -Confirmar`
> vuelca la base local con `pg_dump`, la restaura en Neon, rota la clave de
> `gerente` y compara el número de filas de todas las tablas. Para un arranque
> limpio usa `sembrar-neon.ps1`.

La base actual pesa ~12 MB: entra de sobra en el plan Free. La latencia es algo
mayor que Cloud SQL porque la base no está en GCP.

---
## 7. Desplegar

### Con Cloud SQL

```powershell
.\scripts\desplegar.ps1 `
  -ProjectId "TU_PROYECTO" `
  -CloudSqlInstance "TU_PROYECTO:us-central1:siga-dp-db"
```

### Con Neon (sin Cloud SQL)

```powershell
.\scripts\desplegar-neon.ps1 -ProjectId "TU_PROYECTO"
```

Lee `.neon-config.json`, construye con `cloudbuild-externo.yaml` y despliega sin
crear Cloud SQL ni VPC connector.
El script:

1. Ejecuta `gcloud builds submit` con `cloudbuild.yaml` o
   `cloudbuild-externo.yaml`.
2. Cloud Build construye la imagen y la publica en Artifact Registry.
3. Despliega en Cloud Run con:
   - `min-instances=0`, `max-instances=2`.
   - `cpu=1`, `memory=512Mi`, `concurrency=80`.
   - CPU solo durante las solicitudes (`--cpu-throttling`).
   - Acceso público (`--allow-unauthenticated`).
   - Cuenta de servicio `siga-dp-run`.
4. Lee la URL pública y la deja en `ORIGENES` (CORS).

Al final imprime la URL. También se puede consultar con:

```powershell
gcloud run services describe siga-dp --region=us-central1 --format="value(status.url)"
```

---

## 8. Primera entrada y datos iniciales

### Con Neon (recomendado)

`sembrar-neon.ps1` ya aplicó las migraciones y la semilla antes de desplegar:
no hace falta crear trabajos en Cloud Run.

- Usuario: `gerente`
- Clave: la del secreto `clave-admin`:
  ```powershell
  gcloud secrets versions access latest --secret=clave-admin --project=TU_PROYECTO
  ```

Cámbiala desde el módulo de Personal en cuanto entres. La semilla crea datos
marcados como "desarrollo" (empresa, RNC, dos productos): edítalos desde
Parámetros y Productos con los datos reales del negocio.

Si copiaste una base de desarrollo con `migrar-datos-neon.ps1`, ese script ya
rotó la clave de `gerente` al valor de `clave-admin`.

### Con Cloud SQL (trabajo temporal)

El contenedor aplica las migraciones al arrancar, pero **no carga la semilla**.
Para producción se usa una clave fuerte desde el secreto `clave-admin`.

```powershell
$proyecto = "TU_PROYECTO"
$region = "us-central1"
$instancia = "$proyecto`:$region`:siga-dp-db"
$imagen = "$region-docker.pkg.dev/$proyecto/siga-dp/siga-dp:latest"

gcloud run jobs create siga-dp-semilla `
  --project=$proyecto `
  --region=$region `
  --image=$imagen `
  --add-cloudsql-instances=$instancia `
  --set-env-vars=NODE_ENV=production,BD_HOST=/cloudsql/$instancia,BD_PUERTO=5432,BD_USUARIO=postgres,BD_NOMBRE=siga_dp_v2 `
  --set-secrets=BD_CLAVE=bd-clave:latest,SEMILLA_CLAVE=clave-admin:latest `
  --command=/bin/sh `
  --args="-c","node servidor/herramientas/semilla.js" `
  --max-retries=0

gcloud run jobs execute siga-dp-semilla --project=$proyecto --region=$region --wait
gcloud run jobs delete siga-dp-semilla --project=$proyecto --region=$region --quiet
```

> El trabajo se ejecuta una vez y no queda cobrando en reposo.

> **No vuelvas a ejecutar la semilla con la clave por defecto.** El script se
> niega si `NODE_ENV=production` y la clave tiene menos de 12 caracteres.

---
## 9. Verificación

```powershell
.\scripts\verificar-servicio.ps1 -Url "https://siga-dp-xxxx-uc.a.run.app"
```

Comprueba:

1. `/api/salud` → `{ "ok": true, "datos": { "estado": "ok" } }`.
2. `/` → HTML del cliente con `<div id="root">`.
3. `/cuentas` → también devuelve `index.html` (router del cliente).
4. Login real contra PostgreSQL.
5. `/api/acceso/yo` → usuario, rol y permisos.
6. Ruta inexistente → 404 con el formato de la API.

Registros:

```powershell
gcloud run services logs read siga-dp --region=us-central1 --limit=50
```

Escalado a cero:

```powershell
gcloud run services describe siga-dp --region=us-central1 `
  --format="value(spec.template.metadata.annotations)"
```

Debe mostrar `autoscaling.knative.dev/minScale=0`.

---

## 10. Automatización con GitHub

### Opción recomendada: disparador de Cloud Build

1. En la consola: **Cloud Build → Triggers → Conectar repositorio**.
2. Autoriza la GitHub App y elige el repositorio.
   Si el remoto actual no responde, crea uno nuevo primero:
   ```powershell
   gh auth login
   .\scripts\crear-repo-github.ps1 -Nombre "siga-dp-v2" -Confirmar
   ```
   El script crea el repositorio, agrega el remoto `produccion` y sube el
   historial. No toca el remoto `origin`.
3. Crea un trigger:
   - Evento: push a `^main$`.
   - Configuración: `cloudbuild.yaml` (Cloud SQL) o `cloudbuild-externo.yaml`
     (Neon / Supabase).
   - Cuenta de servicio: `siga-dp-build@TU_PROYECTO.iam.gserviceaccount.com`.
   - Sustituciones: `_REGION=us-central1` y, según el caso,
     `_CLOUDSQL_INSTANCE=TU_PROYECTO:us-central1:siga-dp-db` o los datos de Neon.
4. Guarda. Cada push a `main` construye y despliega.

No hay secretos en GitHub: Cloud Build los lee de Secret Manager.

### Alternativa manual: GitHub Actions

`.github/workflows/deploy.yml` quedó como **workflow manual**
(`workflow_dispatch`). Antes se ejecutaba en cada push, no tenía PostgreSQL y
fallaba siempre. Ahora:

- Levanta PostgreSQL 16 como servicio.
- Ejecuta lint, tipos, build y las pruebas de API.
- Autentica con Workload Identity Federation (sin claves JSON).
- Llama a Cloud Build.

Necesita estos secretos en GitHub:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

---

## 11. Control de costes

1. **Alerta de presupuesto** (recomendado antes de crear Cloud SQL):

```powershell
gcloud billing accounts list
gcloud billing budgets create `
  --billing-account=TU_CUENTA_DE_FACTURACION `
  --display-name="SIGA-DP" `
  --budget-amount=10USD `
  --threshold-rule=percent=0.5 `
  --threshold-rule=percent=0.9 `
  --threshold-rule=percent=1.0
```

2. **Detener Cloud SQL** cuando no se use:

```powershell
.\scripts\detener-cloudsql.ps1 -ProjectId "TU_PROYECTO"
```

3. **Volver a arrancar**:

```powershell
.\scripts\detener-cloudsql.ps1 -ProjectId "TU_PROYECTO" -Iniciar
```

4. **Cloud Run** ya está en `min-instances=0` y `max-instances=2`.
5. **Artifact Registry**: limpia imágenes viejas si se acumulan:

```powershell
gcloud artifacts docker images list us-central1-docker.pkg.dev/TU_PROYECTO/siga-dp/siga-dp
```

6. **No actives** réplicas de lectura, alta disponibilidad, IP privada con VPC
   connector ni “CPU always allocated”: aumentan el coste sin necesidad para
   este sistema.

---

## 12. Seguridad

- **Secretos:** solo en Secret Manager. `.env` está en `.gitignore` y
  `.dockerignore`; la imagen no los contiene.
- **Contraseñas:** scrypt con sal; nunca se guardan en texto plano.
- **Sesiones:** HMAC-SHA256, 12 horas, validación contra la base en cada
  petición. Cambiar `CLAVE_SESION` invalida todas las sesiones.
- **CORS:** mismo origen por defecto; `ORIGENES` se fija a la URL real.
- **Cabeceras:** Helmet.
- **Fuerza bruta:** límite global (300/15 min) y de login (10/15 min), más
  bloqueo de cuenta a los 3 intentos fallidos.
- **Base de datos:** Cloud SQL con IP pública sin redes autorizadas; el acceso
  es por el conector de Cloud SQL con IAM. No se abre el puerto a Internet.
- **IAM mínimo:** `siga-dp-run` solo puede leer secretos y conectar a Cloud SQL.
- **Contenedor:** usuario `node`, sin root; `tini` para señales.
- **Migraciones:** candado de PostgreSQL; si fallan, el contenedor no arranca a
  medias.
- **Rotación:** las claves que estuvieron en Git deben rotarse. Ver
  `docs/ROTACION-DE-SECRETOS.md`.

---

## 13. Pruebas realizadas (evidencia local)

Verificado el 13 de noviembre de 2026 en este equipo (Windows, PostgreSQL 18):

| Prueba | Resultado |
|---|---|
| `npm run lint` | Sin errores |
| `npm run build` | Cliente compilado (2002 módulos, ~140 KB gzip) |
| `npm run test:api` | **470/470 pruebas pasan** contra PostgreSQL real |
| `npm install --omit=dev --workspaces` | 98 paquetes, sin `vite` ni `typescript` |
| Migraciones con solo variables de entorno | 0 pendientes, sin `.env` |
| `/api/salud` en layout de producción | 200 `{ok:true}` |
| `/` y `/cuentas` | 200, `index.html` con `#root` |
| Login `gerente` contra PostgreSQL | Token emitido, 27 permisos |
| Navegador real: login y panel | Inicia sesión, muestra "Buenas noches, Rosa - Gerente" y los módulos |
| Navegador real: `/cuentas` | Carga datos desde PostgreSQL y muestra las tablas de mesas |
| Consola del navegador | 0 errores durante login y navegación |
| Sintaxis de los 11 scripts `.ps1` | 0 errores (parser de PowerShell) |
| `cloudbuild*.yaml`, `cloudrun-service.yaml`, workflow | YAML válido |
| `npm run test:web` | 229/243; 14 fallos **preexistentes** de tests de UI desactualizados |

Los 14 fallos de cliente no son del despliegue: los tests esperan textos y
pestañas de un diseño anterior (`"Mesas por cobrar"`, `"1. Revisar"`,
`"2. Cobrar"`) y el comportamiento antiguo de `VITE_API_URL` vacío. La app
compila y funciona. Queda como deuda técnica separada.

No se declara “probado en Cloud Run” hasta que exista un despliegue real y la
verificación remota pase.

---

## 14. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Cloud Run no arranca | Falta un secreto o `CLAVE_SESION` < 32 | Revisa logs; `gcloud run services logs read` |
| `password authentication failed` | `bd-clave` no coincide con la de Cloud SQL | Vuelve a ejecutar `crear-cloudsql.ps1 -ConfirmarGasto` o actualiza el usuario |
| `ECONNREFUSED /cloudsql/...` | Falta `--add-cloudsql-instances` | Revisa `cloudbuild.yaml` |
| `relation "migracion" does not exist` | Migraciones no aplicadas | El entrypoint las aplica; revisa logs |
| CORS bloquea | `ORIGENES` no es la URL real | El paso `fijar-origenes` la actualiza; revisa la revisión |
| 429 en login | Límite de intentos | Espera 15 min o revisa `LIMITE_INGRESOS` |
| La página carga pero la API falla | Cliente compilado con `VITE_API_URL` externa | En la imagen se compila con `VITE_API_URL=""` |
| `password authentication failed` con Neon | `bd-clave` no coincide con la cadena | Vuelve a ejecutar `configurar-neon.ps1` |
| `self-signed certificate` o `unable to verify` | El proveedor usa una CA que Node no reconoce | Último recurso: `BD_SSL_VERIFICAR=false` (debilita TLS) |
| Errores de candados o sentencias preparadas | Se usó el host `-pooler` | Usa el host directo de Neon (sin `-pooler`) |
| La primera petición tarda 3-10 s | Cloud Run en 0 y Neon suspendido | Normal; sube `min-instances` solo si molesta |

---

## 15. Archivos relevantes

| Archivo | Función |
|---|---|
| `Dockerfile` | Imagen multi-stage, usuario no root, healthcheck |
| `docker-entrypoint.sh` | Valida entorno, migra y arranca |
| `cloudbuild.yaml` | Build + Artifact Registry + Cloud Run (Cloud SQL) |
| `cloudbuild-externo.yaml` | Build + Cloud Run con PostgreSQL externo |
| `cloudrun-service.yaml` | Plantilla manual del servicio |
| `scripts/preparar-gcp.ps1` | APIs, AR, cuentas de servicio, secretos |
| `scripts/crear-cloudsql.ps1` | Cloud SQL (facturable, con confirmación) |
| `scripts/configurar-neon.ps1` | Guarda la cadena de Neon y genera `.neon-config.json` |
| `scripts/sembrar-neon.ps1` | Migraciones + semilla con clave fuerte en Neon |
| `scripts/migrar-datos-neon.ps1` | Copia datos locales, rota la clave y compara filas |
| `scripts/desplegar-neon.ps1` | Build + Cloud Run sin Cloud SQL |
| `scripts/desplegar.ps1` | Cloud Build + Cloud Run |
| `scripts/crear-repo-github.ps1` | Crea un repositorio nuevo y sube el historial |
| `scripts/verificar-servicio.ps1` | Pruebas HTTP contra la URL pública |
| `scripts/detener-cloudsql.ps1` | Detener/arrancar la instancia |
| `servidor/herramientas/cambiar-clave.js` | Rota la clave de un usuario sin imprimirla |
| `docs/ROTACION-DE-SECRETOS.md` | Rotar las claves que estuvieron en Git |
