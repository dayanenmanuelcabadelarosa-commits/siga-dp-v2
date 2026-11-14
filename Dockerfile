# syntax=docker/dockerfile:1

# =============================================================================
#  SIGA-DP v2 �� imagen de producción
# =============================================================================
#
#  La aplicación es un solo servicio: Express sirve la API y, desde la misma
#  dirección, el cliente React ya compilado. Por eso Cloud Run ejecuta un único
#  contenedor (más barato que separar frontend y backend).
#
#  Etapas:
#    1. cliente       �� compila React/Vite con las dependencias de desarrollo.
#    2. dependencias  �� instala solo lo de producción, en una capa aparte.
#    3. final         �� imagen mínima, sin código fuente del cliente ni pruebas.
#
#  No se copia ningún .env: .dockerignore los excluye y las credenciales llegan
#  por variables de entorno / Secret Manager en tiempo de ejecución.
# =============================================================================

# ---- Etapa 1: compilación del cliente --------------------------------------
FROM node:22-alpine AS cliente
WORKDIR /app

# Solo lo necesario para resolver el workspace y compilar.
COPY package.json package-lock.json ./
COPY cliente/package.json ./cliente/package.json
COPY servidor/package.json ./servidor/package.json

RUN npm ci --workspaces --include-workspace-root

COPY cliente ./cliente

# En producción el cliente habla con la API por la misma dirección.
ENV VITE_API_URL=""
RUN npm --workspace cliente run build

# ---- Etapa 2: dependencias de producción -----------------------------------
FROM node:22-alpine AS dependencias
WORKDIR /app

COPY package.json package-lock.json ./
COPY cliente/package.json ./cliente/package.json
COPY servidor/package.json ./servidor/package.json

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# ---- Etapa 3: imagen final -------------------------------------------------
FROM node:22-alpine AS final

# tini recoge las señales y evita procesos huérfanos al apagar la instancia.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production \
    PUERTO=8080 \
    PORT=8080

# Dependencias de producción ya resueltas en la etapa anterior.
COPY --from=dependencias /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY servidor/package.json ./servidor/package.json
COPY cliente/package.json ./cliente/package.json

# Código del servidor, migraciones y cliente compilado.
COPY servidor ./servidor
COPY base-de-datos ./base-de-datos
COPY --from=cliente /app/cliente/dist ./cliente/dist

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && chown -R node:node /app

# Cloud Run exige escuchar en el puerto que inyecta; por defecto 8080.
EXPOSE 8080

# Cloud Run no usa HEALTHCHECK de Docker (usa su propio probe), pero sirve para
# docker run y para otras plataformas que sí lo respetan.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const p=process.env.PORT||process.env.PUERTO||8080;fetch('http://127.0.0.1:'+p+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Usuario sin privilegios: el proceso no corre como root.
USER node

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
