# =============================================================================
#  SIGA-DP v2 — imagen del BACKEND (API REST)
# =============================================================================
#
#  Solo el servidor Express y las migraciones. El cliente React vive en su
#  propio contenedor (cliente/Dockerfile) y habla con esta API por HTTP.
#
#  No se copia ningún .env: las credenciales llegan por variables de entorno
#  / Secret Manager en tiempo de ejecución.
# =============================================================================

# ---- Etapa 1: dependencias de producción -----------------------------------
FROM node:22-alpine AS dependencias
WORKDIR /app

# Se copian los manifiestos de los dos espacios de trabajo porque npm los
# necesita para resolver el árbol; solo se instalan los del servidor.
COPY package.json package-lock.json ./
COPY servidor/package.json ./servidor/package.json
COPY cliente/package.json ./cliente/package.json

RUN npm ci --omit=dev --workspace=servidor \
    && npm cache clean --force

# ---- Etapa 2: imagen final -------------------------------------------------
FROM node:22-alpine AS final

# tini recoge las señales y evita procesos huérfanos al apagar la instancia.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production \
    PUERTO=8080 \
    PORT=8080

COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY servidor ./servidor
COPY base-de-datos ./base-de-datos
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
    && chown -R node:node /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const p=process.env.PORT||process.env.PUERTO||8080;fetch('http://127.0.0.1:'+p+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
