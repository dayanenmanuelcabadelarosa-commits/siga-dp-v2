# Rotación de secretos expuestos

## Qué pasó

En el historial de Git del repositorio quedaron credenciales reales escritas en
texto plano dentro de:

- `docker-entrypoint.sh` (contraseña de PostgreSQL, clave de sesión, PayPal,
  IMECF y Groq).
- `cargar-demo.mjs` (contraseña de una base PostgreSQL de Render).

Los archivos ya fueron limpiados en el árbol de trabajo, pero **el historial de
Git conserva las versiones anteriores**. Por eso la única medida segura es
**rotar todas esas credenciales**. No se reescribe el historial porque el
requisito del proyecto es no sobrescribirlo.

> Si el repositorio estuvo público, asume que cualquiera pudo leerlas. Si estuvo
> privado, igual conviene rotarlas: los colaboradores y los respaldos también
> cuentan.

## Lista de secretos a rotar

| Secreto | Dónde se genera | Acción |
|---|---|---|
| Contraseña de PostgreSQL (Render) | Panel de Render | Cambiar o eliminar esa base si ya no se usa |
| Contraseña de PostgreSQL (Cloud SQL) | `scripts/crear-cloudsql.ps1` / Secret Manager | Rotar con el script y actualizar `bd-clave` |
| `CLAVE_SESION` | Aleatoria | Generar una nueva; invalida todas las sesiones |
| PayPal Client ID / Secret | developer.paypal.com | Crear credenciales nuevas y revocar las viejas |
| PayPal Webhook ID | Panel de PayPal | Recrear el webhook y actualizar el ID |
| IMECF API Key | Plataforma IMECF | Solicitar rotación |
| Groq API Key | console.groq.com | Revocar y crear una nueva |

## Cómo rotar en Google Cloud

### 1. Clave de sesión

```powershell
$nueva = -join ((1..96) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
$nueva | gcloud secrets versions add clave-sesion --data-file=- --project=TU_PROYECTO
```

La tubería de PowerShell añade un salto de línea. Para una clave de sesión no
importa (solo cambia el valor), pero si prefieres evitarlo usa la consola de
Secret Manager o el script `preparar-gcp.ps1`, que usa la API y no añade nada.

Después del cambio, todas las sesiones abiertas dejan de valer. Es lo esperado.

### 2. Contraseña de Cloud SQL

```powershell
# 1) Genera una nueva y guárdala en el secreto.
.\scripts\preparar-gcp.ps1 -ProjectId "TU_PROYECTO" -Ejecutar   # no cambia bd-clave si ya existe

# 2) Para cambiarla de verdad, añade una versión nueva al secreto:
#    (usa la consola de Secret Manager o este bloque)
$nueva = -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
$nueva | gcloud secrets versions add bd-clave --data-file=- --project=TU_PROYECTO

# 3) Aplica la última versión al usuario postgres de Cloud SQL.
.\scripts\crear-cloudsql.ps1 -ProjectId "TU_PROYECTO" -ConfirmarGasto
```

El script `crear-cloudsql.ps1` lee siempre la última versión de `bd-clave` y la
aplica al usuario `postgres` mediante la API, sin dejar la contraseña en la
línea de comandos.

### 3. Integraciones (PayPal, IMECF, Groq)

1. Entra al panel de cada proveedor y **revoca** la credencial vieja.
2. Crea la nueva.
3. Actualiza el secreto correspondiente:

```powershell
# Ejemplo con Groq. La consola pedirá el valor sin mostrarlo en pantalla.
gcloud secrets versions add groq-api-key --data-file=- --project=TU_PROYECTO
```

O vuelve a ejecutar `preparar-gcp.ps1` después de borrar el secreto viejo; el
script pide el valor por consola.

4. Fuerza una nueva revisión de Cloud Run para que tome la última versión:

```powershell
gcloud run services update siga-dp `
  --region=us-central1 `
  --update-secrets=GROQ_API_KEY=groq-api-key:latest
```

### 4. Base de datos de Render

Si ya no se usa:

1. Elimina la base en el panel de Render (o cambia su contraseña).
2. Borra cualquier cadena de conexión que quede en archivos locales
   (`servidor/.env`, notas, capturas).

La aplicación **no** necesita Render: el despliegue usa Cloud SQL o un
PostgreSQL externo configurado por variables de entorno.

## Después de rotar

- [ ] `bd-clave` tiene una versión nueva y Cloud SQL usa esa contraseña.
- [ ] `clave-sesion` tiene una versión nueva.
- [ ] PayPal, IMECF y Groq tienen credenciales nuevas y las viejas están
      revocadas.
- [ ] La base de Render fue eliminada o rotada.
- [ ] `servidor/.env` local tiene los valores nuevos (y sigue sin subirse).
- [ ] Se hizo un nuevo despliegue y `verificar-servicio.ps1` pasa.
- [ ] Se revisó que ningún `.env`, `.pem` o clave JSON esté en `git status`.

## Prevención

- `.gitignore` y `.dockerignore` excluyen `.env`, `*.pem`, `*.key` y
  `service-account*.json`.
- Los secretos de producción viven en Secret Manager.
- `docker-entrypoint.sh` ya no tiene valores por defecto: si falta una variable,
  falla con un mensaje claro.
- El workflow de GitHub no guarda contraseñas: usa Workload Identity Federation.
- Antes de cada commit:

```powershell
git status --short
git diff --cached
```

Si aparece una clave, no hagas commit: rótala y límpiala.
