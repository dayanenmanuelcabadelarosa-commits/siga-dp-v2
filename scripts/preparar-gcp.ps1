# =============================================================================
#  Preparación de Google Cloud (sin Cloud SQL)
# =============================================================================
#
#  Qué crea:
#    �� Habilita las APIs necesarias.
#    �� Repositorio de Artifact Registry "siga-dp".
#    �� Cuenta de servicio de ejecución "siga-dp-run" con permisos mínimos.
#    �� Cuenta de servicio de build   "siga-dp-build" con permisos mínimos.
#    �� Secretos en Secret Manager (contraseñas e integraciones).
#
#  Qué NO crea:
#    �� Cloud SQL. Eso es facturable y va aparte, con crear-cloudsql.ps1.
#    �� El servicio de Cloud Run. Eso lo hace Cloud Build al desplegar.
#
#  Uso:
#    .\scripts\preparar-gcp.ps1 -ProjectId "mi-proyecto" -Ejecutar
#
#  Sin -Ejecutar solo muestra el plan y no cambia nada.
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$Repo = "siga-dp",
  [string]$RunServiceAccount = "siga-dp-run",
  [string]$BuildServiceAccount = "siga-dp-build",
  [switch]$SinCloudSql,
  [switch]$Ejecutar
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
    throw "Falló: gcloud $($Argumentos -join ' ')"
  }
}

function NuevoHex {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($buffer) -replace "-", "").ToLowerInvariant()
}

function LeerSecreto {
  param([string]$Etiqueta)
  $seguro = Read-Host $Etiqueta -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function AsegurarSecreto {
  param(
    [string]$Nombre,
    [string]$Valor,
    [string]$Etiqueta = ""
  )

  & gcloud secrets describe $Nombre --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Gcloud secrets create $Nombre `
      --replication-policy=automatic `
      --labels=app=siga-dp `
      --project=$ProjectId | Out-Null
    Write-Host "  creado    $Nombre"
  } else {
    Write-Host "  ya existe $Nombre"
  }

  if ([string]::IsNullOrEmpty($Etiqueta)) {
    $Etiqueta = $Nombre
  }

  $token = (gcloud auth print-access-token --project=$ProjectId | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "No se pudo obtener un token de acceso. Ejecuta: gcloud auth login"
  }

  $datos = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Valor))
  $cuerpo = @{ payload = @{ data = $datos } } | ConvertTo-Json -Compress

  Invoke-RestMethod `
    -Method Post `
    -Uri "https://secretmanager.googleapis.com/v1/projects/$ProjectId/secrets/$Nombre/versions:add" `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $cuerpo | Out-Null

  Write-Host "  versión   $Nombre (sin imprimir el valor)"
}

# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------
Write-Host "Proyecto: $ProjectId"
Write-Host "Región:   $Region"
Write-Host "Repo:     $Repo"
Write-Host "Run SA:   $RunServiceAccount"
Write-Host "Build SA: $BuildServiceAccount"
Write-Host ""
Write-Host "Este script NO crea Cloud SQL y NO despliega Cloud Run."
Write-Host "Cloud SQL cuesta aproximadamente USD 10-12/mes mientras exista."
Write-Host "Cloud Run con min-instances=0 no cobra CPU cuando está inactivo."

if (-not $Ejecutar) {
  Write-Host ""
  Write-Host "Modo simulación. Para ejecutar de verdad:" -ForegroundColor Yellow
  Write-Host "  .\scripts\preparar-gcp.ps1 -ProjectId `"$ProjectId`" -Ejecutar" -ForegroundColor Yellow
  exit 0
}

# ---------------------------------------------------------------------------
# 1. Cuenta autenticada y proyecto
# ---------------------------------------------------------------------------
Paso "Comprobando la sesión de gcloud"
$cuenta = (gcloud auth list --filter="status:ACTIVE" --format="value(account)" | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($cuenta)) {
  throw "No hay una cuenta activa. Ejecuta: gcloud auth login"
}
Write-Host "  cuenta: $cuenta"
Gcloud config set project $ProjectId | Out-Null

# ---------------------------------------------------------------------------
# 2. APIs
# ---------------------------------------------------------------------------
Paso "Habilitando APIs"
$apis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "iam.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com"
)

# Cloud SQL solo se habilita si se va a usar. Con Neon no hace falta y se evita
# dejar una API encendida sin motivo.
if (-not $SinCloudSql) {
  $apis += "sqladmin.googleapis.com"
}

Gcloud services enable @apis --project=$ProjectId

# ---------------------------------------------------------------------------
# 3. Artifact Registry
# ---------------------------------------------------------------------------
Paso "Repositorio de Artifact Registry"
& gcloud artifacts repositories describe $Repo --location=$Region --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Gcloud artifacts repositories create $Repo `
    --repository-format=docker `
    --location=$Region `
    --description="Imágenes de SIGA-DP v2" `
    --labels=app=siga-dp `
    --project=$ProjectId
} else {
  Write-Host "  ya existe $Repo"
}

# ---------------------------------------------------------------------------
# 4. Cuentas de servicio
# ---------------------------------------------------------------------------
Paso "Cuenta de servicio de ejecución ($RunServiceAccount)"
& gcloud iam service-accounts describe "$RunServiceAccount@$ProjectId.iam.gserviceaccount.com" --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Gcloud iam service-accounts create $RunServiceAccount `
    --display-name="SIGA-DP v2 - ejecución de Cloud Run" `
    --project=$ProjectId
} else {
  Write-Host "  ya existe"
}

