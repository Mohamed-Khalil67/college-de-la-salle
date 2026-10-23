#!/bin/sh
# Creates deploy/.env from deploy/.env.example with fresh random secrets. Refuses to overwrite.
#   sh deploy/scripts/generate-env.sh
set -eu
dir="$(cd "$(dirname "$0")/.." && pwd)"
target="$dir/.env"
[ -e "$target" ] && { echo "$target exists; delete it first if you really want new secrets (they would invalidate every session and the database password)." >&2; exit 1; }

rand() { head -c 48 /dev/urandom | od -An -vtx1 | tr -d ' \n' | cut -c1-"$1"; }

sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rand 40)|" \
  -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(rand 64)|" \
  -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(rand 64)|" \
  "$dir/.env.example" >"$target"
chmod 600 "$target" 2>/dev/null || true
echo "Wrote $target. Now edit PUBLIC_WEB_URL, SCHOOL_EMAIL_DOMAIN, SMTP_* and TUNNEL_TOKEN (or DOMAIN)."
