# Runbook

Status: deploy, rollback and server baseline are written (ticket 33) but not yet exercised on a live server. Other sections are stubs.

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

TODO (ticket 34).

## Monitoring and alerts

TODO (ticket 35).

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
