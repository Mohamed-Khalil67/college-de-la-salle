# syntax=docker/dockerfile:1
# CDLS API. Build context = the repository root (see deploy/compose.yaml).
# Pinned to an exact version AND its digest (docs/deployment.md, "Pinned images", says how to bump both together;
# Dependabot proposes the bump). To use another Node build set both args.
ARG NODE_VERSION=22.23.5
ARG NODE_DIGEST=sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

# --- build: shared contract + API (prisma generate, nest build) -------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS build
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
# The school packs: the API reads only profile.json (names, time zone, sections, calendar ids); the text and
# pictures of the site are the web image's.
COPY schools schools
RUN find schools -type f ! -name profile.json -delete
RUN npm run build -w @cdls/shared && npm run build -w @cdls/api

# --- deps: production dependencies only (prisma CLI and tsx are regular dependencies of the API) -----
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS deps
WORKDIR /app
RUN npm install -g npm@12.0.2
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=@cdls/shared --workspace=@cdls/api

# --- runtime ------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS runtime
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
# The report-card PDF's Arabic font (Cairo, OFL; read from apps/api/assets/fonts next to dist/, never fetched).
COPY --from=build /app/apps/api/assets apps/api/assets
# SCHOOL (compose) names one folder of it; /app/schools is found by walking up from dist/ (SCHOOLS_DIR overrides).
COPY --from=build /app/schools schools
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
# Kept on purpose: docs/deployment.md documents `seed:demo` for a throw-away stack in this image.
# prisma/seed.ts (optional demo data, run with tsx) imports the TypeScript sources and the generated client.
COPY --from=build /app/apps/api/src apps/api/src
COPY --from=build /app/apps/api/tsconfig.json apps/api/tsconfig.json
# Everything under /app stays owned by root and read-only for the `node` user that runs it: no recursive chown
# (that rewrote all of node_modules into a second ~500 MB layer), and a compromised process cannot change the code.
# The API writes no file in production (the dev-only `log` mail transport is refused there); Prisma and npm write
# their caches under /home/node and /tmp, which `node` owns.
COPY --chmod=0755 apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# The schema engine of `prisma migrate deploy`: npm does not run @prisma/engines' install script, so the CLI used
# to download the engine into node_modules on EVERY start (only possible while node_modules belonged to `node`).
# Fetched once here, as root, for this image's platform (openssl 3 is installed above); the start needs no network.
RUN node node_modules/@prisma/engines/dist/scripts/postinstall.js \
 && ls node_modules/@prisma/engines/ | grep -q schema-engine
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
