# =============================================================================
#  Copiar datos locales a Neon (opcional)
# =============================================================================
#
#  Para que sirve:
#    Pasar una copia de la base local (por ejemplo la de demostracion) a Neon.
#    Conserva tablas, relaciones, indices, disparadores y funciones porque se usa
#    pg_dump en formato personalizado + pg_restore.
#
#  Que hace, en orden:
#    1. pg_dump de la base local a un archivo temporal.
#    2. pg_restore sobre Neon (--clean --if-exists: reemplaza el esquema).
#    3. Cambia la clave del usuario "gerente" por la del secreto "clave-admin"
#       para no dejar en produccion la clave de desarrollo.
#    4. Compara el numero de filas de cada tabla entre origen y destino.
#
#  ADVERTENCIA:
#    Un dump de desarrollo trae datos de ejemplo y usuarios con claves debiles.
#    Para un arranque limpio usa sembrar-neon.ps1 en vez de este script.
#
#  Uso:
#    .\scripts\migrar-datos-neon.ps1 -ProjectId "siga-dp-prod-org" -Confirmar
#
#  Requiere psql / pg_dump / pg_restore (vienen con PostgreSQL).
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$ArchivoConfiguracion = ".neon-config.json",

  [string]$OrigenHost = "localhost",
  [int]$OrigenPuerto = 5432,
  [string]$OrigenUsuario = "postgres",
  [string]$OrigenBase = "siga_dp_v2",

  [string]$PgBin = "",
  [string]$UsuarioAdministrador = "gerente",

  [switch]$Confirmar
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$herramientaClave = Join-Path $raiz "servidor\herramientas\cambiar-clave.js"

function Paso($texto) {
  Write-Host ""
  Write-Host "==> $texto" -ForegroundColor Cyan
}

function BuscarPgBin {
  param([string]$RutaIndicada)

  if (-not [string]::IsNullOrWhiteSpace($RutaIndicada)) {
    if (Test-Path (Join-Path $RutaIndicada "pg_dump.exe")) { return $RutaIndicada }
    throw "En '$RutaIndicada' no esta pg_dump.exe."
  }

  $comando = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($comando) { return (Split-Path -Parent $comando.Source) }

  $candidatos = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin" }

  foreach ($candidato in $candidatos) {
    if (Test-Path (Join-Path $candidato "pg_dump.exe")) { return $candidato }
  }

  throw "No se encontro pg_dump. Instala PostgreSQL o pasa -PgBin 'C:\Program Files\PostgreSQL\18\bin'."
}

function LeerSecreto {
  param([string]$Nombre)

  $valor = (& gcloud secrets versions access latest --secret=$Nombre --project=$ProjectId 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($valor)) {
    throw "No se pudo leer el secreto '$Nombre'."
  }
  return $valor
}

