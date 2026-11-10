# Despliegue de SIGA-DP v2 en Google Cloud

Guia de los pasos para dejar la aplicacion corriendo en GCP con Cloud Build,
GitHub Actions y Cloud Run. Los archivos de configuracion ya estan en el
repositorio; aqui se explica como usarlos.

## 1. Preparar el proyecto

- Crear un repositorio en GitHub y subir todo el codigo (carpeta `siga-dp-v2`).
- Verificar que `.env` NO se suba (esta en `.gitignore`). Solo se suben los
  `.env.example`.

## 2. Preparar Google Cloud

1. Crear un proyecto de GCP (anota el `PROJECT_ID`).
2. Habilitar las APIs necesarias:
   - Cloud Run API
   - Cloud Build API
   - Artifact Registry API
   - Cloud SQL Admin API
   - Secret Manager API
3. Crear un repositorio en Artifact Registry (formato Docker) con el nombre
   `siga-dp` en la region elegida (por ejemplo `us-central1`).
4. Crear una instancia de Cloud SQL (PostgreSQL 15+) llamada `siga-dp-db`.
   Crear la base `siga_dp_v2` y el usuario `postgres` con su clave.
5. Crear los secretos en Secret Manager:
   - `bd-clave`, `clave-sesion`, `paypal-client-id`, `paypal-client-secret`,
     `imecf-api-key`, `groq-api-key`.
6. Crear una cuenta de servicio para GitHub Actions con los roles:
   - Cloud Build Editor, Cloud Run Admin, Artifact Registry Writer,
   - Service Account User, Storage Admin. Descargar la clave JSON y guardarla
   como secreto `GCP_SA_KEY` en GitHub.
7. En GitHub, crear los secretos del repositorio:
   - `GCP_PROJECT_ID`, `GCP_SA_KEY`, `CLOUDSQL_INSTANCE`
     (formato `PROJECT_ID:REGION:siga-dp-db`).

## 3. Construir la imagen Docker localmente (opcional)

Requiere Docker Desktop instalado.

```bash
docker build -t siga-dp:local .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e PUERTO=8080 \
  -e BD_HOST=host.docker.internal \
  -e BD_PUERTO=5432 \
  -e BD_USUARIO=postgres \
  -e BD_CLAVE=tu_clave \
  -e BD_NOMBRE=siga_dp_v2 \
  -e ORIGENES=http://localhost:8080 \
  -e CLAVE_SESION=una-cadena-larga-y-aleatoria \
  siga-dp:local
```

Abrir http://localhost:8080 y comprobar `/api/salud`.

## 4. Cloud Build y Artifact Registry

El archivo `cloudbuild.yaml` construye la imagen, la sube a Artifact Registry y
despliega en Cloud Run. Se puede ejecutar a mano:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_CLOUDSQL_INSTANCE=PROJECT_ID:us-central1:siga-dp-db
```

En cada `push` a `principal` o `main`, GitHub Actions ejecuta las pruebas y luego
dispara Cloud Build automaticamente (ver `.github/workflows/deploy.yml`).

## 5. Cloud Run

El contenedor arranca en el puerto que inyecta Cloud Run (`PORT`, traducido a
`PUERTO`). Al iniciar, aplica las migraciones pendientes de forma idempotente y
luego levanta la API, que tambien sirve el cliente compilado.

Variables de entorno necesarias en Cloud Run (se configuran en la consola o con
`cloudrun-service.yaml`):

- `BD_HOST=/cloudsql/PROJECT_ID:REGION:siga-dp-db` (socket Unix)
- `BD_USUARIO`, `BD_NOMBRE`
- `BD_CLAVE` (desde Secret Manager)
- `ORIGENES` = la URL publica del servicio
- `CLAVE_SESION` (desde Secret Manager)
- `PAYPAL_*`, `IMECF_API_KEY`, `GROQ_API_KEY` (desde Secret Manager)

Notas:

- El despliegue normal en un proyecto propio requiere vincular una cuenta de
  facturacion, aunque exista una cuota gratuita.
- Las migraciones se aplican al arrancar el contenedor. En un despliegue con
  varias instancias, pueden ejecutarse en paralelo; la migracion es idempotente,
  pero si se quiere evitarlo, ejecutarlas como un paso unico en Cloud Build
  antes del despliegue.
- La base de datos debe existir previamente en Cloud SQL; el contenedor no crea
  la base, solo aplica migraciones y la semilla no se carga en produccion.
"