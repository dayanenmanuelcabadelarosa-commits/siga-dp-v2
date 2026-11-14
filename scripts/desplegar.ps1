# =============================================================================
#  Construir y desplegar SIGA-DP v2 en Cloud Run
# =============================================================================
#
#  No crea la base de datos ni los secretos: eso ya debe existir.
#  No usa Docker local: Cloud Build construye la imagen en Google Cloud.
#
#  Cloud SQL (recomendado si ya autorizaste la instancia):
#    .\scripts\desplegar.ps1 -ProjectId "mi-proyecto" `
#      -CloudSqlInstance "mi-proyecto:us-central1:siga-dp-db"
#
#  PostgreSQL externo (Neon/Supabase, sin Cloud SQL):
#    .\scripts\desplegar.ps1 -ProjectId "mi-proyecto" -Modo externo `
#      -BdHost "ep-xxxx.us-east-2.aws.neon.tech" `
#      -BdUser "neondb_owner" -BdName "neondb"
#
#  Añade -Si para no pedir confirmación (útil en automatización).
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [ValidateSet("cloudsql", "externo")]
  [string]$Modo = "cloudsql",
  [string]$CloudSqlInstance = "",
  [string]$BdHost = "",
  [string]$BdUser = "",
  [string]$BdName = "",
  [string]$BdPuerto = "5432",
  [string]$BuildServiceAccount = "siga-dp-build",
  [switch]$Si
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Push-Location $raiz
try {
  Write-Host "Proyecto: $ProjectId"
  Write-Host "Región:   $Region"
  Write-Host "Modo:     $Modo"
  Write-Host ""
  Write-Host "Cloud Run se desplegará con min-instances=0 y max-instances=2." -ForegroundColor Cyan
  Write-Host "Cloud SQL, si existe, sigue cobrando aunque no haya tráfico." -ForegroundColor Yellow
  Write-Host ""

  if ($Modo -eq "cloudsql" -and [string]::IsNullOrWhiteSpace($CloudSqlInstance)) {
    $CloudSqlInstance = "$ProjectId`:$Region`:siga-dp-db"
    Write-Host "Nombre de conexión asumido: $CloudSqlInstance"
  }

  if ($Modo -eq "externo") {
    if ([string]::IsNullOrWhiteSpace($BdHost) -or [string]::IsNullOrWhiteSpace($BdUser) -or [string]::IsNullOrWhiteSpace($BdName)) {
      throw "En modo externo hay que indicar -BdHost, -BdUser y -BdName."
    }
  }

  if (-not $Si) {
    $respuesta = Read-Host "¿Construir y desplegar ahora? (s/N)"
    if ($respuesta -notin @("s", "S", "si", "SI", "sí", "SÍ")) {
      Write-Host "Cancelado. No se desplegó nada." -ForegroundColor Green
      exit 0
    }
  }

  $cuenta = (gcloud auth list --filter="status:ACTIVE" --format="value(account)" | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($cuenta)) {
    throw "No hay una cuenta activa. Ejecuta: gcloud auth login"
  }

  $config = if ($Modo -eq "cloudsql") { "cloudbuild.yaml" } else { "cloudbuild-externo.yaml" }
  $sustituciones = "_REGION=$Region"

  if ($Modo -eq "cloudsql") {
    $sustituciones += ",_CLOUDSQL_INSTANCE=$CloudSqlInstance"
  } else {
    $sustituciones += ",_BD_HOST=$BdHost,_BD_PUERTO=$BdPuerto,_BD_USUARIO=$BdUser,_BD_NOMBRE=$BdName"
  }

  Write-Host ""
  Write-Host "==> gcloud builds submit ($config)" -ForegroundColor Cyan
  & gcloud builds submit `
    --project="$ProjectId" `
    --config="$config" `
    --substitutions="$sustituciones" `
    --service-account="$BuildServiceAccount@$ProjectId.iam.gserviceaccount.com"

  if ($LASTEXITCODE -ne 0) {
    throw "Cloud Build falló. Revisa los registros en la consola de Cloud Build."
  }

  Write-Host ""
  Write-Host "==> URL pública" -ForegroundColor Cyan
  $url = (gcloud run services describe siga-dp --region=$Region --project=$ProjectId --format="value(status.url)" | Out-String).Trim()
  Write-Host $url
  Write-Host ""
  Write-Host "Comprueba el servicio con:"
  Write-Host "  .\scripts\verificar-servicio.ps1 -Url `"$url`""
} finally {
  Pop-Location
}
