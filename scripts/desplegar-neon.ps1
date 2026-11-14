<# =============================================================================
  desplegar-neon.ps1 - SIGA-DP v2
  Despliega SIGA-DP en Cloud Run con PostgreSQL externo (Neon/Supabase).
  No crea Cloud SQL ni VPC connector. Costo 0 USD/mes en GCP.
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Parameter(Mandatory=$true)]
  [string]$Region = 'us-central1',

  [Parameter(Mandatory=$true)]
  [string]$ArtifactRepo = 'siga-dp',

  [Switch]$Confirmar
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Desplegando SIGA-DP v2 con Neon (0 USD/mes) ===`n" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectId" -ForegroundColor White
Write-Host "Región: $Region" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan

# 1. Verificar configuración de Neon
$configPath = Join-Path -Path $env:USERPROFILE -ChildPath ".neon-config.json"

if (-not (Test-Path $configPath)) {
  Write-Host "ERROR: No se encontró $configPath" -ForegroundColor Red
  Write-Host "   Ejecuta primero .\scripts\configurar-neon.ps1" -ForegroundColor Cyan
  exit 1
}

$config = Get-Content $configPath | ConvertFrom-Json
$bdHost = $config.bdHost
$bdSsl = $config.ssl -or "true"
$bdSslVerificar = $config.sslVerificar -or "true"

Write-Host "   Configuración Neon cargada" -ForegroundColor Green
Write-Host "   Host: $bdHost" -ForegroundColor Grey

# 2. Verificar secretos necesarios
Write-Host "2. Verificando secretos en Secret Manager..." -ForegroundColor Yellow

$secretosNecesarios = @('bd-clave', 'clave-sesion', 'paypal-client-id', 'paypal-client-secret', 
  'paypal-webhook-id', 'imecf-api-key', 'groq-api-key')

foreach ($secreto in $secretosNecesarios) {
  $existe = gcloud secrets describe $secreto --project=$ProjectId 2>&1
  if $LASTEXITCODE -eq 0 {
    Write-Host "   ✓ $secreto: disponible" -ForegroundColor Green
  } else {
    Write-Host "   ✗ $secreto: NO encontrado" -ForegroundColor Red
    Write-Host "   Ejecuta: echo 'no-configurado' | gcloud secrets create $secreto --project=$ProjectId --data-file=-" -ForegroundColor Yellow
  }
}

# 3. Ejecutar Cloud Build con configuración externa
Write-Host "3. Ejecutando Cloud Build con configuración externa..." -ForegroundColor Yellow

$buildCmd = @"
gcloud builds submit --project="$ProjectId" --config=cloudbuild-externo.yaml `
  --substitutions=_REGION=$Region,_BD_HOST=$bdHost,_BD_PUERTO='5432',_BD_USUARIO=$bdUsuario,_BD_NOMBRE=neondb,_BD_SSL='true',_BD_SSL_VERIFICAR=$bdSslVerificar
"@

Write-Host "   Usando cloudbuild-externo.yaml" -ForegroundColor Grey
Invoke-Expression $buildCmd 2>&1

# 4. Desplegar en Cloud Run (sin --add-cloudsql-instances)
Write-Host "4. Desplegando en Cloud Run..." -ForegroundColor Yellow

$deployCmd = @"
gcloud run services update siga-dp `
  --project="$ProjectId" `
  --region="$Region" `
  --image=us-central1-docker.pkg.dev/$ProjectId/siga-dp/siga-dp:latest `
  --allow-unauthenticated `
  --port=8080 `
  --set-env-vars=NODE_ENV=production,PUERTO=8080,BD_HOST=$bdHost,BD_PUERTO=5432,BD_USUARIO=$bdUsuario,BD_NOMBRE=neondb,BD_SSL=$bdSsl,BD_SSL_VERIFICAR=$bdSslVerificar,BD_MAX_CONEXIONES=5,BD_TIEMPO_CONEXION_MS=10000,BD_TIEMPO_SENTENCIA_MS=30000,PAYPAL_ENTORNO=sandbox,PAYPAL_MONEDA=USD,IMECF_API_URL=https://ecf-platform-backend-50801509587.us-central1.run.app,GROQ_MODEL=openai/gpt-oss-120b `
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

Write-Host "   Desplegando sin Cloud SQL connector..." -ForegroundColor Grey
Invoke-Expression $deployCmd 2>&1

# 5. Fijar ORIGENES/CORS
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

Write-Host "   Leyendo URL y actualizando ORIGENES..." -ForegroundColor Grey
Invoke-Expression $fixOrigenesCmd 2>&1

# 6. Resumen
Write-Host "`n=== DESPLIEGUE CON NEON COMPLETADO ===" -ForegroundColor Cyan
Write-Host "   Proyecto: $ProjectId" -ForegroundColor White
Write-Host "   Servicio: siga-dp" -ForegroundColor White
Write-Host "   Base de datos: PostgreSQL externo (Neon)" -ForegroundColor White
Write-Host "   Sin Cloud SQL: Costo 0 USD/mes en GCP" -ForegroundColor White
Write-Host "   URL: https://siga-dp-uc.a.run.app" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "   Próximos pasos:" -ForegroundColor White
Write-Host "   1. Obtener clave admin: gcloud secrets versions access latest --secret=clave-admin --project=$ProjectId" -ForegroundColor White
Write-Host "   2. Acceder: https://siga-dp-uc.a.run.app" -ForegroundColor White
Write-Host "   3. Login: usuario=gerente, clave=gerente" -ForegroundColor White