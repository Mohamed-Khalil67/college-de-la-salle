# Sauvegarde et restauration / Backup and restore

The `backup` container writes a dump of the `cdls` database every night (02:00 UTC, `BACKUP_HOUR`) and once when the
stack starts, into `deploy/backups/` on the host (`BACKUP_DIR`). Files are named `cdls-YYYYMMDD-HHMMSS.dump` (pg_dump
custom format, compressed); dumps older than `BACKUP_RETENTION_DAYS` (14) are deleted. **A backup that stays on the same
disk does not protect against a lost disk: copy `deploy/backups/` to another drive or a cloud folder regularly.**

All commands run from the repository root. Add `--profile tunnel` (or `caddy`) only for `up`; the other commands do not need it.

## Back up now

```bash
docker compose -f deploy/compose.yaml run --rm -e BACKUP_ONCE=true backup
```

## Restore (replaces the current data)

1. Pick the dump, e.g. `deploy/backups/cdls-20261023-020000.dump`. Check it is readable:
   ```bash
   docker compose -f deploy/compose.yaml run --rm --no-deps -v "$PWD/deploy/backups:/backups:ro" --entrypoint pg_restore backup --list /backups/cdls-20261023-020000.dump | head
   ```
2. Stop the application (keep the database running):
   ```bash
   docker compose -f deploy/compose.yaml stop web api backup cloudflared caddy
   ```
3. Recreate an empty database and load the dump:
   ```bash
   docker compose -f deploy/compose.yaml exec db psql -U cdls -d postgres -c "DROP DATABASE cdls WITH (FORCE)" -c "CREATE DATABASE cdls OWNER cdls"
   docker compose -f deploy/compose.yaml run --rm --no-deps -v "$PWD/deploy/backups:/backups:ro" --entrypoint pg_restore backup \
     --no-owner --role=cdls --dbname=cdls /backups/cdls-20261023-020000.dump
   ```
   On Windows PowerShell replace `$PWD/deploy/backups` by `${PWD}/deploy/backups` (or use `./deploy/backups`).
4. Start everything again (the API applies any migration newer than the dump):
   ```bash
   docker compose -f deploy/compose.yaml --profile tunnel up -d
   ```
5. Check: `curl http://127.0.0.1:8080/api/health/db` answers `{"status":"ok"}`, then sign in.

Restoring onto a **new machine**: install Docker, clone the repository, copy your `deploy/.env` (keep the same
`JWT_*` secrets if you want sessions to survive; otherwise everybody just signs in again), start only the database
(`docker compose -f deploy/compose.yaml up -d db`), copy the dump into `deploy/backups/`, then follow steps 3 and 4.

## Test the restore regularly

Once a month, restore the latest dump into a throw-away database and look at it:

```bash
docker compose -f deploy/compose.yaml exec db psql -U cdls -d postgres -c "CREATE DATABASE cdls_restore_test"
docker compose -f deploy/compose.yaml run --rm --no-deps -v "$PWD/deploy/backups:/backups:ro" --entrypoint pg_restore backup \
  --no-owner --dbname=cdls_restore_test /backups/<latest>.dump
docker compose -f deploy/compose.yaml exec db psql -U cdls -d cdls_restore_test -c "SELECT count(*) FROM users"
docker compose -f deploy/compose.yaml exec db psql -U cdls -d postgres -c "DROP DATABASE cdls_restore_test"
```
