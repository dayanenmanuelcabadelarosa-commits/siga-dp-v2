<# =============================================================================
  crear-repo-github.ps1 - SIGA-DP v2
  Crea un repositorio en GitHub y configura los remotos.
  Ejecución: PowerShell 3.0+
=======================================================================
#>param(
  [Parameter(Mandatory=$true)]
  [string]$Nombre,

  [Parameter(Mandatory=$true)]
  [string]$Descripcion = "SIGA-DP v2 - Sistema de gestión del Asadero Doña Pula",

  [Switch]$Confirmar
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Creando repositorio en GitHub ===`n" -ForegroundColor Cyan

# 1. Verificar que gh (GitHub CLI) esté disponible
Write-Host "1. Verificando GitHub CLI..." -ForegroundColor Yellow
$ghVersion = gh version 2>&1
Write-Host "   $ghVersion" -ForegroundColor Grey

# 2. Autenticarse si no está autenticado
$isAuth = gh auth status 2>&1
if ($LASTLASTEXITCODE -ne 0 -or $isAuth -notmatch "Logged in") {
  Write-Host "   Necesitas iniciar sesión en GitHub" -ForegroundColor Yellow
  gh auth login 2>&1
}

# 3. Crear el repositorio
Write-Host "2. creando repositorio: $Nombre" -ForegroundColor Yellow
$repoCreate = gh repo create $Nombre --public --description "$Descripcion" 2>&1
Write-Host "   Repositorio creado" -ForegroundColor Green

# 4. Configurar remotos
Write-Host "3. Configurando remotos..." -ForegroundColor Yellow

# Verificar remotos actuales
$remotes = git remote -v 2>&1
Write-Host "   Remotos actuales: $remotes" -ForegroundColor Grey

# Agregar remote 'produccion' si no existe
if (-not $remotes -match "produccion") {
  gh repo set-default $Nombre 2>&1
  Write-Host "   Remote 'produccion' configurado" -ForegroundColor Green
} else {
  Write-Host "   Remote 'produccion' ya existe" -ForegroundColor Grey
}

# 5. Subir el historial
Write-Host "4. Subiendo historial..." -ForegroundColor Yellow
$branch = (git branch --show-current) 2>&1
Write-Host "   Rama actual: $branch" -ForegroundColor Grey

if ($Confirmar) {
  git push -u produccion $branch 2>&1
  Write-Host "   Historial subido a produccion" -ForegroundColor Green
} else {
  Write-Host "   No se subió el historial (usa -Confirmar para forzarlo)" -ForegroundColor Yellow
}

# 6. Instrucciones finales
Write-Host "" -ForegroundColor Cyan
Write-Host "=== Repositorio listo ===" -ForegroundColor Cyan
Write-Host "   URL: https://github.com/cabadayan-png/$Nombre" -ForegroundColor White
Write-Host "   Próximo paso: Conectar repositorio con Cloud Build triggers" -ForegroundColor White
Write-Host "   1. Ir a Google Cloud Console → Cloud Build → Triggers" -ForegroundColor White
Write-Host "   2. Conectar repositorio GitHub" -ForegroundColor White
Write-Host "   3. Elegir el repositorio siga-dp-v2" -ForegroundColor White
Write-Host "   4. Configurar trigger en push a main" -ForegroundColor White