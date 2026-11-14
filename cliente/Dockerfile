# =============================================================================
#  SIGA-DP v2 — imagen del FRONTEND (cliente React + Vite)
# =============================================================================
#
#  Etapa 1 compila el cliente con Vite. Etapa 2 lo sirve con nginx sin
#  privilegios en el puerto 8080 (lo que espera Cloud Run).
#
#  La dirección de la API se fija en tiempo de compilación con el argumento
#  VITE_API_URL (Vite la incrusta en el bundle). Cloud Build la pasa con
#  --build-arg a partir de la URL pública del backend.
# =============================================================================

# ---- Etapa 1: compilación --------------------------------------------------
FROM node:22-alpine AS compilacion
WORKDIR /app

COPY package.json package-lock.json ./
COPY servidor/package.json ./servidor/package.json
COPY cliente/package.json ./cliente/package.json

RUN npm ci --workspace=cliente

COPY cliente ./cliente

# En producción el navegador habla con la API en esta dirección.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm --workspace cliente run build

# ---- Etapa 2: servidor web -------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine AS final

# Configuración de nginx: SPA con fallback a index.html en el puerto 8080.
COPY cliente/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /app/cliente/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
