# Sauvegarde et restauration / Backup and restore

The `backup` container writes a dump of the `cdls` database every night (02:00 UTC, `BACKUP_HOUR`) and once when the
stack starts, into `deploy/backups/` on the host (`BACKUP_DIR`). Files are named `cdls-YYYYMMDD-HHMMSS.dump` (pg_dump
custom format, compressed); dumps older than `BACKUP_RETENTION_DAYS` (14) are deleted. **A backup that stays on the same
disk does not protect against a lost disk: copy `deploy/backups/` to another drive or a cloud folder regularly.**

## Encrypted dumps (recommended)

The dumps hold minors' data, grades and password hashes. Dump files are owner-only (`umask 077`; on Linux they belong
to root, use `sudo` to copy them), but once copied to a drive or a cloud folder only encryption protects them.
Set `BACKUP_AGE_RECIPIENT` in `deploy/.env` to an [age](https://github.com/FiloSottile/age) **public** key and every dump
becomes `cdls-YYYYMMDD-HHMMSS.dump.age` (the clear dump is deleted; if encryption fails, nothing is kept and the
container logs an error, and a bad key stops the container at start). Retention counts both `.dump` and `.dump.age`.

1. On another machine (not the school laptop): `age-keygen -o cdls-backup.key` (age 1.x; `apt install age`,
   `brew install age`, `winget install FiloSottile.age`). The file holds the private key; the line `# public key: age1...`
   is the public one.
2. Put only the `age1...` public key in `deploy/.env`, then `docker compose -f deploy/compose.yaml up -d --build backup`.
3. Keep the private key off the school laptop: a password manager and a printed copy in the safe. **Lose it and the
   encrypted backups are unreadable.**

To restore, decrypt on a machine that has the key, then use the clear `.dump` file in the steps below:

```bash
age -d -i cdls-backup.key -o cdls-20261023-020000.dump deploy/backups/cdls-20261023-020000.dump.age
```
Delete the clear file when the restore is done (`shred -u` or just `rm` on an encrypted disk), and never leave it in
`deploy/backups/`.

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
5. Check: `docker compose -f deploy/compose.yaml exec api node -e "fetch('http://127.0.0.1:3000/api/health/db').then(r=>r.text()).then(console.log)"` prints `{"status":"ok"}`, then sign in. (The database check answers only from inside the stack: through the web container it is a 404.)

Restoring onto a **new machine**: install Docker, clone the repository, copy your `deploy/.env` (keep the same
`JWT_*` secrets if you want sessions to survive; otherwise everybody just signs in again), start only the database
(`docker compose -f deploy/compose.yaml up -d db`), copy the dump into `deploy/backups/`, then follow steps 3 and 4.

## Test the restore regularly

Once a month, restore the latest dump into a throw-away database and look at it. With encrypted dumps this also proves
that your private key still works: decrypt the latest `.dump.age` first (command above) and use the clear file as
`<latest>.dump` below, then delete it. Also check that the copy kept off the machine contains the latest dump.

```bash
docker compose -f deploy/compose.yaml exec db psql -U cdls -d postgres -c "CREATE DATABASE cdls_restore_test"
docker compose -f deploy/compose.yaml run --rm --no-deps -v "$PWD/deploy/backups:/backups:ro" --entrypoint pg_restore backup \
  --no-owner --dbname=cdls_restore_test /backups/<latest>.dump
docker compose -f deploy/compose.yaml exec db psql -U cdls -d cdls_restore_test -c "SELECT count(*) FROM users"
docker compose -f deploy/compose.yaml exec db psql -U cdls -d postgres -c "DROP DATABASE cdls_restore_test"
```
