# =============================================================================
#  Configurar Neon (PostgreSQL externo, plan gratuito)
# =============================================================================
#
#  Que hace:
#    - Lee la cadena de conexion de Neon SIN mostrarla en pantalla.
#    - Guarda la contrasena en Secret Manager (secreto "bd-clave").
#    - Deja un archivo local ".neon-config.json" con los datos NO secretos
#      (host, puerto, usuario, base) para que los demas scripts los reutilicen.
#
#  Que NO hace:
#    - No crea el proyecto en Neon: eso se hace en https://console.neon.tech
#      (plan Free, 0 USD). Este script solo conecta lo que ya existe.
#    - No imprime contrasenas ni las escribe en el repositorio.
#
#  Uso:
#    .\scripts\configurar-neon.ps1 -ProjectId "siga-dp-prod-org"
#
#  Antes hay que haber ejecutado preparar-gcp.ps1 (crea las APIs, Artifact
#  Registry, cuentas de servicio y los demas secretos).
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$Repo = "siga-dp",
  [string]$Servicio = "siga-dp",
  [string]$CuentaEjecucion = "siga-dp-run",
  [string]$ArchivoConfiguracion = ".neon-config.json"
)

$ErrorActionPreference = "Stop"

function Paso($texto) {
  Write-Host ""
  Write-Host "==> $texto" -ForegroundColor Cyan
}

function NuevoHex {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return ([System.BitConverter]::ToString($buffer) -replace "-", "").ToLowerInvariant()
}

function GuardarSecreto {
  param([string]$Nombre, [string]$Valor)

  & gcloud secrets describe $Nombre --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & gcloud secrets create $Nombre --replication-policy=automatic --labels=app=siga-dp --project=$ProjectId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el secreto $Nombre." }
    Write-Host "  creado    $Nombre"
  } else {
    Write-Host "  ya existe $Nombre"
  }

  $token = (& gcloud auth print-access-token --project=$ProjectId | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "No hay token de gcloud. Ejecuta: gcloud auth login"
  }

  $datos = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Valor))
  $cuerpo = @{ payload = @{ data = $datos } } | ConvertTo-Json -Compress

  Invoke-RestMethod `
    -Method Post `
    -Uri "https://secretmanager.googleapis.com/v1/projects/$ProjectId/secrets/$Nombre/versions:add" `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $cuerpo | Out-Null

  Write-Host "  version   $Nombre (sin imprimir el valor)"
}

# ---------------------------------------------------------------------------
# 1. Comprobar la sesion de gcloud
# ---------------------------------------------------------------------------
Paso "Comprobando la sesion de gcloud"
$tokenPrueba = & gcloud auth print-access-token --project=$ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "La sesion de gcloud no sirve. Ejecuta: gcloud auth login"
}
Write-Host "  sesion valida"
& gcloud config set project $ProjectId | Out-Null

# ---------------------------------------------------------------------------
# 2. Leer la cadena de conexion sin mostrarla
# ---------------------------------------------------------------------------
Paso "Cadena de conexion de Neon"
Write-Host "En https://console.neon.tech abre tu proyecto y copia la cadena:"
Write-Host "  postgresql://USUARIO:CLAVE@HOST/BASE?sslmode=require"
Write-Host "Usa el host DIRECTO (sin '-pooler'): las migraciones usan candados de sesion." -ForegroundColor Yellow
Write-Host ""

$seguro = Read-Host "Pega la cadena (no se vera al escribir)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
  $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($texto)) {
  throw "No se recibio ninguna cadena de conexion."
}

# Acepta "postgresql://..." o el formato de parametros de Neon.
if ($texto -notmatch '^postgres(ql)?://') {
  throw "La cadena debe empezar por postgresql:// o postgres://."
}

$uri = [Uri]$texto
if ([string]::IsNullOrWhiteSpace($uri.UserInfo)) {
  throw "La cadena no trae usuario y contrasena."
}

$partes = $uri.UserInfo.Split(':', 2)
$usuario = [Uri]::UnescapeDataString($partes[0])
$clave = if ($partes.Count -gt 1) { [Uri]::UnescapeDataString($partes[1]) } else { "" }

if ([string]::IsNullOrWhiteSpace($usuario) -or [string]::IsNullOrWhiteSpace($clave)) {
  throw "La cadena no trae usuario o contrasena validos."
}

$hostNeon = $uri.Host
$puertoNeon = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$baseNeon = $uri.AbsolutePath.TrimStart('/')

if ([string]::IsNullOrWhiteSpace($baseNeon)) {
  throw "La cadena no trae el nombre de la base."
}

if ($hostNeon -notmatch '\.neon\.tech$') {
  Write-Host "  AVISO: el host no termina en .neon.tech. Se usara igual, con TLS." -ForegroundColor Yellow
}

if ($hostNeon -match '-pooler\.') {
  Write-Host "  AVISO: el host es el agrupado (-pooler). Para migraciones conviene el directo." -ForegroundColor Yellow
}

Write-Host "  host:    $hostNeon"
Write-Host "  puerto:  $puertoNeon"
Write-Host "  usuario: $usuario"
Write-Host "  base:    $baseNeon"
Write-Host "  TLS:     verificando certificado"

# ---------------------------------------------------------------------------
# 3. Guardar la contrasena en Secret Manager
# ---------------------------------------------------------------------------
Paso "Guardando la contrasena en Secret Manager"
GuardarSecreto -Nombre "bd-clave" -Valor $clave

# Si no existe la clave de sesion, se crea aqui para que el despliegue no falle.
& gcloud secrets describe "clave-sesion" --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  GuardarSecreto -Nombre "clave-sesion" -Valor (NuevoHex 48)
} else {
  Write-Host "  ya existe clave-sesion (no se cambia)"
}

# ---------------------------------------------------------------------------
# 4. Guardar la configuracion NO secreta
# ---------------------------------------------------------------------------
Paso "Guardando la configuracion local"
$config = [ordered]@{
  proveedor        = "neon"
  host             = $hostNeon
  puerto           = $puertoNeon
  usuario          = $usuario
  base             = $baseNeon
  ssl              = $true
  sslVerificar     = $true
  region           = $Region
  repo             = $Repo
  servicio         = $Servicio
  cuentaEjecucion  = $CuentaEjecucion
  actualizadoEn    = (Get-Date).ToString("s")
}

$config | ConvertTo-Json | Set-Content -Path $ArchivoConfiguracion -Encoding UTF8

Write-Host "  archivo: $ArchivoConfiguracion (sin contrasena)"
Write-Host ""
Write-Host "Siguiente paso:" -ForegroundColor Green
Write-Host "  .\scripts\sembrar-neon.ps1 -ProjectId `"$ProjectId`" -Confirmar"
Write-Host ""
Write-Host "  (o, si vas a copiar datos existentes:)"
Write-Host "  .\scripts\migrar-datos-neon.ps1 -ProjectId `"$ProjectId`" -Confirmar"
Write-Host ""
Write-Host "Despues:" 
Write-Host "  .\scripts\desplegar-neon.ps1 -ProjectId `"$ProjectId`""
