# syntax=docker/dockerfile:1
# CDLS API. Build context = the repository root (see deploy/compose.yaml).
ARG NODE_VERSION=22

# --- build: shared contract + API (prisma generate, nest build) -------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install -g npm@12.0.2
# Manifests first so the dependency layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@cdls/shared --workspace=@cdls/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @cdls/shared && npm run build -w @cdls/api

# --- deps: production dependencies only (prisma CLI and tsx are regular dependencies of the API) -----
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g npm@12.0.2
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=@cdls/shared --workspace=@cdls/api

# --- runtime ------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
# openssl: the Prisma schema engine (migrate deploy). tini: forwards SIGTERM so shutdown hooks run.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
# prisma/seed.ts (optional demo data, run with tsx) imports the TypeScript sources and the generated client.
COPY --from=build /app/apps/api/src apps/api/src
COPY --from=build /app/apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
