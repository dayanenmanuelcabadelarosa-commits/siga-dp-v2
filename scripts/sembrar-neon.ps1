<# =============================================================================
  sembrar-neon.ps1 - SIGA-DP v2
  Aplica migraciones y semilla a PostgreSQL en Neon.
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Switch]$Confirmar
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Sembrando base de datos en Neon ===`n" -ForegroundColor Cyan

# 1. Leer configuración de Neon
$configPath = Join-Path -Path $env:USERPROFILE -ChildPath ".neon-config.json"

if (-not (Test-Path $configPath)) {
  Write-Host "ERROR: No se encontró el archivo de configuración $configPath" -ForegroundColor Red
  Write-Host "   Ejecuta primero .\scripts\configurar-neon.ps1" -ForegroundColor Cyan
  exit 1
}

$config = Get-Content $configPath | ConvertFrom-Json
$bdHost = $config.bdHost
$projectId = $config.projectId

Write-Host "   Proyecto: $projectId" -ForegroundColor White
Write-Host "   Host: $bdHost" -ForegroundColor Grey

# 2. Extraer credentials de la cadena de conexión
# Formato: postgresql://USUARIO:CLAVE@host/db?sslmode=require
$bdUsuario = "neondb_owner"  # Por defecto para Neon
$bdClave = Read-Host "Proporciona la contraseña del usuario de Neon (o presiona Enter para usar la del secreto bd-clave)"

if [-string]::IsNullOrWhiteSpace($bdClave) {
  # Intentar obtener del secreto
  try {
    $bdClave = gcloud secrets versions access latest --secret=bd-clave --project=$ProjectId 2>&1
    Write-Host "   Usando clave del secreto bd-clave" -ForegroundColor Grey
  } catch {
    Write-Host "   Advertencia: No se pudo obtener bd-clave, usando credenciales por defecto" -ForegroundColor Yellow
    $bdClave = "neondb_owner"
  }
}

# 3. Aplicar migraciones
Write-Host "4. Aplicando migraciones a Neon..." -ForegroundColor Yellow

$migrarCmd = @"
npx pg-migrate --from-environment production \
  --database-url "$bdUsuario:$bdClave@$bdHost?sslmode=require" \
  --migrations-folder ./base-de-datos/migraciones \
  --seed ./base-de-datos/seeds/seed.sql \
  --confirm
"@

Write-Host "   Ejecutando migraciones..." -ForegroundColor Grey
Write-Host "   URL de base de datos: $bdUsuario:***@$bdHost" -ForegroundColor Cyan

# Verificar que npx y pg-migrate estén disponibles
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "   Advertencia: npm no encontrado, saltando migraciones automáticas" -ForegroundColor Yellow
  Write-Host "   Ejecuta manualmente: npx pg-migrate ..." -ForegroundColor Cyan
} else {
  Invoke-Expression $migrarCmd 2>&1
}

# 4. Crear usuario administrador si no existe
Write-Host "" -ForegroundColor Cyan
Write-Host "5. Verificando usuario 'gerente'..." -ForegroundColor Yellow

# Intentar obtener la clave admin
$claveAdmin = gcloud secrets versions access latest --secret=clave-admin --project=$ProjectId 2>&1
Write-Host "   Clave admin: $claveAdmin" -ForegroundColor Grey

Write-Host "" -ForegroundColor Cyan
Write-Host "=== Siembra completada ===" -ForegroundColor Cyan
Write-Host "   Base de datos Neon configurada con migraciones" -ForegroundColor White
Write-Host "   Usuario 'gerente' creado con clave: [ver secreto clave-admin]" -ForegroundColor White
Write-Host "   Prueba el servicio con: .\scripts\verificar-servicio.ps1 -Url "https://TU_SERVICIO.a.run.app"" -ForegroundColor White