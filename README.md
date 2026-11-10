# store-infra

Compose stack, Caddy config, env templates and runbook for the Aura Tekstil store. The apps live in `store-backend` and `store-frontend`.

| Service | Role | Network |
| --- | --- | --- |
| `caddy` | only public service: TLS, `/media/*` from a shared volume, maintenance page | edge |
| `web` | TanStack Start server (storefront and `/admin`), proxies `/api/**` to `api` | edge, app |
| `api` | Django + gunicorn on :5000 | app, data |
| `worker`, `beat` | Celery, same image as `api` | app, data |
| `postgres`, `redis` | data stores, not reachable from the host | data (internal) |

## Local

```sh
docker compose up                 # placeholder app images; Caddy on http://localhost:8080
docker compose stop web           # http://localhost:8080 now serves the 503 maintenance page
```

The bare command also loads `compose.override.yaml`, which swaps the apps for a placeholder image and Caddy to plain HTTP. Production never loads it.

## Local with the real apps

Builds from `../store-backend` and `../../Web/store-frontend` (change `BACKEND_DIR` / `FRONTEND_DIR` in `.env` if yours differ):

```sh
scripts/init-env.sh               # creates env/*.env (mode 600); fill in the blanks
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

## Production

```sh
cp .env.example .env              # SITE_ADDRESS, API_IMAGE, WEB_IMAGE
scripts/init-env.sh
docker compose -f compose.yaml up -d
```

## Deploy

`scripts/deploy.sh <tag>` pulls, migrates and restarts; `scripts/deploy.sh --rollback` returns to the previous tags. `scripts/server-baseline.sh` hardens a new VPS and `scripts/check-ports.sh <host>` verifies only 22, 80 and 443 are open. See `docs/runbook.md`.

## Backups

`scripts/backup.sh` writes encrypted nightly backups of Postgres and the media volume to an off-site rclone remote; `scripts/backup-check.sh` alerts when none succeeded in 26 hours; `scripts/restore.sh` rebuilds a scratch stack from them for the monthly drill. Setup, key handling and the drill log are in `docs/runbook.md`.

## Checks

`scripts/check.sh` runs the deploy-script and backup/restore tests (fake docker), validates both Compose configurations, asserts only `caddy` publishes ports, and validates the Caddyfile (the last step needs a Docker daemon).

## End-to-end smoke tests

Playwright tests in `e2e/` run against the real stack (both app images built from the sibling checkouts). The CI job `.github/workflows/e2e.yml` runs on pull requests: it builds the images, runs `up --wait`, asserts every service is up, runs the tests, asserts again, and dumps logs plus the Playwright report on failure.

Locally, with the dev stack already up (`docker compose -f compose.yaml -f compose.dev.yaml up -d --wait`):

```sh
scripts/assert-stack-up.sh        # fails if any service is down or unhealthy
cd e2e && pnpm install && pnpm exec playwright install chromium
pnpm test                         # E2E_BASE_URL defaults to http://localhost:8080
```

To reuse the harness for a new test, add a spec under `e2e/tests/`. `e2e/support/stack.ts` has helpers for running commands in service containers (`execInService`) and for reading endpoints Caddy does not publish (`getFromApiContainer`).

CI notes: `scripts/ci-env.sh` writes throwaway env files with random secrets. The workflow checks out `store-backend` and `store-frontend` from the same owner; for private repos add a `CHECKOUT_TOKEN` secret with read access.
