# ============================================================
# Urban Kids Club – Provider Dashboard
# Multi-Stage Docker Build
# ============================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Package-Dateien kopieren
COPY package.json tsconfig.json ./

# Dependencies installieren (tsx für Runtime)
RUN npm install && npm install -g tsx

# Source kopieren
COPY src/ src/

# TypeScript compilieren (optional – wir nutzen tsx direkt)
# RUN npx tsc --noEmit

# --- Stage 2: Runtime ---
FROM node:20-alpine AS runtime

WORKDIR /app

# Nur was wir brauchen
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /usr/local/lib/node_modules/tsx /usr/local/lib/node_modules/tsx
COPY --from=builder /usr/local/bin/tsx /usr/local/bin/tsx

# Data-Verzeichnis für Persistence
RUN mkdir -p /app/data && chown -R node:node /app/data

# Non-root User
USER node

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV SAVE_INTERVAL=30000

# Health-Check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

# Start mit tsx (TypeScript direkt ausführen)
CMD ["node", "--import", "tsx/esm", "src/api/server.ts"]
