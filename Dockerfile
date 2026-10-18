# Kennisbank als Docker-image, voor installaties die zelf gehost worden
# (eigen login, gewone PostgreSQL). Zie docs/installatie.md.
#
#   docker compose up -d --build
#
# Geen geheimen in het image: alle instellingen komen als omgevingsvariabelen
# binnen bij het starten (zie .env.docker.example).

# ---- 1. Afhankelijkheden ---------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. Bouwen -------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. Draaien ------------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/bestanden

# Alleen de zelfstandige server plus de statische bestanden.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# Map voor geüploade bestanden (STORAGE_DRIVER=filesystem); koppel er een volume aan.
RUN mkdir -p /data/bestanden && chown -R node:node /data

USER node
EXPOSE 3000

# Gezond = configuratie, database en migraties in orde (zie /status).
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/gezondheid').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
