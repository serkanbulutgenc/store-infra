# Runbook

Status: stub. Headings are fixed so later tickets (deploy, backups, observability, launch) have a place to fill in. Nothing here is verified against a live server yet.

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

TODO (ticket 33): one-command script that pulls tags, migrates and restarts; rollback re-runs it with the previous tag. Deploy outside trading hours.

## Backups and restore drill

TODO (ticket 34).

## Monitoring and alerts

TODO (ticket 35).

## Server baseline

TODO (ticket 33): SSH keys only, no root login, firewall on 80/443/SSH, unattended security updates, fail2ban.

## Troubleshooting

- Maintenance page showing: `web` is down or unhealthy. `docker compose ps`, then `docker compose logs web`.
- Photo shows "isleniyor" for long: the `worker` makes the WebP derivatives; check `docker compose logs worker`. Caddy sends the one-year `immutable` header only for files that exist, so a not-yet-made derivative is not cached as a 404.
- Media returns 404: the `media` volume is shared by `api` (read-write) and `caddy` (read-only); check the file exists under `/srv/media` in the `caddy` container.
- `password authentication failed` from `api`, `worker` or `beat`: Postgres reads `POSTGRES_USER`/`POSTGRES_PASSWORD` only when it first creates the `postgres_data` volume. Changing `env/postgres.env` afterwards (or switching between the placeholder override and the real images) leaves the old credentials in the volume.
  - Local or dev: `docker compose down -v` deletes the volume (and all its data), then `up` again.
  - Production: never `down -v`. Change the password inside Postgres instead (`docker compose exec postgres psql -U <user> -c "ALTER USER <user> PASSWORD '<new>'"`), then update `env/postgres.env` and restart the backend services.
- `/health` returns 503: Postgres or Redis is unreachable; the JSON body says which (`"postgres": "down"`).
