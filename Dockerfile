# Imagen única: compila la PWA y la sirve desde el mismo servidor Express (mismo origen → WebAuthn, CSP y service worker coinciden).
# Contexto de construcción: la carpeta que contiene `sistema/` y `datos-prueba/` (ver docker-compose.yml).
FROM node:22-slim AS build
WORKDIR /app/sistema
COPY sistema/frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY sistema/frontend frontend
RUN cd frontend && npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/sistema
COPY sistema/backend/package*.json backend/
RUN cd backend && npm ci
COPY sistema/backend backend
# El cliente de Prisma se genera en el build (no necesita base de datos).
RUN cd backend && PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate
COPY --from=build /app/sistema/frontend/dist frontend/dist
COPY datos-prueba /app/datos-prueba
ENV NODE_ENV=production PORT=3000 UPLOADS_DIR=/data/uploads TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
WORKDIR /app/sistema/backend
# Aplica el SQL (idempotente), carga datos de demostración si SEED=1 y la base está vacía y arranca.
CMD ["sh", "-c", "node scripts/init-db.js && if [ \"$SEED\" = \"1\" ]; then npx tsx src/seed-si-vacia.ts; fi && npx tsx src/server.ts"]