function PedirClaveLocal {
  $seguro = Read-Host "Clave del PostgreSQL local para '$OrigenUsuario' (no se vera)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function TablasPublicas {
  param([string]$Psql, [string]$HostDestino, [int]$Puerto, [string]$Usuario, [string]$Base)

  $tablas = & $Psql -h $HostDestino -p $Puerto -U $Usuario -d $Base -t -A -c "select tablename from pg_tables where schemaname='public' order by 1;"
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron listar las tablas de $Base." }
  return @($tablas | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function ContarFilas {
  param(
    [string]$Psql,
    [string]$HostDestino,
    [int]$Puerto,
    [string]$Usuario,
    [string]$Base,
    [string[]]$Tablas
  )

  if ($Tablas.Count -eq 0) { return @{} }

  $consultas = $Tablas | ForEach-Object { "select '$_' as tabla, count(*) as filas from ""$_""" }
  $sql = $consultas -join " union all "

  $salida = & $Psql -h $HostDestino -p $Puerto -U $Usuario -d $Base -t -A -F "|" -c $sql
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron contar las filas de $Base." }

  $mapa = @{}
  foreach ($linea in $salida) {
    if ([string]::IsNullOrWhiteSpace($linea)) { continue }
    $partes = $linea.Split("|")
    if ($partes.Count -eq 2) { $mapa[$partes[0]] = [int]$partes[1] }
  }
  return $mapa
}

# ---------------------------------------------------------------------------
# 1. Comprobaciones
# ---------------------------------------------------------------------------
if (-not (Test-Path $ArchivoConfiguracion)) {
  throw "No existe $ArchivoConfiguracion. Ejecuta primero: .\scripts\configurar-neon.ps1 -ProjectId `"$ProjectId`""
}

$config = Get-Content $ArchivoConfiguracion -Raw | ConvertFrom-Json
$PgBin = BuscarPgBin $PgBin

$psql = Join-Path $PgBin "psql.exe"
$pgDump = Join-Path $PgBin "pg_dump.exe"
$pgRestore = Join-Path $PgBin "pg_restore.exe"

Write-Host "Origen:  $OrigenHost`:$OrigenPuerto/$OrigenBase"
Write-Host "Destino: $($config.host):$($config.puerto)/$($config.base)"
Write-Host "Binarios: $PgBin"
Write-Host ""
Write-Host "Esto REEMPLAZA el esquema y los datos de la base destino." -ForegroundColor Yellow

if (-not $Confirmar) {
  Write-Host ""
  Write-Host "Modo simulacion. Para ejecutar de verdad:" -ForegroundColor Yellow
  Write-Host "  .\scripts\migrar-datos-neon.ps1 -ProjectId `"$ProjectId`" -Confirmar" -ForegroundColor Yellow
  exit 0
}

Paso "Comprobando la sesion de gcloud"
& gcloud auth print-access-token --project=$ProjectId 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "La sesion de gcloud no sirve. Ejecuta: gcloud auth login"
}

# ---------------------------------------------------------------------------
# 2. Volcado local
# ---------------------------------------------------------------------------
Paso "Volcando la base local"
$claveLocal = PedirClaveLocal

$marca = Get-Date -Format "yyyyMMdd-HHmmss"
$archivoDump = Join-Path $env:TEMP "siga-dp-$marca.dump"

$env:PGPASSWORD = $claveLocal
try {
  & $pgDump -h $OrigenHost -p $OrigenPuerto -U $OrigenUsuario -d $OrigenBase `
    --format=custom --no-owner --no-privileges --file=$archivoDump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

$tamano = (Get-Item $archivoDump).Length
if ($tamano -lt 1024) { throw "El volcado quedo vacio ($tamano bytes). No se toca el destino." }
Write-Host "  archivo: $archivoDump ($([math]::Round($tamano / 1KB, 1)) KB)"

# Contadores del origen antes de restaurar.
$env:PGPASSWORD = $claveLocal
try {
  $tablasOrigen = TablasPublicas -Psql $psql -HostDestino $OrigenHost -Puerto $OrigenPuerto -Usuario $OrigenUsuario -Base $OrigenBase
  $filasOrigen = ContarFilas -Psql $psql -HostDestino $OrigenHost -Puerto $OrigenPuerto -Usuario $OrigenUsuario -Base $OrigenBase -Tablas $tablasOrigen
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
Write-Host "  tablas en el origen: $($tablasOrigen.Count)"

# ---------------------------------------------------------------------------
# 3. Restauracion en Neon
# ---------------------------------------------------------------------------
Paso "Restaurando en Neon"
$claveNeon = LeerSecreto "bd-clave"

$env:PGPASSWORD = $claveNeon
$env:PGSSLMODE = "require"
try {
  & $pgRestore -h $config.host -p $config.puerto -U $config.usuario -d $config.base `
    --clean --if-exists --no-owner --no-privileges --single-transaction $archivoDump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore fallo." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 4. Rotar la clave del administrador
# ---------------------------------------------------------------------------
Paso "Cambiando la clave del usuario '$UsuarioAdministrador'"
$claveAdmin = LeerSecreto "clave-admin"

$env:BD_HOST = $config.host
$env:BD_PUERTO = "$($config.puerto)"
$env:BD_USUARIO = $config.usuario
$env:BD_NOMBRE = $config.base
$env:BD_SSL = "true"
$env:BD_SSL_VERIFICAR = "$($config.sslVerificar.ToString().ToLowerInvariant())"
$env:BD_CLAVE = $claveNeon
$env:NUEVA_CLAVE = $claveAdmin

try {
  Push-Location $raiz
  try {
    & node $herramientaClave --usuario $UsuarioAdministrador
    if ($LASTEXITCODE -ne 0) { throw "No se pudo cambiar la clave del administrador." }
  } finally {
    Pop-Location
  }
} finally {
  foreach ($variable in @("BD_CLAVE", "NUEVA_CLAVE")) {
    Remove-Item "Env:$variable" -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------------------
# 5. Comparar filas
# ---------------------------------------------------------------------------
Paso "Comparando filas entre origen y destino"
$env:PGPASSWORD = $claveNeon
$env:PGSSLMODE = "require"
try {
  $tablasDestino = TablasPublicas -Psql $psql -HostDestino $config.host -Puerto $config.puerto -Usuario $config.usuario -Base $config.base
  $filasDestino = ContarFilas -Psql $psql -HostDestino $config.host -Puerto $config.puerto -Usuario $config.usuario -Base $config.base -Tablas $tablasDestino
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}

$diferencias = @()
foreach ($tabla in $tablasOrigen) {
  $origen = if ($filasOrigen.ContainsKey($tabla)) { $filasOrigen[$tabla] } else { -1 }
  $destino = if ($filasDestino.ContainsKey($tabla)) { $filasDestino[$tabla] } else { -1 }

  if ($origen -ne $destino) {
    $diferencias += "$tabla (origen=$origen destino=$destino)"
  }
}

if ($diferencias.Count -eq 0) {
  Write-Host "  OK: las $($tablasOrigen.Count) tablas coinciden en numero de filas." -ForegroundColor Green
} else {
  Write-Host "  Diferencias encontradas:" -ForegroundColor Red
  $diferencias | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  throw "La copia no coincide. Revisa antes de desplegar."
}

# ---------------------------------------------------------------------------
# 6. Limpieza y resumen
# ---------------------------------------------------------------------------
Remove-Item $archivoDump -ErrorAction SilentlyContinue

Paso "Listo"
Write-Host "Datos copiados a Neon y clave del administrador rotada."
Write-Host "Clave: gcloud secrets versions access latest --secret=clave-admin --project=$ProjectId"
Write-Host ""
Write-Host "Siguiente paso:"
Write-Host "  .\scripts\desplegar-neon.ps1 -ProjectId `"$ProjectId`""
