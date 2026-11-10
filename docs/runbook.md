# Runbook

Status: deploy, rollback, server baseline (ticket 33) and backups (ticket 34) are written but not yet exercised on a live server. Other sections are stubs.

## Server layout

One VPS (2 vCPU, 4 GB, 40 GB SSD minimum, EU region) running this Compose stack. `caddy` is the only service that publishes ports (80, 443). `postgres` and `redis` are on an internal network with no route to the host or the internet.

## Secrets

- Real values live only in `env/*.env` and `.env` on the server, mode 600, owner = the deploy user. Nothing secret is committed; `.gitignore` excludes them.
- Create them from the templates with `scripts/init-env.sh`, then fill in the blanks. Generate secrets with `openssl rand -base64 48`.
- Encryption keys for backups are held off the VPS (see Backups).
- CI secrets live in GitHub Actions secrets.
- Rotation: TODO (manual procedure per secret).

## DNS

TODO: A/AAAA record for the public domain pointing at the VPS; TTL to lower before a cutover; `www` redirect decision.

## SPF

TODO: SPF record authorising the SMTP provider.

## DKIM

TODO: DKIM selector and key published by the SMTP provider.

## DMARC

TODO: `_dmarc` record, starting at `p=none` with a reporting mailbox, tightening after monitoring.

## Deploy and rollback

**Publishing.** `store-backend` and `store-frontend` each have a `publish.yml` workflow: every merge to `main` pushes `ghcr.io/<owner>/store-<app>:sha-<commit>`, and pushing a `v*` git tag also pushes that tag. Production never runs `latest`. The frontend workflow is kept in `docs/templates/store-frontend-publish.yml` until it is copied to `store-frontend/.github/workflows/publish.yml`. If the packages are private, run `docker login ghcr.io` once on the server with a read-only token (`read:packages`).

**Deploy** (on the server, as the deploy user, outside trading hours):

```sh
cd ~/store-infra && git pull
scripts/deploy.sh v1.4.0              # api and web on the same tag
scripts/deploy.sh sha-1a2b3c4 v1.3.2  # or on different tags
```

It pulls the images, starts Postgres and Redis, runs `manage.py migrate` with the new api image, restarts everything and waits for healthchecks. If the restart is not healthy it starts the previous release again and exits non-zero. Brief downtime during the restart is accepted. The live tags are in `.deploy/current` and `.env`.

**Rollback:**

```sh
scripts/deploy.sh --rollback          # the tags that were live before; running it again flips back
scripts/deploy.sh v1.3.2              # or deploy any earlier tag by name
```

A rollback restarts the old images and does not run migrations backwards. So every migration must work with the previous release for one deploy: add columns and tables nullable or defaulted before the code uses them, and drop or rename only in a later release once nothing reads them. A release that breaks this rule cannot be rolled back; restore from backup instead.

`scripts/test-deploy.sh` checks the script's flow (deploy, second deploy, rollback, failed start, refused `latest`) against a fake docker and runs inside `scripts/check.sh`.

## Backups and restore drill

**What and where.** Every night (03:15 UTC) `scripts/backup.sh` writes to an off-site bucket through rclone:

- `db-YYYY-MM-DD.sql.gz.age`: `pg_dump` of the store database, gzipped.
- `media-DATE-full.tar.age` on Sundays (and on the first run), `media-DATE-incr.tar.age` on other nights (only files changed since the last success). A restore needs the latest full plus the incrementals after it.
- Retention (`backup/retention.py`, run after each backup): newest 14 daily, 8 weekly, 6 monthly. Incrementals are kept 14 days with their full.
- **Weekly provider snapshot:** enable the VPS provider's automatic weekly snapshot in its console (a whole-machine fallback; the provider keeps it, not these scripts). Note the setting in the launch checklist.

