# =============================================================================
#  Desplegar SIGA-DP v2 en Cloud Run con Neon (sin Cloud SQL)
# =============================================================================
#
#  Requisitos:
#    - gcloud autenticado (gcloud auth login) y con permisos en el proyecto.
#    - preparar-gcp.ps1 ejecutado (APIs, Artifact Registry, cuentas, secretos).
#    - configurar-neon.ps1 ejecutado (genera .neon-config.json y "bd-clave").
#    - El esquema ya cargado en Neon (sembrar-neon.ps1 o migrar-datos-neon.ps1).
#
#  Que hace:
#    1. Comprueba la sesion y la configuracion local.
#    2. Construye la imagen en Cloud Build y la publica en Artifact Registry.
#    3. Despliega Cloud Run con min-instances=0 (sin costo cuando nadie usa la app).
#    4. Ajusta ORIGENES a la URL publica y la imprime.
#
#  Coste: Cloud Build y Cloud Run dentro del nivel gratuito para este uso.
#  Neon Free: 0 USD. No se crea Cloud SQL.
#
#  Uso:
#    .\scripts\desplegar-neon.ps1 -ProjectId "siga-dp-prod-org"
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "",
  [string]$Repo = "",
  [string]$Servicio = "",
  [string]$CuentaEjecucion = "",
  [string]$CuentaBuild = "siga-dp-build",
  [int]$MinInstancias = 0,
  [int]$MaxInstancias = 2,
  [string]$ArchivoConfiguracion = ".neon-config.json",
  [switch]$SinConstruir
)

$ErrorActionPreference = "Stop"

function Paso($texto) {
  Write-Host ""
  Write-Host "==> $texto" -ForegroundColor Cyan
}

function Gcloud {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Argumentos)
  & gcloud @Argumentos
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo: gcloud $($Argumentos -join ' ')"
  }
}

# ---------------------------------------------------------------------------
# 1. Configuracion
# ---------------------------------------------------------------------------
if (-not (Test-Path $ArchivoConfiguracion)) {
  throw "No existe $ArchivoConfiguracion. Ejecuta primero: .\scripts\configurar-neon.ps1 -ProjectId `"$ProjectId`""
}

$config = Get-Content $ArchivoConfiguracion -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($Region)) { $Region = $config.region }
if ([string]::IsNullOrWhiteSpace($Repo)) { $Repo = $config.repo }
if ([string]::IsNullOrWhiteSpace($Servicio)) { $Servicio = $config.servicio }
if ([string]::IsNullOrWhiteSpace($CuentaEjecucion)) { $CuentaEjecucion = $config.cuentaEjecucion }

foreach ($campo in @("host", "usuario", "base")) {
  if ([string]::IsNullOrWhiteSpace($config.$campo)) {
    throw "Falta '$campo' en $ArchivoConfiguracion. Vuelve a ejecutar configurar-neon.ps1."
  }
}

Paso "Comprobando la sesion de gcloud"
& gcloud auth print-access-token --project=$ProjectId 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "La sesion de gcloud no sirve. Ejecuta: gcloud auth login"
}
Write-Host "  sesion valida"
Gcloud config set project $ProjectId | Out-Null

Write-Host "  servicio:  $Servicio"
Write-Host "  region:    $Region"
Write-Host "  Neon:      $($config.host)/$($config.base)"
Write-Host "  instancias: min=$MinInstancias max=$MaxInstancias"

# ---------------------------------------------------------------------------
# 2. Construir y desplegar
# ---------------------------------------------------------------------------
if (-not $SinConstruir) {
  Paso "Construyendo y desplegando con Cloud Build"

  $subs = @(
    "_REGION=$Region",
    "_REPO=$Repo",
    "_SERVICE=$Servicio",
    "_IMAGE=$Servicio",
    "_BD_HOST=$($config.host)",
    "_BD_PUERTO=$($config.puerto)",
    "_BD_USUARIO=$($config.usuario)",
    "_BD_NOMBRE=$($config.base)",
    "_BD_SSL=true",
    "_BD_SSL_VERIFICAR=$($config.sslVerificar.ToString().ToLowerInvariant())",
    "_RUN_SA=$CuentaEjecucion@$ProjectId.iam.gserviceaccount.com",
    "_MIN_INSTANCES=$MinInstancias",
    "_MAX_INSTANCES=$MaxInstancias"
  ) -join ","

  $cuentaBuildCompleta = "$CuentaBuild@$ProjectId.iam.gserviceaccount.com"

  Gcloud builds submit . `
    --project=$ProjectId `
    --config=cloudbuild-externo.yaml `
    --service-account=$cuentaBuildCompleta `
    --substitutions=$subs
} else {
  Paso "Omitiendo la construccion (-SinConstruir)"
}

# ---------------------------------------------------------------------------
# 3. URL publica
# ---------------------------------------------------------------------------
Paso "Leyendo la URL del servicio"
$url = (& gcloud run services describe $Servicio --region=$Region --project=$ProjectId --format="value(status.url)" | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($url)) {
  throw "No se pudo leer la URL del servicio $Servicio."
}

Write-Host ""
Write-Host "URL publica: $url" -ForegroundColor Green
Write-Host ""
Write-Host "Comprobacion rapida:"
Write-Host "  .\scripts\verificar-servicio.ps1 -Url `"$url`""
Write-Host ""
Write-Host "Si el primer acceso tarda unos segundos es normal: Cloud Run arranca desde 0"
Write-Host "y Neon despierta si estuvo inactivo."