Paso "Cuenta de servicio de build ($BuildServiceAccount)"
& gcloud iam service-accounts describe "$BuildServiceAccount@$ProjectId.iam.gserviceaccount.com" --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Gcloud iam service-accounts create $BuildServiceAccount `
    --display-name="SIGA-DP v2 - Cloud Build" `
    --project=$ProjectId
} else {
  Write-Host "  ya existe"
}

# ---------------------------------------------------------------------------
# 5. IAM mínimo
# ---------------------------------------------------------------------------
Paso "Permisos de la cuenta de ejecución"
foreach ($rol in @("roles/cloudsql.client", "roles/secretmanager.secretAccessor", "roles/logging.logWriter")) {
  Gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$RunServiceAccount@$ProjectId.iam.gserviceaccount.com" `
    --role=$rol `
    --condition=None `
    --quiet | Out-Null
  Write-Host "  $rol"
}

Paso "Permisos de la cuenta de build"
foreach ($rol in @(
  "roles/cloudbuild.builds.builder",
  "roles/run.admin",
  "roles/artifactregistry.writer",
  "roles/iam.serviceAccountUser",
  "roles/logging.logWriter"
)) {
  Gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$BuildServiceAccount@$ProjectId.iam.gserviceaccount.com" `
    --role=$rol `
    --condition=None `
    --quiet | Out-Null
  Write-Host "  $rol"
}

