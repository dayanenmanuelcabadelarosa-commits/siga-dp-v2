# =============================================================================
#  Verificación de un despliegue de SIGA-DP v2
# =============================================================================
#
#  Comprueba, sin instalar nada:
#    1. /api/salud responde 200.
#    2. La página principal devuelve el HTML del cliente.
#    3. Una ruta profunda (SPA) devuelve index.html y no 404.
#    4. El login contra PostgreSQL funciona.
#    5. /api/acceso/yo devuelve el usuario y sus permisos.
#    6. Una ruta inexistente devuelve 404 con el formato de la API.
#
#  Uso:
#    .\scripts\verificar-servicio.ps1 -Url "https://siga-dp-xxxx-uc.a.run.app"
#
#  Para el login, si no pasas -Usuario, lo pide por consola. La clave se pide
#  como SecureString y no se imprime.
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Url,

  [string]$Usuario = "gerente",
  [string]$Clave = ""
)

$ErrorActionPreference = "Stop"
$Url = $Url.TrimEnd("/")
$fallos = 0

function Bien($texto) {
  Write-Host "  OK   $texto" -ForegroundColor Green
}

function Mal($texto) {
  Write-Host "  FALLA $texto" -ForegroundColor Red
  $script:fallos++
}

Write-Host "Verificando $Url"
Write-Host ""

# 1. Salud
try {
  $salud = Invoke-RestMethod "$Url/api/salud" -TimeoutSec 20
  if ($salud.ok -eq $true -and $salud.datos.estado -eq "ok") {
    Bien "/api/salud -> ok"
  } else {
    Mal "/api/salud respondió algo inesperado"
  }
} catch {
  Mal "/api/salud no respondió: $($_.Exception.Message)"
}

# 2. Página principal
try {
  $codigo = curl.exe -s -o "$env:TEMP\siga-verificacion-index.html" -w "%{http_code}" "$Url/"
  $html = Get-Content "$env:TEMP\siga-verificacion-index.html" -Raw
  if ($codigo -eq "200" -and $html -match 'id="root"') {
    Bien "página principal -> HTML del cliente"
  } else {
    Mal "página principal -> HTTP $codigo"
  }
} catch {
  Mal "página principal: $($_.Exception.Message)"
}

# 3. Ruta profunda (SPA)
try {
  $codigo = curl.exe -s -o "$env:TEMP\siga-verificacion-spa.html" -w "%{http_code}" "$Url/cuentas"
  $html = Get-Content "$env:TEMP\siga-verificacion-spa.html" -Raw
  if ($codigo -eq "200" -and $html -match 'id="root"') {
    Bien "ruta profunda /cuentas -> index.html (SPA)"
  } else {
    Mal "ruta profunda /cuentas -> HTTP $codigo"
  }
} catch {
  Mal "ruta profunda: $($_.Exception.Message)"
}

# 4. Login
$token = $null
try {
  if ([string]::IsNullOrWhiteSpace($Clave)) {
    $seguro = Read-Host "Clave de $Usuario" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try {
      $Clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  $cuerpo = @{ usuario = $Usuario; clave = $Clave } | ConvertTo-Json -Compress
  $login = Invoke-RestMethod "$Url/api/acceso/entrar" `
    -Method Post `
    -ContentType "application/json" `
    -Body $cuerpo `
    -TimeoutSec 20

  if ($login.ok -eq $true -and -not [string]::IsNullOrWhiteSpace($login.datos.token)) {
    $token = $login.datos.token
    Bien "login de '$Usuario' -> token emitido"
  } else {
    Mal "login de '$Usuario' -> respuesta inesperada"
  }
} catch {
  $detalle = ""
  if ($_.ErrorDetails) { $detalle = $_.ErrorDetails.Message }
  Mal "login de '$Usuario' -> $($_.Exception.Message) $detalle"
}

# 5. /yo
if ($null -ne $token) {
  try {
    $yo = Invoke-RestMethod "$Url/api/acceso/yo" `
      -Headers @{ Authorization = "Bearer $token" } `
      -TimeoutSec 20
    if ($yo.ok -eq $true) {
      Bien "/api/acceso/yo -> $($yo.datos.usuario.nombre) ($($yo.datos.usuario.rol_nombre)), $($yo.datos.permisos.Count) permisos"
    } else {
      Mal "/api/acceso/yo -> respuesta inesperada"
    }
  } catch {
    Mal "/api/acceso/yo -> $($_.Exception.Message)"
  }
}

# 6. 404 de la API
try {
  $codigo = curl.exe -s -o "$env:TEMP\siga-verificacion-404.json" -w "%{http_code}" "$Url/api/no-existe"
  if ($codigo -eq "404") {
    Bien "ruta inexistente -> 404"
  } else {
    Mal "ruta inexistente -> HTTP $codigo"
  }
} catch {
  Mal "ruta inexistente: $($_.Exception.Message)"
}

Write-Host ""
if ($fallos -eq 0) {
  Write-Host "Todas las comprobaciones pasaron." -ForegroundColor Green
} else {
  Write-Host "$fallos comprobación(es) fallaron." -ForegroundColor Red
  exit 1
}
