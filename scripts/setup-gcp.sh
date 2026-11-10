#!/usr/bin/env bash
# Ejecutar UNA SOLA VEZ cuando tengas facturacion habilitada en el proyecto.
# Uso: PROJECT_ID=tu-proyecto REGION=us-central1 ./scripts/setup-gcp.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?define PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="siga-dp"
REPO="siga-dp"
SQL_INSTANCE="siga-dp-db"
DB_NAME="siga_dp_v2"
DB_USER="postgres"

echo "==> Habilitando APIs"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com \
  --project="$PROJECT_ID"

echo "==> Creando repositorio en Artifact Registry"
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" --project="$PROJECT_ID" 2>/dev/null || echo "  (ya existe)"

echo "==> Creando instancia de Cloud SQL (PostgreSQL 15)"
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_15 --tier=db-f1-micro --region="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (ya existe)"

echo "==> Creando base de datos y usuario"
gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" 2>/dev/null || echo "  (ya existe)"

echo "Listo. Crea los secretos con:"
echo "  echo -n 'TU_CLAVE' | gcloud secrets create bd-clave --data-file=- --project=$PROJECT_ID"
echo "  echo -n 'CADENA_LARGA' | gcloud secrets create clave-sesion --data-file=- --project=$PROJECT_ID"
echo "Luego ejecuta: ./scripts/deploy.sh"
"