Paso "Permiso del agente de Cloud Build sobre la cuenta de build"
$numeroProyecto = (gcloud projects describe $ProjectId --format="value(projectNumber)" | Out-String).Trim()
Gcloud iam service-accounts add-iam-policy-binding `
  "$BuildServiceAccount@$ProjectId.iam.gserviceaccount.com" `
  --member="serviceAccount:service-$numeroProyecto@cloudbuild.gserviceaccount.com" `
  --role="roles/iam.serviceAccountUser" `
  --project=$ProjectId `
  --quiet | Out-Null
Write-Host "  service-$numeroProyecto@cloudbuild.gserviceaccount.com -> roles/iam.serviceAccountUser"

# ---------------------------------------------------------------------------
# 6. Secretos
# ---------------------------------------------------------------------------
Paso "Secretos en Secret Manager"
Write-Host "Las contraseñas se generan aquí y se guardan directamente en Secret Manager."
Write-Host "No se escriben en archivos ni se imprimen."

# Contraseña de PostgreSQL: si el secreto ya existe, no se regenera.
# Con un proveedor externo (Neon/Supabase) la contraseña la define el proveedor,
# así que aquí no se inventa: la carga configurar-neon.ps1.
if ($SinCloudSql) {
  Write-Host "  bd-clave se configura con scripts\configurar-neon.ps1 (proveedor externo)"
} else {
  & gcloud secrets describe bd-clave --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $claveBd = NuevoHex 32
    AsegurarSecreto -Nombre "bd-clave" -Valor $claveBd -Etiqueta "contraseña de PostgreSQL"
  } else {
    Write-Host "  ya existe bd-clave (no se cambia)"
  }
}

# Clave de firma de sesiones.
& gcloud secrets describe clave-sesion --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $claveSesion = NuevoHex 48
  AsegurarSecreto -Nombre "clave-sesion" -Valor $claveSesion -Etiqueta "clave de sesión"
} else {
  Write-Host "  ya existe clave-sesion (no se cambia)"
}

# Clave del administrador inicial (semilla). Se genera y se guarda.
& gcloud secrets describe clave-admin --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $claveAdmin = NuevoHex 18
  AsegurarSecreto -Nombre "clave-admin" -Valor $claveAdmin -Etiqueta "clave del administrador inicial"
} else {
  Write-Host "  ya existe clave-admin (no se cambia)"
}

# Integraciones opcionales. Si se dejan vacías, se guarda "no-configurado"
# para que el despliegue no falle; la función concreta avisará al usarse.
$integradores = @(
  @{ Nombre = "paypal-client-id"; Etiqueta = "PayPal Client ID (Enter para omitir)" },
  @{ Nombre = "paypal-client-secret"; Etiqueta = "PayPal Client Secret (Enter para omitir)" },
  @{ Nombre = "paypal-webhook-id"; Etiqueta = "PayPal Webhook ID (Enter para omitir)" },
  @{ Nombre = "imecf-api-key"; Etiqueta = "IMECF API Key (Enter para omitir)" },
  @{ Nombre = "groq-api-key"; Etiqueta = "Groq API Key (Enter para omitir)" }
)

foreach ($item in $integradores) {
  & gcloud secrets describe $item.Nombre --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $valor = LeerSecreto $item.Etiqueta
    if ([string]::IsNullOrWhiteSpace($valor)) {
      $valor = "no-configurado"
    }
    AsegurarSecreto -Nombre $item.Nombre -Valor $valor -Etiqueta $item.Etiqueta
  } else {
    Write-Host "  ya existe $($item.Nombre) (no se cambia)"
  }
}

# ---------------------------------------------------------------------------
# 7. Resumen
# ---------------------------------------------------------------------------
Paso "Listo"
if ($SinCloudSql) {
  Write-Host "Modo Neon/Supabase: no se creo Cloud SQL."
  Write-Host ""
  Write-Host "Siguiente paso: crear el proyecto en https://console.neon.tech (plan Free)"
  Write-Host "y despues guardar su cadena de conexion:"
  Write-Host "  .\scripts\configurar-neon.ps1 -ProjectId $ProjectId"
  Write-Host ""
  Write-Host "Luego carga el esquema y despliega:"
  Write-Host "  .\scripts\sembrar-neon.ps1 -ProjectId $ProjectId -Confirmar"
  Write-Host "  .\scripts\desplegar-neon.ps1 -ProjectId $ProjectId"
} else {
  Write-Host "Siguiente paso (facturable, requiere autorizacion):"
  Write-Host "  .\scripts\crear-cloudsql.ps1 -ProjectId $ProjectId -ConfirmarGasto"
  Write-Host ""
  Write-Host "Cuando Cloud SQL exista, despliega con:"
  Write-Host "  .\scripts\desplegar.ps1 -ProjectId $ProjectId -CloudSqlInstance `"$ProjectId`:$Region:siga-dp-db`""
}

Write-Host ""
Write-Host "La clave del administrador inicial esta en el secreto 'clave-admin'."
Write-Host "Recuperala cuando vayas a cargar la semilla, no la pegues en el chat."