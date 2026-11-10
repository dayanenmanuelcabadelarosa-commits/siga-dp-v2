# ---- Etapa 1: compilacion del cliente -------------------------------------
FROM node:22-alpine AS cliente
WORKDIR /app

# Copiamos solo lo necesario para instalar dependencias y compilar.
COPY package.json package-lock.json ./
COPY cliente/package.json ./cliente/package.json
COPY servidor/package.json ./servidor/package.json

RUN npm ci --workspaces --include-workspace-root

COPY cliente ./cliente
# En produccion el cliente habla con la API por la misma direccion.
ENV VITE_API_URL=""
RUN npm --workspace cliente run build

# ---- Etapa 2: imagen final (API + cliente compilado) -----------------------
FROM node:22-alpine AS final
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY servidor/package.json ./servidor/package.json
# El cliente ya esta compilado; solo necesitamos su package.json para coherencia.
COPY cliente/package.json ./cliente/package.json

RUN npm ci --omit=dev --workspaces --include-workspace-root

# Codigo del servidor y migraciones + base de datos.
COPY servidor ./servidor
COPY base-de-datos ./base-de-datos

# Cliente compilado desde la etapa anterior.
COPY --from=cliente /app/cliente/dist ./cliente/dist

# Puerto que usa Cloud Run (lo inyecta PORT, pero dejamos un valor por defecto).
ENV PUERTO=8080
EXPOSE 8080

# Migraciones al arrancar (idempotentes) y luego el servidor.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]