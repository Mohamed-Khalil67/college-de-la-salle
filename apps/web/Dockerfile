# syntax=docker/dockerfile:1
# CDLS web: Angular static build (prerendered public pages + client app) served by nginx.
# Build context = the repository root (see deploy/compose.yaml).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install -g npm@12.0.2
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@cdls/shared --workspace=@cdls/web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @cdls/shared && npm run build -w @cdls/web
# Content-Security-Policy: the prerendered pages carry a few inline scripts (Angular's event-dispatch
# contract, the stylesheet swap); allow exactly those by hash instead of 'unsafe-inline' for scripts.
RUN node apps/web/nginx/csp-hashes.mjs apps/web/dist/college-website/browser /tmp/csp.conf

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /tmp/csp.conf /etc/nginx/snippets/csp.conf
COPY --from=build /app/apps/web/dist/college-website/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
