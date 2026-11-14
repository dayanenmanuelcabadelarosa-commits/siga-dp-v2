<# =============================================================================
  desplegar.ps1 - SIGA-DP v2
  Despliega la aplicación en Cloud Run usando Cloud Build.
  Compatible con Cloud SQL (PostgreSQL) o PostgreSQL externo (Neon/Supabase).
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [ValidateSet('ConCloudSql', 'SinCloudSql')]
  [string]$Modo = 'ConCloudSql',

  [Parameter(Mandatory=$true)]
  [string]$Region = 'us-central1',

  [Parameter(Mandatory=$true)]
  [string]$CloudSqlInstance,

  [Parameter(Mandatory=$true)]
  [string]$ArtifactRepo = 'siga-dp',

  [Switch]$ConfirmarGasto
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Desplegando SIGA-DP v2 a Cloud Run ===`n" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectId" -ForegroundColor White
Write-Host "Modo: $Modo" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan

# 1. Verificar que gcloud esté autenticado
Write-Host "1. Verificando autenticación..." -ForegroundColor Yellow
$account = gcloud config get value account 2>&1
Write-Host "   Cuenta actual: $account" -ForegroundColor Green

# 2. Verificar Artifact Registry
Write-Host "2. Verificando Artifact Registry..." -ForegroundColor Yellow
$repoExists = gcloud artifacts repositories describe $ArtifactRepo --location=$Region --project=$ProjectId 2>&1
Write-Host "   repositorio Artifact Registry verificado" -ForegroundColor Green

# 3. Ejecutar Cloud Build
Write-Host "3. Ejecutando Cloud Build..." -ForegroundColor Yellow

$cloudbuildConfig = if ($Modo -eq 'ConCloudSql') {
  'cloudbuild.yaml'
} else {
  'cloudbuild-externo.yaml'
}

Write-Host "   Usando configuración: $cloudbuildConfig" -ForegroundColor Grey

$buildCmd = @"
gcloud builds submit \
  --project="$ProjectId" \
  --config="$cloudbuildConfig" `
  --substitutions=_REGION=$Region,_CLOUDSQL_INSTANCE=$CloudSqlInstance
"@

Write-Host "   Ejecutando: gcloud builds submit --config=$cloudbuildConfig" -ForegroundColor Grey
Invoke-Expression $buildCmd 2>&1

# 4. Desplegar en Cloud Run
Write-Host "4. Desplegando en Cloud Run..." -ForegroundColor Yellow

$deployCmd = @"
gcloud run services update siga-dp `
  --project="$ProjectId" `
  --region="$Region" `
  --image=us-central1-docker.pkg.dev/$ProjectId/siga-dp/siga-dp:latest `
  --allow-unauthenticated `
  --add-cloudsql-instances="$CloudSqlInstance" `
  --set-env-vars=NODE_ENV=production,PUERTO=8080,BD_HOST=/cloudsql/$CloudSqlInstance,BD_PUERTO=5432,BD_USUARIO=postgres,BD_NOMBRE=siga_dp_v2,BD_MAX_CONEXIONES=5,BD_TIEMPO_CONEXION_MS=10000,BD_TIEMPO_SENTENCIA_MS=30000,PAYPAL_ENTORNO=sandbox,PAYPAL_MONEDA=USD,IMECF_API_URL=https://ecf-platform-backend-50801509587.us-central1.run.app,GROQ_MODEL=openai/gpt-oss-120b `
  --set-secrets=BD_CLAVE=bd-clave:latest,CLAVE_SESION=clave-sesion:latest,PAYPAL_CLIENT_ID=paypal-client-id:latest,PAYPAL_CLIENT_SECRET=paypal-client-secret:latest,PAYPAL_WEBHOOK_ID=paypal-webhook-id:latest,IMECF_API_KEY=imecf-api-key:latest,GROQ_API_KEY=groq-api-key:latest `
  --min-instances=0 `
  --max-instances=2 `
  --concurrency=80 `
  --cpu=1 `
  --memory=512Mi `
  --timeout=300 `
  --cpu-throttling `
  --quiet
"@

Write-Host "   Ejecutando despliegue en Cloud Run..." -ForegroundColor Grey
Invoke-Expression $deployCmd 2>&1

# 5. Fijar CORS/ORIGENES
Write-Host "5. Fijando variable ORIGENES (CORS)..." -ForegroundColor Yellow

$fixOrigenesCmd = @"
set -euo pipefail
URL="$$(gcloud run services describe siga-dp \
  --region=$Region --project=$ProjectId --format='value(status.url)')"
if [ -z "$$URL" ]; then
  echo "No se pudo leer la URL del servicio." >&2
  exit 1
fi
echo "URL pública: $$URL"
gcloud run services update siga-dp `
  --region=$Region `
  --project=$ProjectId `
  --update-env-vars=ORIGENES="$$URL" `
  --quiet
"@

Write-Host "   Leyendo URL pública y actualizando ORIGENES..." -ForegroundColor Grey
Invoke-Expression $fixOrigenesCmd 2>&1

# 6. Resumen final
Write-Host "`n=== DESPLIEGUE COMPLETADO ===" -ForegroundColor Cyan
Write-Host "   Proyecto: $ProjectId" -ForegroundColor White
Write-Host "   Región: $Region" -ForegroundColor White
Write-Host "   Servicio: siga-dp" -ForegroundColor White
Write-Host "   URL: https://siga-dp-uc.a.run.app" -ForegroundColor White
if ($Modo -eq 'ConCloudSql') {
  Write-Host "   Base de datos: Cloud SQL ($CloudSqlInstance)" -ForegroundColor White
}
Write-Host "   ORIGENES configurado automáticamente" -ForegroundColor White
Write-Host "`nPróximos pasos:`n" -ForegroundColor Cyan
Write-Host "   1. Obtener la clave admin: gcloud secrets versions access latest --secret=clave-admin --project=$ProjectId" -ForegroundColor White
Write-Host "   2. Acceder a la app: https://siga-dp-uc.a.run.app" -ForegroundColor White
Write-Host "   3. Iniciar sesión con: usuario=gerente, clave=gerente" -ForegroundColor White
Write-Host "   4. Configurar secretos PayPal y Groq en GitHub si es necesario" -ForegroundColor White