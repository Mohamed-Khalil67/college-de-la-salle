# Deploying the platform with Docker

One command starts the whole school platform (website, API, PostgreSQL 18, nightly backups) on a laptop or a server,
and makes it reachable from anywhere over HTTPS. Everything lives in [`deploy/`](../deploy) plus the two Dockerfiles
([`apps/api/Dockerfile`](../apps/api/Dockerfile), [`apps/web/Dockerfile`](../apps/web/Dockerfile)).

```
visitor ── HTTPS ──> Cloudflare Tunnel  (profile "tunnel")   ┐
                 or  Caddy + Let's Encrypt (profile "caddy") ┴─> web (nginx) ──/api──> api (NestJS) ──> db (PostgreSQL 18)
                                                                   static site          migrations on start    volume + nightly dumps
```

Only `web` is reachable from outside (through the tunnel or Caddy). `db` and `api` are never published on the host.
`web` also listens on `127.0.0.1:8080` of the machine itself, for a local check.

## What you must provide

| What | Why | Where it goes |
|---|---|---|
| A way to be reached: a **Cloudflare tunnel token** (laptop, free) **or** a **domain + a server with ports 80/443 open** | HTTPS from anywhere | `TUNNEL_TOKEN` or `DOMAIN` |
| The public address, e.g. `https://ecole.example.org` | links in e-mails, allowed origin | `PUBLIC_WEB_URL` |
| The school's real e-mail domain (accounts become `prenom.nom@<domain>`) | the demo domain is refused in production | `SCHOOL_EMAIL_DOMAIN` |
| SMTP details (host, port, user, password, sender) | « mot de passe oublié » sends e-mails; `MAIL_TRANSPORT=log` is refused in production | `SMTP_*`, `MAIL_FROM` |
| Name and e-mail of the first administrator | `create-admin` below | typed on the command line |

Random secrets (database password, JWT secrets) are generated for you.

## Option A (recommended for a home laptop): Cloudflare Tunnel

The tunnel makes an **outbound** connection from your laptop to Cloudflare, so you open **no router port** and it works
even when your internet provider shares one address between customers (CGNAT). The laptop must stay on and connected.

1. **Domain.** A tunnel needs a domain managed by Cloudflare. Register or move one (the cheapest `.com`/`.org` are about
   10 USD a year; Cloudflare sells at cost), or add an existing domain to a free Cloudflare account (change its name
   servers as Cloudflare explains). The Cloudflare account, the tunnel and DNS are free.
2. In the Cloudflare dashboard open **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it
   `cdls`, and choose the **Docker** install tab. Copy only the token (the long string after `--token`).
3. In the tunnel's **Public Hostname** tab add: subdomain `ecole` (or empty), your domain, service
   **Type `HTTP`, URL `web:8080`**. Cloudflare creates the DNS record and the HTTPS certificate itself.
4. Put the token in `deploy/.env` (`TUNNEL_TOKEN=…`) and set `PUBLIC_WEB_URL=https://ecole.example.org`.
5. Start with `--profile tunnel` (see "First start").

## Option B: a server with a public IP (Caddy + Let's Encrypt)

For a VM at a hosting provider, or a machine at school with a fixed public address.

1. Create a DNS `A` record (and `AAAA` if you have IPv6) for `ecole.example.org` pointing at the server.
2. Open ports **80 and 443** (TCP, and 443/UDP for HTTP/3) in the server firewall and the provider's firewall.
   Do not open anything else (no 5432, no 3000, no 8080).
3. In `deploy/.env`: `DOMAIN=ecole.example.org`, `PUBLIC_WEB_URL=https://ecole.example.org`.
4. Start with `--profile caddy`. Caddy obtains and renews the Let's Encrypt certificate by itself (the first request can
   take a few seconds). If it cannot, `docker compose -f deploy/compose.yaml logs caddy` says why (usually DNS or port 80).

Behind home-router port forwarding with a public IPv4 this works too, but prefer the tunnel: no router configuration,
no exposed address.

## First start

### Windows laptop (Docker Desktop)

