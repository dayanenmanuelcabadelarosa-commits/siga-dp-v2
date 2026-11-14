# =============================================================================
#  Preparar la base de Neon y crear el administrador inicial
# =============================================================================
#
#  Que hace, en orden:
#    1. Lee la configuracion local de Neon (.neon-config.json).
#    2. Trae la contrasena de Neon desde Secret Manager, sin imprimirla.
#    3. Aplica las migraciones pendientes (mismo codigo que usa el contenedor).
#    4. Carga la semilla minima con una clave de administrador fuerte.
#
#  La clave del administrador queda en el secreto "clave-admin". Se lee asi:
#    gcloud secrets versions access latest --secret=clave-admin --project=...
#
#  Usa el usuario "gerente" que crea la semilla. Cambia esa clave desde la
#  pantalla de Personal y usuarios despues del primer acceso.
#
#  Uso:
#    .\scripts\sembrar-neon.ps1 -ProjectId "siga-dp-prod-org" -Confirmar
#
#  Sin -Confirmar solo muestra el plan y no toca la base.
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$ArchivoConfiguracion = ".neon-config.json",
  [switch]$Confirmar
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot

function Paso($texto) {
  Write-Host ""
  Write-Host "==> $texto" -ForegroundColor Cyan
}

function LeerSecreto {
  param([string]$Nombre)

  $valor = (& gcloud secrets versions access latest --secret=$Nombre --project=$ProjectId 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($valor)) {
    throw "No se pudo leer el secreto '$Nombre'. Ejecuta primero preparar-gcp.ps1 / configurar-neon.ps1."
  }
  return $valor
}

# ---------------------------------------------------------------------------
# 1. Configuracion
# ---------------------------------------------------------------------------
if (-not (Test-Path $ArchivoConfiguracion)) {
  throw "No existe $ArchivoConfiguracion. Ejecuta primero: .\scripts\configurar-neon.ps1 -ProjectId `"$ProjectId`""
}

$config = Get-Content $ArchivoConfiguracion -Raw | ConvertFrom-Json

Write-Host "Proyecto: $ProjectId"
Write-Host "Neon:     $($config.host)/$($config.base)"
Write-Host "Usuario:  $($config.usuario)"
Write-Host ""
Write-Host "Esto aplica migraciones y carga la semilla en ESA base."
Write-Host "No crea Cloud SQL y no despliega Cloud Run."

if (-not $Confirmar) {
  Write-Host ""
  Write-Host "Modo simulacion. Para ejecutar de verdad:" -ForegroundColor Yellow
  Write-Host "  .\scripts\sembrar-neon.ps1 -ProjectId `"$ProjectId`" -Confirmar" -ForegroundColor Yellow
  exit 0
}

# ---------------------------------------------------------------------------
# 2. Sesion y secretos en memoria
# ---------------------------------------------------------------------------
Paso "Comprobando la sesion de gcloud"
& gcloud auth print-access-token --project=$ProjectId 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "La sesion de gcloud no sirve. Ejecuta: gcloud auth login"
}
Write-Host "  sesion valida"

Paso "Leyendo secretos (sin imprimirlos)"
$env:BD_HOST = $config.host
$env:BD_PUERTO = "$($config.puerto)"
$env:BD_USUARIO = $config.usuario
$env:BD_NOMBRE = $config.base
$env:BD_SSL = "true"
$env:BD_SSL_VERIFICAR = "$($config.sslVerificar.ToString().ToLowerInvariant())"
$env:BD_CLAVE = LeerSecreto "bd-clave"
$env:SEMILLA_CLAVE = LeerSecreto "clave-admin"
$env:NODE_ENV = "production"

Write-Host "  bd-clave y clave-admin cargadas en el entorno del proceso"

# ---------------------------------------------------------------------------
# 3. Migraciones
# ---------------------------------------------------------------------------
Paso "Aplicando migraciones"
Push-Location $raiz
try {
  & node "servidor/herramientas/migrar.js"
  if ($LASTEXITCODE -ne 0) { throw "Las migraciones fallaron." }

  # -------------------------------------------------------------------------
  # 4. Semilla
  # -------------------------------------------------------------------------
  Paso "Cargando la semilla minima"
  & node "servidor/herramientas/semilla.js"
  if ($LASTEXITCODE -ne 0) { throw "La semilla fallo." }
} finally {
  Pop-Location
  Remove-Item Env:BD_CLAVE -ErrorAction SilentlyContinue
  Remove-Item Env:SEMILLA_CLAVE -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 5. Resumen
# ---------------------------------------------------------------------------
Paso "Listo"
Write-Host "Esquema y datos minimos cargados en Neon."
Write-Host ""
Write-Host "Clave del administrador inicial (leela cuando la necesites):"
Write-Host "  gcloud secrets versions access latest --secret=clave-admin --project=$ProjectId"
Write-Host ""
Write-Host "Siguiente paso:"
Write-Host "  .\scripts\desplegar-neon.ps1 -ProjectId `"$ProjectId`""
