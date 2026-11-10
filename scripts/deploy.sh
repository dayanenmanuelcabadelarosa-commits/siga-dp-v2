#!/usr/bin/env bash
# Despliega SIGA-DP v2 en Cloud Run. Requiere setup-gcp.sh ejecutado antes.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?define PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="siga-dp"
REPO="siga-dp"
SQL_INSTANCE="siga-dp-db"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE"

echo "==> Enviando build a Cloud Build"
gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_CLOUDSQL_INSTANCE=$PROJECT_ID:$REGION:$SQL_INSTANCE"

echo "==> URL del servicio"
gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)'
"