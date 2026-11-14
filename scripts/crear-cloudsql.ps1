# =============================================================================
#  Crear Cloud SQL para SIGA-DP v2  ��  ESTO SÍ GENERA GASTOS
# =============================================================================
#
#  Coste estimado en us-central1 (precios de lista, sin créditos):
#    Instancia db-f1-micro (0.6 GB, shared core)   ~ USD 7.67 / mes
#    Almacenamiento SSD 10 GB                      ~ USD 1.70 / mes
#    Copias automáticas 10 GB                      ~ USD 0.80 / mes
#    ---------------------------------------------------------------
#    Total aproximado                              ~ USD 10.17 / mes
#
#  La instancia cobra mientras exista, aunque no haya usuarios. Cloud Run con
#  min-instances=0 no cobra CPU inactiva, pero Cloud SQL sí.
#
#  Antes de ejecutar:
#    .\scripts\preparar-gcp.ps1 -ProjectId "mi-proyecto" -Ejecutar
#
#  Para crear de verdad:
#    .\scripts\crear-cloudsql.ps1 -ProjectId "mi-proyecto" -ConfirmarGasto
#
#  Sin -ConfirmarGasto solo muestra el plan y no crea nada.
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$Instance = "siga-dp-db",
  [string]$Database = "siga_dp_v2",
  [string]$DbUser = "postgres",
  [string]$Tier = "db-f1-micro",
  [int]$StorageGb = 10,
  [switch]$SinBackups,
  [switch]$ConfirmarGasto
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

$conexion = "$ProjectId`:$Region`:$Instance"

Write-Host "Proyecto:  $ProjectId"
Write-Host "Región:    $Region"
Write-Host "Instancia: $Instance"
Write-Host "Base:      $Database"
Write-Host "Tier:      $Tier"
Write-Host "Storage:   $StorageGb GB"
Write-Host "Conexión:  $conexion"
Write-Host ""
Write-Host "Coste estimado: USD 10-12/mes (instancia + storage + backups)." -ForegroundColor Yellow
Write-Host "La instancia cobra aunque no reciba solicitudes." -ForegroundColor Yellow

if (-not $ConfirmarGasto) {
  Write-Host ""
  Write-Host "No se creó nada." -ForegroundColor Green
  Write-Host "Para autorizar el gasto y crear la instancia:" -ForegroundColor Yellow
  Write-Host "  .\scripts\crear-cloudsql.ps1 -ProjectId `"$ProjectId`" -ConfirmarGasto" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Alternativa sin coste fijo: Neon Free o Supabase Free." -ForegroundColor Cyan
  Write-Host "Ver docs/DESPLIEGUE-GCP.md, sección 'Alternativa sin Cloud SQL'."
  exit 0
}

# ---------------------------------------------------------------------------
# 1. Comprobaciones
# ---------------------------------------------------------------------------
Paso "Comprobando sesión y proyecto"
$cuenta = (gcloud auth list --filter="status:ACTIVE" --format="value(account)" | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($cuenta)) {
  throw "No hay una cuenta activa. Ejecuta: gcloud auth login"
}
Gcloud config set project $ProjectId | Out-Null

Paso "Comprobando que el secreto bd-clave exista"
& gcloud secrets describe bd-clave --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Falta el secreto 'bd-clave'. Ejecuta primero: .\scripts\preparar-gcp.ps1 -ProjectId `"$ProjectId`" -Ejecutar"
}

# ---------------------------------------------------------------------------
# 2. Instancia
# ---------------------------------------------------------------------------
Paso "Creando la instancia (puede tardar varios minutos)"
& gcloud sql instances describe $Instance --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $argumentos = @(
    "sql", "instances", "create", $Instance,
    "--project=$ProjectId",
    "--database-version=POSTGRES_16",
    "--tier=$Tier",
    "--region=$Region",
    "--storage-size=$StorageGb",
    "--storage-type=SSD",
    "--availability-type=zonal",
    "--deletion-protection",
    "--labels=app=siga-dp"
  )
  if ($SinBackups) {
    $argumentos += "--no-backup"
  } else {
    $argumentos += "--backup"
    $argumentos += "--retained-backups-count=7"
  }
  Gcloud @argumentos
} else {
  Write-Host "  ya existe $Instance"
}

# ---------------------------------------------------------------------------
# 3. Base de datos
# ---------------------------------------------------------------------------
Paso "Creando la base de datos $Database"
& gcloud sql databases describe $Database --instance=$Instance --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Gcloud sql databases create $Database --instance=$Instance --project=$ProjectId
} else {
  Write-Host "  ya existe $Database"
}

# ---------------------------------------------------------------------------
# 4. Contraseña del usuario de PostgreSQL
# ---------------------------------------------------------------------------
Paso "Aplicando la contraseña guardada en Secret Manager"
$clave = (gcloud secrets versions access latest --secret=bd-clave --project=$ProjectId | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($clave)) {
  throw "El secreto bd-clave está vacío."
}

# Se usa la API en vez de --password para no dejar la contraseña en la línea de
# comandos (visible en el historial de procesos).
$token = (gcloud auth print-access-token --project=$ProjectId | Out-String).Trim()
$cuerpo = @{ name = $DbUser; password = $clave } | ConvertTo-Json -Compress
Invoke-RestMethod `
  -Method Put `
  -Uri "https://sqladmin.googleapis.com/sql/v1beta4/projects/$ProjectId/instances/$Instance/users?name=$DbUser" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $cuerpo | Out-Null
Write-Host "  contraseña aplicada (sin imprimirla)"

# ---------------------------------------------------------------------------
# 5. Resumen
# ---------------------------------------------------------------------------
Paso "Listo"
Write-Host "Nombre de conexión: $conexion"
Write-Host ""
Write-Host "Siguiente paso:"
Write-Host "  .\scripts\desplegar.ps1 -ProjectId `"$ProjectId`" -CloudSqlInstance `"$conexion`""
Write-Host ""
Write-Host "Para ahorrar mientras no se usa:"
Write-Host "  .\scripts\detener-cloudsql.ps1 -ProjectId `"$ProjectId`""
Write-Host "  (el almacenamiento y las copias se siguen cobrando)"
