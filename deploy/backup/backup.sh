#!/bin/sh
# Nightly pg_dump (custom format, compressed) into /backups, keeping BACKUP_RETENTION_DAYS days.
# Runs forever in the backup container: one dump at start-up, then one every day at BACKUP_HOUR (container time, UTC).
# BACKUP_ONCE=true: dump once and exit (used by deploy/scripts/backup-now).
# BACKUP_AGE_RECIPIENT=age1...: encrypt each dump with that public key (cdls-*.dump.age). The private key never
# lives on this machine. When it is set and encryption cannot work, nothing is written in clear: the script stops.
set -eu
# Dumps hold minors' data, grades and password hashes: owner-only files, whatever the mount's default.
umask 077

# BACKUP_DIR_IN is for tests only; in the container the volume is always /backups.
DIR="${BACKUP_DIR_IN:-/backups}"
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

# Refuse to start (or to dump) with a broken encryption set-up instead of leaving clear dumps behind.
check_encryption() {
  [ -n "$AGE_RECIPIENT" ] || return 0
  if ! command -v age >/dev/null 2>&1; then
    echo "[backup] BACKUP_AGE_RECIPIENT is set but the age tool is missing: refusing to write clear dumps" >&2
    return 1
  fi
  if ! printf 'probe' | age -r "$AGE_RECIPIENT" >/dev/null 2>&1; then
    echo "[backup] BACKUP_AGE_RECIPIENT is not a valid age public key (it starts with age1): refusing to write clear dumps" >&2
    return 1
  fi
}

dump() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  tmp="$DIR/.cdls-$stamp.partial"
  out="$DIR/cdls-$stamp.dump"
  check_encryption || return 1
  if ! pg_dump --format=custom --compress=6 --no-owner --file="$tmp"; then
    rm -f "$tmp"
    echo "[backup] pg_dump FAILED" >&2
    return 1
  fi
  if [ -n "$AGE_RECIPIENT" ]; then
    enc="$tmp.age"
    if age -r "$AGE_RECIPIENT" -o "$enc" "$tmp" && [ -s "$enc" ]; then
      rm -f "$tmp"
      out="$out.age"
      mv "$enc" "$out"
    else
      # Never keep the clear dump when encryption was asked for.
      rm -f "$tmp" "$enc"
      echo "[backup] age encryption FAILED: the dump was deleted, nothing was kept" >&2
      return 1
    fi
  else
    mv "$tmp" "$out"
  fi
  echo "[backup] wrote $out ($(wc -c <"$out") bytes)"
  # Retention covers clear and encrypted dumps (a switch of BACKUP_AGE_RECIPIENT leaves both kinds around).
  find "$DIR" -maxdepth 1 \( -name 'cdls-*.dump' -o -name 'cdls-*.dump.age' \) -type f \
    -mtime +"${BACKUP_RETENTION_DAYS:-14}" -print -delete | sed 's/^/[backup] removed old /'
}

# A broken encryption set-up must be seen at once, not at the first night.
check_encryption || exit 1

if [ "${BACKUP_ONCE:-false}" = "true" ]; then dump; exit $?; fi

dump || true
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${BACKUP_HOUR:-02}:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump || true
done