1. Install **Docker Desktop** ([docker.com](https://www.docker.com/products/docker-desktop/)), accept the WSL 2 backend,
   start it, and in *Settings → General* tick **Start Docker Desktop when you sign in**. In *Settings → Resources* 4 GB of
   memory is plenty. Install **Git**.
2. Open PowerShell:
   ```powershell
   git clone <repository-url> cdls; cd cdls
   powershell -ExecutionPolicy Bypass -File deploy\scripts\generate-env.ps1
   notepad deploy\.env
   ```
   Fill `PUBLIC_WEB_URL`, `SCHOOL_EMAIL_DOMAIN`, `SMTP_*`, `MAIL_FROM` and `TUNNEL_TOKEN` (or `DOMAIN`). Save the file
   in a password manager too: it holds every secret, and it is **not** in git.
3. Start (first build takes 5 to 10 minutes):
   ```powershell
   docker compose -f deploy/compose.yaml --profile tunnel up -d --build
   docker compose -f deploy/compose.yaml ps
   ```
   Everything must become `healthy`/`running`. `restart: unless-stopped` brings it back after a reboot as soon as
   Docker Desktop starts. In Windows *Power & sleep* set the laptop to never sleep while plugged in.

### Linux VM

```bash
sudo apt-get install -y docker.io docker-compose-v2 git      # or Docker's official repository
git clone <repository-url> cdls && cd cdls
sh deploy/scripts/generate-env.sh && nano deploy/.env
docker compose -f deploy/compose.yaml --profile caddy up -d --build    # or --profile tunnel
```
Add your user to the `docker` group (or use `sudo`). Docker starts the stack at boot.

### Create the first administrator (no demo data)

```bash
docker compose -f deploy/compose.yaml exec api node dist/cli/create-admin.js \
  --email direction@your-domain.org --first Prénom --last Nom
```

It prints a temporary password **once**. Sign in at `https://<your address>/connexion`; you are asked to choose your own
password immediately. It also creates the reference data the school needs (the two sections and the subject catalogue;
safe to repeat). Lost the password? Run the same command with `--reset`. To choose the temporary password yourself, pass
`-e CREATE_ADMIN_PASSWORD='…'` to `exec`. Then, as administrator: create the school year, classes, accounts or import the
rosters from the administration space.

### Optional: demo data (never on a school's real database)

`npm run seed:demo` **wipes every table** and fills a fictional school. Use it only on a throw-away stack, never after the
school has real data:

```bash
docker compose -f deploy/compose.yaml exec api npm run seed:demo
docker compose -f deploy/compose.yaml exec api cat demo-credentials.local.md    # random passwords of the demo accounts
```
(Demo accounts use the `demo.cdls.test` address; they work because they are stored data, not because of `SCHOOL_EMAIL_DOMAIN`.)

## Everyday operations

| Task | Command (repository root) |
|---|---|
| Status | `docker compose -f deploy/compose.yaml ps` |
| Logs (rotated: 3 × 10 MB per container) | `docker compose -f deploy/compose.yaml logs -f --tail 100 api` |
| Stop / start | `docker compose -f deploy/compose.yaml --profile tunnel stop` / `… up -d` |
| Health | `curl http://127.0.0.1:8080/api/health` and `/api/health/db` |
| Back up now | `docker compose -f deploy/compose.yaml run --rm -e BACKUP_ONCE=true backup` |
| Restore | [`deploy/restore.md`](../deploy/restore.md) |

### Update to a new version

```bash
git pull
docker compose -f deploy/compose.yaml --profile tunnel up -d --build
```
The API container runs `prisma migrate deploy` before it starts (pending migrations only; a failing migration stops the
container instead of running on a wrong schema). Take a backup first (command above) when the update includes migrations.
Rollback: `git checkout <previous tag or commit>` and rebuild; restore the pre-update dump if a migration changed the data.
Free disk space from old images now and then: `docker image prune -f`.

### Backups

A `backup` container dumps the database at start-up and every night at 02:00 UTC into `deploy/backups/`, keeping 14 days.
Copy that folder off the machine (external drive, cloud storage) at least weekly; practise the restore once.
Details and the restore procedure: [`deploy/restore.md`](../deploy/restore.md).

## Settings reference

`deploy/.env.example` documents every variable. Highlights:

- `NODE_ENV=production` is fixed by the compose file. In production the API refuses to start with placeholder JWT secrets,
  the demo e-mail domain, or `MAIL_TRANSPORT=log` (`apps/api/src/config/env.validation.ts`).
- **Cookies.** The refresh token is an httpOnly, `Secure`, `SameSite=Strict` cookie on path `/api/auth`. The site and the
  API share one origin (nginx proxies `/api`), so it works unchanged through the tunnel or Caddy. `COOKIE_SECURE` stays
  empty (= on in production). Only set `false` to test over plain HTTP on an address other than `localhost`.
- **`TRUST_PROXY=1`.** The web container is the one proxy in front of the API; it takes the visitor's address from the
  tunnel/Caddy (private Docker network only) so the sign-in rate limit (5 a minute per account and address) sees the real
  client. Do not raise it.
- Sizing for about 600 students: PostgreSQL 192 MB shared buffers (768 MB cap), API 512 MB cap, web 128 MB. A laptop with
  4 GB free memory and 20 GB disk is enough.

## Security checklist

- [ ] `deploy/.env` created by `generate-env` (random secrets), kept out of git and stored in a password manager. Never paste
      it into chats or tickets. Rotating `JWT_*` signs everybody out; do not change `POSTGRES_PASSWORD` on an existing database
      without also running `ALTER USER cdls PASSWORD '…'`.
- [ ] Only the tunnel, or ports 80/443, are reachable from the internet. No router port-forward for 5432, 3000 or 8080
      (compose does not publish them anyway; 8080 is bound to 127.0.0.1).
- [ ] Windows laptop: Windows Firewall on, Windows and Docker Desktop updated, disk encrypted (BitLocker), a strong account
      password and automatic lock: the machine holds the school's data.
- [ ] HTTPS only: the site is only advertised through the tunnel or Caddy; `PUBLIC_WEB_URL` starts with `https://`.
- [ ] The first administrator changed the temporary password at first sign-in; no shared admin account; unused accounts
      disabled. Never use `seed:demo` on the real database.
- [ ] Cloudflare: turn on two-factor authentication on the account; keep `TUNNEL_TOKEN` secret (if leaked, delete the tunnel
      and create another).
- [ ] SMTP password is an app-specific/sending-only credential.
- [ ] Backups copied off-site, restore tested, `docker image prune` and `git pull && up --build` done monthly for updates.
- [ ] Containers run without extra privileges, the API and nginx as non-root users, logs rotated.

## Troubleshooting

- `up` fails with « required variable … is missing »: you have no `deploy/.env` (run `generate-env`).
- API container restarting: `docker compose -f deploy/compose.yaml logs api`. « Invalid environment » lists the setting to fix.
- The site loads but sign-in fails with a network error: `PUBLIC_WEB_URL` differs from the address you browse (CORS), or
  you browse over plain HTTP while the cookie is `Secure`.
- Tunnel shows « Bad gateway »: the public hostname service must be `http://web:8080` and `web` must be healthy.
- Too many sign-in attempts from the school: limits are per account and per address; see `LOGIN_THROTTLE_LIMIT`.