**Encryption and keys.** Objects are encrypted on the server with [age](https://age-encryption.org) to a public key, so the server holds nothing that can decrypt them. The private key lives off the VPS: password manager plus one printed copy kept with the Owner's papers. Losing it makes every backup unreadable; the drill proves the copy works.

**One-time setup** (on the server, as `deploy`):

```sh
age-keygen -o store-backup.key          # on YOUR machine, not the VPS; note the "Public key: age1..." line
scripts/init-env.sh                     # creates env/backup.env; set RCLONE_REMOTE and AGE_RECIPIENT (the public key)
rclone config                           # create the off-site remote (S3/B2/etc.); use a key that can write but ideally not delete outside the bucket
scripts/backup.sh                       # first run by hand; check the bucket has db-* and media-*-full objects
sudo cp backup/systemd/*.service backup/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now store-backup.timer store-alerts.timer
```

The units assume the checkout is `/home/deploy/store-infra` and the user is `deploy`; edit them if not.

**Age alert.** `store-alerts.timer` runs `scripts/alerts-check.sh` every 15 minutes, which includes `scripts/backup-check.sh`: the database or media backup having no success in 26 hours pushes an alert (see Monitoring and alerts). A dead server or stopped timer cannot report itself, so also set `PING_URL` to a dead-man's-switch check (e.g. healthchecks.io, period 24h, grace 2h): `backup.sh` pings it after each fully successful run and the service alerts you when the pings stop.

**Restore drill** (monthly, and before launch). On the server, copy the private key over for the drill:

```sh
scp store-backup.key deploy@server:/dev/shm/store-backup.key
scripts/restore.sh /dev/shm/store-backup.key            # latest backup; --date YYYY-MM-DD for an older one; --keep to leave it running
shred -u /dev/shm/store-backup.key
```

It downloads and decrypts the latest database and media chain, builds a scratch Compose project (`store-restore`, separate volumes, Caddy on `127.0.0.1:8081`, the live stack untouched), loads the data, starts every service and checks `/health`, the storefront through Caddy, applied migrations and media file count, then removes the scratch stack. `worker` and `beat` are deliberately not started, so the drill cannot send mail or call live APIs with the production credentials. Needs enough free disk for a second copy of the data. To restore for real after a disaster: provision a server (see Server baseline), run `scripts/deploy.sh <tag>` to get an empty stack, then load the dump into its `postgres` and untar the media chain into the `media` volume the way `scripts/restore.sh` does.

**Drill log** (add a line per drill: date, backup used, who, result, time taken, problems):

| Date | Backup | By | Result | Notes |
| --- | --- | --- | --- | --- |
| | | | not yet run on a live server | `scripts/test-backup.sh` covers the flow with fakes |

## Monitoring and alerts

Five parts. The first three need accounts only the Owner can create; the code for all of them is in place and does nothing until the values below are set.

**1. Error tracking (Sentry).** Create a Sentry project (platform Django) and put its DSN in `env/django.env` as `SENTRY_DSN=`; optionally `SENTRY_ENVIRONMENT=production`, `SENTRY_RELEASE=<tag>`. Restart (`scripts/deploy.sh` or `docker compose up -d`). The backend (`store_backend/observability.py`) never sends request bodies, cookies, headers or users, drops local variables, and replaces emails and phone numbers left in messages and exception text. Also enable "Prevent storing of IP addresses" and keep Session Replay off in the Sentry project settings (server-side backstop). **Check:** `docker compose exec api python manage.py sentry_test` sends a forced exception whose text contains a fake email and phone; open the event and confirm neither appears. The Start (frontend) server is wired the same way: put `SENTRY_DSN=` (and optionally `SENTRY_ENVIRONMENT`) in `env/web.env` and restart `web`. It drops request bodies, cookies, headers and user, and scrubs emails and phone numbers in `beforeSend`. It reports unhandled server errors and route errors rendered by the error page, not 4xx API outcomes (validation, 401, 403, 404). **Check:** with the DSN set, stop `api` and load the storefront; the failed page load should appear as an event, with no email, cookie or phone in it.

**2. Logs.** Backend logs are one JSON object per line on stdout; every service uses Docker `json-file` rotation (10 MB x 5). Read with `docker compose logs --since 1h api | jq -R 'fromjson? // .'`.

**3. Uptime and downtime alerts.** In an external service (UptimeRobot or Better Stack, free tier), create two checks at 1-minute to 5-minute intervals:

- `https://<domain>/` expecting 200 (storefront; fails if Caddy or `web` is down),
- `https://<domain>/api/health` expecting 200 (fails with 503 if Postgres or Redis is down; also fails if `api` is stopped).

Set the alert contacts to the Owner's email and the service's mobile push app. **Check:** `docker compose stop api`, wait for the alert (a few minutes), then `docker compose start api`.

**4. Internal alerts (ntfy).** Install the ntfy app on the Owner's phone, choose a long random topic, and set `NTFY_URL=https://ntfy.sh/<topic>` (and `ALERT_EMAIL` to also get email) in `env/alerts.env` (created by `scripts/init-env.sh`). Enable the timer:

```sh
sudo cp backup/systemd/store-alerts.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now store-alerts.timer
scripts/notify.sh "Test" "If you can read this on your phone, alerts work"
```

`scripts/alerts-check.sh` then pushes when: the root disk is over 80% (`DISK_ALERT_PERCENT`), more emails have failed after all retries than at the last check (`manage.py outbox_failed_count`), or the last backup is older than 26 hours. Disk and backup alerts repeat every 6 hours until fixed. Failed units show in `systemctl --failed` and `journalctl -u store-alerts`.

**5. Acceptance, once, before launch.** Record in the launch checklist: the forced Sentry event arrived scrubbed; stopping `api` raised a downtime alert; `notify.sh` reached the phone; filling the disk is not tested, but `DISK_ALERT_PERCENT=1 scripts/alerts-check.sh` should push a disk alert.

## Behind an existing Caddy

Use this when the host already runs a reverse proxy on 80/443 (a home server, say) and the shop shares it. Skip `scripts/server-baseline.sh` there; it rewrites SSH and firewall settings meant for a dedicated VPS.

In `.env` on the server (see `.env.example`):

```
SITE_ADDRESS=:80
CADDY_BIND=127.0.0.1
CADDY_HTTP_PORT=8080
CADDY_HTTPS_PORT=8443
```

The store's Caddy then serves plain HTTP on `127.0.0.1:8080` only, so it is not reachable from the network; the front Caddy owns the certificate. Add a block to the front Caddy's Caddyfile and reload it:

```
shop.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

If the front Caddy runs in Docker, `127.0.0.1` is the container itself. Either run it with host networking, or add `extra_hosts: ["host.docker.internal:host-gateway"]` and use `reverse_proxy host.docker.internal:8080`, and set `CADDY_BIND=0.0.0.0` only if the container cannot reach the loopback (then block 8080 from outside with the firewall).

Set `SITE_URL=https://shop.example.com` in `env/web.env` (canonicals and the sitemap use it), and make the Django allowed hosts and CSRF origins in `env/django.env` match the public hostname. The store's Caddyfile trusts `X-Forwarded-*` from private addresses, so the real client address and `https` scheme reach the app. `scripts/check-ports.sh` does not apply in this setup; check that `ss -tlnp` shows 8080 and 8443 bound to 127.0.0.1 only.

## Server baseline

Provision a VPS (2 vCPU, 4 GB, 40 GB SSD, EU region) with Debian 12/13 or Ubuntu 24.04 and add your SSH public key at creation. Then:

1. As root: `git clone` this repo, then `DEPLOY_USER=deploy scripts/server-baseline.sh`. Keep the root session open.
2. In a new terminal, confirm `ssh deploy@<server>` works. Only then close the root session.
3. As `deploy`: clone the repo, `cp .env.example .env`, set `SITE_ADDRESS`, `API_IMAGE`, `WEB_IMAGE` (owner part), run `scripts/init-env.sh`, fill the env files, `docker login ghcr.io` if needed, then `scripts/deploy.sh <tag>` for the first release.

The script sets: SSH keys only (no passwords, no root login, 3 tries), ufw allowing 22, 80, 443 (and 443/udp for HTTP/3), unattended security updates, fail2ban on sshd (4 failures in 10 minutes, 1 hour ban), Docker Engine. It is safe to re-run. Docker-published ports bypass ufw, so the guard is that only `caddy` publishes ports (`scripts/check.sh` asserts it).

**Verify from another machine:** `scripts/check-ports.sh <domain>` scans (all ports with `nmap` if installed) and fails on anything but 22, 80 and 443. Paste the output into the launch checklist.

## Troubleshooting

- Maintenance page showing: `web` is down or unhealthy. `docker compose ps`, then `docker compose logs web`.
- Photo shows "isleniyor" for long: the `worker` makes the WebP derivatives; check `docker compose logs worker`. Caddy sends the one-year `immutable` header only for files that exist, so a not-yet-made derivative is not cached as a 404.
- Media returns 404: the `media` volume is shared by `api` (read-write) and `caddy` (read-only); check the file exists under `/srv/media` in the `caddy` container.
- `password authentication failed` from `api`, `worker` or `beat`: Postgres reads `POSTGRES_USER`/`POSTGRES_PASSWORD` only when it first creates the `postgres_data` volume. Changing `env/postgres.env` afterwards (or switching between the placeholder override and the real images) leaves the old credentials in the volume.
  - Local or dev: `docker compose down -v` deletes the volume (and all its data), then `up` again.
  - Production: never `down -v`. Change the password inside Postgres instead (`docker compose exec postgres psql -U <user> -c "ALTER USER <user> PASSWORD '<new>'"`), then update `env/postgres.env` and restart the backend services.
- `/health` returns 503: Postgres or Redis is unreachable; the JSON body says which (`"postgres": "down"`).
