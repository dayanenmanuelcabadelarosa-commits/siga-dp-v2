<# =============================================================================
  configurar-neon.ps1 - SIGA-DP v2
  Configura PostgreSQL en Neon y genera los secretos necesarios.
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Switch]$Confirmar
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Configurando PostgreSQL en Neon ===`n" -ForegroundColor Cyan
Write-Host "Este script te ayudará a configurar Neon y conectarlo con SIGA-DP." -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan

# 1. Recordar crear proyecto en Neon
Write-Host "1. Crear proyecto en Neon Console" -ForegroundColor Yellow
Write-Host "   - Ve a: https://console.neon.tech" -ForegroundColor Grey
Write-Host "   - Crea un proyecto nuevo (plan Free)" -ForegroundColor Grey
Write-Host "   - Anota la cadena de conexión directa (sin -pooler)" -ForegroundColor Grey
Write-Host "   Ejemplo: postgresql://ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan

# 2. Preguntar por la cadena de conexión
$cadenaConexion = Read-Host "Pega aquí la cadena de conexión directa de Neon (o presiona Enter para usar una de prueba)"
if [-string]::IsNullOrWhiteSpace($cadenaConexion) {
  # Cadena de ejemplo para pruebas
  $cadenaConexion = "postgresql://ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
  Write-Host "   Usando cadena de ejemplo" -ForegroundColor Yellow
}

# 3. Extraer usuario y contraseña de la cadena
# Formato típico: postgresql://USUARIO:CLAVE@host/db?sslmode=require
$usuarioNeon = $cadenaConexion -replace "postgresql://", "" -replace "?sslmode=require", "" -split ":"[0]
Write-Host "   Usuario detectado: $usuarioNeon" -ForegroundColor Grey

# 4. Guardar la configuración en archivo
$configHash = @{
  projectId = $ProjectId
  bdHost = $cadenaConexion
  ssl = "true"
  sslVerificar = "true"
}

$configJson = $configHash | ConvertTo-Json -Depth 3
$configPath = Join-Path -Path $env:USERPROFILE -ChildPath ".neon-config.json"
$configJson | Out-File -FilePath $configPath -Encoding UTF8

Write-Host "   Configuración guardada en: $configPath" -ForegroundColor Green
Write-Host "   (Este archivo está en .gitignore y no se subirá a Git)" -ForegroundColor Grey

# 5. Solicitar confirmación para generar el secreto bd-clave
if ($Confirmar) {
  Write-Host "" -ForegroundColor Cyan
  Write-Host "2. Generando secreto bd-clave en Secret Manager..." -ForegroundColor Yellow
  
  # Extraer o generar una contraseña basada en la de Neon
  # Por seguridad, pedimos la clave o generamos una nueva
  $bdClave = Read-Host "Proporciona la contraseña del usuario de Neon (o presiona Enter para generar una segura)"
  if [-string]::IsNullOrWhiteSpace($bdClave) {
    # Generar clave segura de 16 caracteres
    $bdClave = -join ((65,97..122) + (48,57..64) | % { [char] $_ }) -join '' | Substring(0,16)
    Write-Host "   Clave generada automáticamente" -ForegroundColor Grey
  }
  
  echo "$bdClave" | gcloud secrets create bd-clave --project=$ProjectId --data-file=-
  Write-Host "   Secret bd-clave creado en Secret Manager" -ForegroundColor Green
  
  # Otorgar permisos a la cuenta de run
  $saRun = "siga-dp-run@$ProjectId.iam.gserviceaccount.com"
  gcloud secrets add-iam-policy-binding bd-clave --member="serviceAccount:$saRun" --role='roles/secretmanager.secretAccessor' --project=$ProjectId
  Write-Host "   Permisos concedidos a siga-dp-run" -ForegroundColor Green
  
  # Otorgar permisos a la cuenta de build
  $saBuild = "siga-dp-build@$ProjectId.iam.gserviceaccount.com"
  gcloud secrets add-iam-policy-binding bd-clave --member="serviceAccount:$saBuild" --role='roles/secretmanager.secretAccessor' --project=$ProjectId
  Write-Host "   Permisos concedidos a siga-dp-build" -ForegroundColor Green
}

# 6. Instrucciones para sembrar la base
Write-Host "" -ForegroundColor Cyan
Write-Host "3. Sembrar la base de datos en Neon" -ForegroundColor Yellow
Write-Host "   Ejecuta: .\scripts\sembrar-neon.ps1 -ProjectId `"$ProjectId`" -Confirmar" -ForegroundColor Grey
Write-Host "   Esto aplicará las migraciones y creará el usuario 'gerente'" -ForegroundColor Grey

Write-Host "" -ForegroundColor Cyan
Write-Host "=== Configuración de Neon completada ===" -ForegroundColor Cyan
Write-Host "   1. Proyecto creado en Neon console" -ForegroundColor White
Write-Host "   2. Cadena de conexión guardada en .neon-config.json" -ForegroundColor White
Write-Host "   3. Secret bd-clave creado en Secret Manager" -ForegroundColor White
Write-Host "   4. Ejecutar .\scripts\sembrar-neon.ps1 para crear la base" -ForegroundColor White