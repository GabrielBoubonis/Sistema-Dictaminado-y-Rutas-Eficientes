# Imagen única: compila la PWA y la sirve desde el mismo servidor Express (mismo origen → WebAuthn, CSP y service worker coinciden).
# Contexto de construcción: la raíz del repo, que contiene `sistema/` y `datos-prueba/` (ver docker-compose*.yml).
# Las exclusiones están en sistema/Dockerfile.dockerignore.

# 1) PWA
FROM node:22-slim AS frontend
WORKDIR /app/sistema/frontend
COPY sistema/frontend/package*.json ./
RUN npm ci
COPY sistema/frontend ./
RUN npm run build

# 2) Backend compilado a JavaScript (sin tsx en ejecución) y solo dependencias de producción
FROM node:22-slim AS backend
WORKDIR /app/sistema/backend
COPY sistema/backend/package*.json ./
RUN npm ci
COPY sistema/backend ./
# El cliente de Prisma se genera en el build (no necesita base de datos).
RUN PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate && npm run build && npm prune --omit=dev

# 3) Imagen final
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/sistema/backend
COPY --from=backend /app/sistema/backend/package.json ./
COPY --from=backend /app/sistema/backend/node_modules node_modules
COPY --from=backend /app/sistema/backend/dist dist
COPY sistema/backend/scripts/init-db.js scripts/init-db.js
COPY sistema/backend/prisma/init.sql prisma/init.sql
COPY --from=frontend /app/sistema/frontend/dist /app/sistema/frontend/dist
COPY datos-prueba /app/datos-prueba
ENV NODE_ENV=production PORT=3000 UPLOADS_DIR=/data/uploads TRUST_PROXY=1
# La app corre sin privilegios: la carpeta de fotos tiene que ser suya antes de montar el volumen.
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME /data
EXPOSE 3000
USER node
# Aplica el SQL (idempotente), carga datos de demostración si SEED=1 y la base está vacía, y arranca.
CMD ["sh", "-c", "node scripts/init-db.js && if [ \"$SEED\" = \"1\" ]; then node dist/seed-si-vacia.js; fi && exec node dist/server.js"]
