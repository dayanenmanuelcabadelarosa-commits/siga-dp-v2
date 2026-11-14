# =============================================================================
#  Detener o arrancar Cloud SQL para ahorrar
# =============================================================================
#
#  Una instancia detenida NO cobra CPU/memoria, pero SÍ sigue cobrando el
#  almacenamiento y las copias de seguridad. No es gratis, solo más barato.
#
#  Detener:
#    .\scripts\detener-cloudsql.ps1 -ProjectId "mi-proyecto"
#
#  Volver a arrancar:
#    .\scripts\detener-cloudsql.ps1 -ProjectId "mi-proyecto" -Iniciar
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Instance = "siga-dp-db",
  [switch]$Iniciar
)

$ErrorActionPreference = "Stop"

$accion = if ($Iniciar) { "ALWAYS" } else { "NEVER" }

Write-Host "Instancia: $Instance"
Write-Host "Acción:    $(if ($Iniciar) { 'arrancar' } else { 'detener' })"
if (-not $Iniciar) {
  Write-Host ""
  Write-Host "Aviso: el almacenamiento y las copias se siguen cobrando." -ForegroundColor Yellow
  Write-Host "Aviso: Cloud SQL puede arrancar sola por mantenimiento tras 90 días detenida." -ForegroundColor Yellow
}

& gcloud sql instances patch $Instance `
  --project=$ProjectId `
  --activation-policy=$accion `
  --quiet

if ($LASTEXITCODE -ne 0) {
  throw "No se pudo cambiar el estado de la instancia."
}

Write-Host ""
Write-Host "Listo. Estado actual:"
gcloud sql instances describe $Instance --project=$ProjectId --format="value(state)"
