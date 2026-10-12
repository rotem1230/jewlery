# Malinvosky API — production image. Build from backend/:
#   docker build -t malinvosky-api .                    # the API (runs as an unprivileged user)
#   docker build --target release -t malinvosky-release . # one-off release step: migrations + reference seed
# Run the release image once per deploy BEFORE starting the new API containers.

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL; CA certificates for SMTP / provider HTTPS calls.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Build: full dependencies, compile ────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Release: migrations + reference seed (never demo data: SEED_DEMO_DATA is refused in production)
FROM build AS release
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node node_modules/prisma/build/index.js db seed"]

# ── Runtime: production dependencies only ────────────────────────────────────────────────────────
FROM build AS prune
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prune --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
COPY --chown=node:node seed-assets ./seed-assets
# Local media storage: mount a persistent volume here (see docs/production-readiness.md).
RUN mkdir -p /app/uploads-local && chown node:node /app/uploads-local
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/' + (process.env.API_PREFIX || 'api/v1') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
