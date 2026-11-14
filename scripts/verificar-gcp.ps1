# =============================================================================
#  Diagnóstico de solo lectura de Google Cloud
# =============================================================================
#  No crea, modifica ni borra nada. Sirve para saber en qué estado está la
#  cuenta antes de autorizar gastos.
#
#  Uso:
#    .\scripts\verificar-gcp.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

function Titulo($texto) {
  Write-Host ""
  Write-Host "=== $texto ===" -ForegroundColor Cyan
}

Titulo "Cuentas autenticadas"
gcloud auth list --format="table(account,status)"

Titulo "Configuración activa"
gcloud config list

Titulo "Proyecto activo"
$proyecto = (gcloud config get-value project 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($proyecto) -or $proyecto -eq "(unset)") {
  Write-Host "No hay proyecto activo. Ejecuta: gcloud config set project TU_PROYECTO" -ForegroundColor Yellow
  exit 1
}
Write-Host $proyecto

Titulo "APIs necesarias"
$necesarias = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "sqladmin.googleapis.com",
  "secretmanager.googleapis.com",
  "iam.googleapis.com"
)
$habilitadas = gcloud services list --enabled --project="$proyecto" --format="value(config.name)"
foreach ($api in $necesarias) {
  if ($habilitadas -contains $api) {
    Write-Host "  OK      $api" -ForegroundColor Green
  } else {
    Write-Host "  FALTA   $api" -ForegroundColor Yellow
  }
}

Titulo "Repositorio de Artifact Registry"
try {
  gcloud artifacts repositories describe siga-dp --location=us-central1 --project="$proyecto" --format="value(name)"
} catch {
  Write-Host "  No existe todavía (lo crea scripts/preparar-gcp.ps1)." -ForegroundColor Yellow
}

Titulo "Instancia de Cloud SQL"
try {
  gcloud sql instances describe siga-dp-db --project="$proyecto" --format="table(name,databaseVersion,state,region,tier)"
} catch {
  Write-Host "  No existe todavía (la crea scripts/crear-cloudsql.ps1 con autorización)." -ForegroundColor Yellow
}

Titulo "Servicio de Cloud Run"
try {
  gcloud run services describe siga-dp --region=us-central1 --project="$proyecto" --format="table(metadata.name,status.url)"
} catch {
  Write-Host "  No existe todavía." -ForegroundColor Yellow
}

Titulo "Recordatorio de costes"
Write-Host "Cloud Run con min-instances=0 no cobra CPU cuando no hay tráfico."
Write-Host "Cloud SQL SÍ cobra mientras la instancia existe, aunque no haya usuarios."
Write-Host "Consulta docs/DESPLIEGUE-GCP.md antes de crear la instancia."
