#!/bin/sh
# Applies pending database migrations (idempotent), then starts the command (the API by default).
# A failed migration stops the container: the API never runs against a schema it does not match.
set -eu

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  node_modules_bin=/app/node_modules/.bin
  "$node_modules_bin/prisma" migrate deploy
fi

exec "$@"
