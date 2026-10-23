#!/bin/sh
# Nightly pg_dump (custom format, compressed) into /backups, keeping BACKUP_RETENTION_DAYS days.
# Runs forever in the backup container: one dump at start-up, then one every day at BACKUP_HOUR (container time, UTC).
# BACKUP_ONCE=true: dump once and exit (used by deploy/scripts/backup-now).
set -eu

dump() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  tmp="/backups/.cdls-$stamp.partial"
  out="/backups/cdls-$stamp.dump"
  if pg_dump --format=custom --compress=6 --no-owner --file="$tmp"; then
    mv "$tmp" "$out"
    echo "[backup] wrote $out ($(wc -c <"$out") bytes)"
  else
    rm -f "$tmp"
    echo "[backup] pg_dump FAILED" >&2
    return 1
  fi
  find /backups -maxdepth 1 -name 'cdls-*.dump' -type f -mtime +"$BACKUP_RETENTION_DAYS" -print -delete \
    | sed 's/^/[backup] removed old /'
}

if [ "${BACKUP_ONCE:-false}" = "true" ]; then dump; exit $?; fi

dump || true
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${BACKUP_HOUR}:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump || true
done
