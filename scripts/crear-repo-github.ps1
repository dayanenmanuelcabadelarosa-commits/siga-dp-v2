# =============================================================================
#  Crear un repositorio NUEVO en GitHub y subir el proyecto
# =============================================================================
#
#  Por que un repositorio nuevo:
#    El remoto actual (cabadayan-png/siga-dp) no responde con ramas y no hay
#    credenciales configuradas. Este script crea un repositorio limpio en tu
#    cuenta y sube el historial completo, sin tocar el remoto actual.
#
#  Requisitos:
#    - GitHub CLI instalado y autenticado:
#        gh auth login
#    - Permiso para crear repositorios en tu cuenta.
#
#  Uso:
#    .\scripts\crear-repo-github.ps1 -Nombre "siga-dp-v2"
#    .\scripts\crear-repo-github.ps1 -Nombre "siga-dp-v2" -Confirmar
#
#  Sin -Confirmar solo muestra el plan.
#
#  AVISO DE SEGURIDAD:
#    El historial antiguo contiene credenciales reales que ya estuvieron en Git.
#    Un repositorio nuevo no las borra del pasado: hay que rotarlas igual.
#    Ver docs/ROTACION-DE-SECRETOS.md.
# =============================================================================

[CmdletBinding()]
param(
  [string]$Nombre = "siga-dp-v2",
  [ValidateSet("private", "public")]
  [string]$Visibilidad = "private",
  [string]$Remoto = "produccion",
  [string]$Descripcion = "SIGA-DP v2 - Sistema de Gestion del Asadero Dona Pula",
  [switch]$Confirmar
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot

function Paso($texto) {
  Write-Host ""
  Write-Host "==> $texto" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# 1. Comprobar gh
# ---------------------------------------------------------------------------
$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  throw "GitHub CLI no esta instalado. Instalalo con: winget install --id GitHub.cli"
}

& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub CLI no esta autenticado." -ForegroundColor Yellow
  Write-Host "Ejecuta esto en tu terminal y vuelve a correr el script:"
  Write-Host "  gh auth login" -ForegroundColor Green
  throw "Falta autenticacion de GitHub."
}

$dueno = (& gh api user --jq ".login" | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($dueno)) { throw "No se pudo leer el usuario de GitHub." }

$repoCompleto = "$dueno/$Nombre"

Write-Host "Cuenta:   $dueno"
Write-Host "Repo:     $repoCompleto ($Visibilidad)"
Write-Host "Remoto:   $Remoto"
Write-Host "Origen:   $raiz"

# ---------------------------------------------------------------------------
# 2. Comprobar que no exista
# ---------------------------------------------------------------------------
& gh repo view $repoCompleto 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  throw "El repositorio $repoCompleto ya existe. Elige otro nombre con -Nombre."
}

if (-not $Confirmar) {
  Write-Host ""
  Write-Host "Modo simulacion. Para crearlo de verdad:" -ForegroundColor Yellow
  Write-Host "  .\scripts\crear-repo-github.ps1 -Nombre `"$Nombre`" -Confirmar" -ForegroundColor Yellow
  exit 0
}

# ---------------------------------------------------------------------------
# 3. Crear y subir
# ---------------------------------------------------------------------------
Paso "Configurando credenciales de git para gh"
& gh auth setup-git
if ($LASTEXITCODE -ne 0) { throw "No se pudo configurar git con gh." }

Paso "Creando el repositorio"
& gh repo create $repoCompleto --$Visibilidad --description $Descripcion
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el repositorio." }

Push-Location $raiz
try {
  $existe = (& git remote | Out-String) -split "`n" | Where-Object { $_.Trim() -eq $Remoto }
  if (-not $existe) {
    & git remote add $Remoto "https://github.com/$repoCompleto.git"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo agregar el remoto $Remoto." }
  } else {
    Write-Host "  el remoto $Remoto ya existe"
  }

  Paso "Subiendo ramas e historial"
  & git push $Remoto --all
  if ($LASTEXITCODE -ne 0) { throw "Fallo el push de las ramas." }

  & git push $Remoto --tags
  if ($LASTEXITCODE -ne 0) { Write-Host "  aviso: no se pudieron subir las etiquetas" -ForegroundColor Yellow }

  $rama = (& git branch --show-current | Out-String).Trim()
  if (-not [string]::IsNullOrWhiteSpace($rama)) {
    & git branch --set-upstream-to="$Remoto/$rama" $rama 2>$null | Out-Null
  }
} finally {
  Pop-Location
}

Paso "Listo"
Write-Host "Repositorio: https://github.com/$repoCompleto" -ForegroundColor Green
Write-Host "Remoto local: $Remoto"
Write-Host ""
Write-Host "Recuerda rotar las credenciales que quedaron en el historial:" -ForegroundColor Yellow
Write-Host "  docs/ROTACION-DE-SECRETOS.md"
