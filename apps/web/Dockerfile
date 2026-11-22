# syntax=docker/dockerfile:1
# CDLS web: Angular static build (prerendered public pages + client app) served by nginx.
# Build context = the repository root (see deploy/compose.yaml).
# Exact version and digest (docs/deployment.md, "Pinned images"); same pair as apps/api/Dockerfile.
ARG NODE_VERSION=22.23.5
ARG NODE_DIGEST=sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS build
WORKDIR /app
RUN npm install -g npm@12.0.2
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@cdls/shared --workspace=@cdls/web
COPY packages/shared packages/shared
COPY apps/web apps/web
# The school packs (text, photos, crest): the one named by SCHOOL is built in (scripts/select-school.mjs).
COPY schools schools
# The school this image is for (deploy/.env SCHOOL), a folder of schools/. The API container must use the same value.
ARG SCHOOL=cdls-daher
ENV SCHOOL=${SCHOOL}
# The site's public address (deploy/.env PUBLIC_WEB_URL): absolute canonical links, robots.txt and
# sitemap.xml. Empty: the pack's profile.json siteUrl. Both are read by scripts/site-origin.mjs (build args are
# environment variables of RUN).
ARG PUBLIC_WEB_URL=
# A release image refuses a placeholder or non-https site address for a real school (select-school.mjs);
# --build-arg CDLS_RELEASE=0 only for a throw-away trial image.
ARG CDLS_RELEASE=1
RUN npm run build -w @cdls/shared && npm run build -w @cdls/web
# Content-Security-Policy: the prerendered pages carry a few inline scripts (Angular's event-dispatch
# contract, the stylesheet swap); allow exactly those by hash instead of 'unsafe-inline' for scripts.
RUN node apps/web/nginx/csp-hashes.mjs apps/web/dist/college-website/browser /tmp/csp.conf

FROM nginxinc/nginx-unprivileged:1.31.7-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e AS runtime
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /tmp/csp.conf /etc/nginx/snippets/csp.conf
COPY --from=build /app/apps/web/dist/college-website/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
