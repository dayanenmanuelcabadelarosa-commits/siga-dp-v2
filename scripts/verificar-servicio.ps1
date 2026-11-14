<# =============================================================================
  verificar-servicio.ps1 - SIGA-DP v2
  Verifica que el servicio de Cloud Run esté funcionando correctamente.
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$Url,

  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Parameter(Mandatory=$true)]
  [string]$Region = 'us-central1'
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Verificando servicio de SIGA-DP ===`n" -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor White
Write-Host "Proyecto: $ProjectId" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan

# 1. Describir el servicio
Write-Host "1. Obteniendo información del servicio..." -ForegroundColor Yellow
$describeCmd = "gcloud run services describe siga-dp --region=$Region --project=$ProjectId --format='value(status.url,spec.template.metadata.autoscaling.knative.dev/minScale)'"
$serviceInfo = Invoke-Expression $describeCmd 2>&1

Write-Host "   URL actual: $($serviceInfo -split "`n")[0]" -ForegroundColor Grey
Write-Host "   minScale: $($serviceInfo -split "`n")[1]" -ForegroundColor Grey

# 2. Probar endpoint de salud
Write-Host "2. Probando endpoint /api/salud..." -ForegroundColor Yellow
$healthUrl = "$Url/api/salud"
try {
  $healthResult = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 10
  Write-Host "   Resultado: $($healthResult.ok)" -ForegroundColor Green
  if ($healthResult.ok -and $healthResult.datos) {
    Write-Host "   Estado: $($healthResult.datos.estado)" -ForegroundColor Green
  }
} catch {
  Write-Host "   ERROR: No se pudo conectar con $healthUrl" -ForegroundColor Red
  Write-Host "   El servicio aún puede estar escalando a cero (espere 1-2 minutos)" -ForegroundColor Yellow
}

# 3. Probar raíz de la aplicación
Write-Host "3. Probando raíz de la aplicación..." -ForegroundColor Yellow
$raizUrl = "$Url/"
try {
  $raizResult = Invoke-RestMethod -Uri $raizUrl -Method Get -TimeoutSec 10
  Write-Host "   Status: OK" -ForegroundColor Green
  Write-Host "   Contiene #root: $($raizResult -match '#root')" -ForegroundColor Grey
} catch {
  Write-Host "   ERROR: No se pudo conectar con $raizUrl" -ForegroundColor Red
}

# 4. Probar login
Write-Host "4. Probando login..." -ForegroundColor Yellow
$loginUrl = "$Url/api/acceso/entrar"
$loginData = '{"usuario":"gerente","clave":"gerente"}'
try {
  $loginResult = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginData -ContentType "application/json" -TimeoutSec 10
  Write-Host "   Login exitoso" -ForegroundColor Green
  Write-Host "   Token recibido: $($loginResult.datos.token -substring 0, 20)..." -ForegroundColor Grey
  Write-Host "   Permisos: $($loginResult.datos.permisos.Count) permisos" -ForegroundColor Grey
} catch {
  Write-Host "   ERROR en login" -ForegroundColor Red
  Write-Host "   Verifica que los secretos bd-clave y clave-sesión estén configurados" -ForegroundColor Red
}

# 5. Probar obtener mi información
Write-Host "5. Probando /api/acceso/yo..." -ForegroundColor Yellow
$yoUrl = "$Url/api/acceso/yo"
try {
  # Obtener token del paso anterior (simplificado)
  $token = Read-Host "Proporciona un token de sesión (o deja vacío para saltar)"
  if [-string]::IsNullOrWhiteSpace($token) {
    Write-Host   "   Saltando prueba /api/acceso/yo" -ForegroundColor Yellow
  } else {
    $yoResult = Invoke-RestMethod -Uri $yoUrl -Method Get -Header @("Authorization"="Bearer $token") -TimeoutSec 10
    Write-Host "   Usuario: $($yoResult.datos.usuario)" -ForegroundColor Green
    Write-Host "   Rol: $($yoResult.datos.rol)" -ForegroundColor Green
    Write-Host "   Permisos: $($yoResult.datos.permisos.Count) permisos" -ForegroundColor Green
  }
} catch {
  Write-Host "   ERROR en /api/acceso/yo" -ForegroundColor Red
}

Write-Host "" -ForegroundColor Cyan
Write-Host "=== Verificación finalizada ===" -ForegroundColor Cyan