#!/usr/bin/env bash
# Exercises scripts/deploy.sh against a fake docker: deploy, second deploy, rollback,
# rollback of a failed start and the refusals. Needs no Docker daemon.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts"
cp "$here/scripts/deploy.sh" "$work/scripts/"
cp "$here/.env.example" "$work/.env"
touch "$work/compose.yaml"
cat >"$work/fake-docker" <<'FAKE'
#!/usr/bin/env bash
echo "$* | API_IMAGE=${API_IMAGE:-} WEB_IMAGE=${WEB_IMAGE:-}" >>"$FAKE_LOG"
if [[ "$*" == *"up -d --remove-orphans"* && -n "${FAIL_ON:-}" && "${API_IMAGE:-}" == *"$FAIL_ON" ]]; then exit 1; fi
FAKE
chmod +x "$work/fake-docker"
export DOCKER="$work/fake-docker" FAKE_LOG="$work/log"
cd "$work"

fail() { echo "FAIL: $*"; echo "--- log"; cat "$FAKE_LOG" 2>/dev/null; exit 1; }
live() { sed -n 's/^API_IMAGE=//p' .env; }
expect_live() { [ "$(live)" = "$1" ] || fail "expected live $1, got $(live)"; }

scripts/deploy.sh v1 >/dev/null
expect_live ghcr.io/OWNER/store-backend:v1
grep -q "run --rm --no-deps api python manage.py migrate --noinput" log || fail "no migrate"
migrate_line=$(grep -n "migrate" log | head -1 | cut -d: -f1)
restart_line=$(grep -n "remove-orphans" log | head -1 | cut -d: -f1)
[ "$migrate_line" -lt "$restart_line" ] || fail "migrate must run before the restart"

scripts/deploy.sh v2 >/dev/null
expect_live ghcr.io/OWNER/store-backend:v2
[ "$(cat .deploy/previous)" = "v1 v1" ] || fail "previous should be v1"

scripts/deploy.sh --rollback >/dev/null
expect_live ghcr.io/OWNER/store-backend:v1
[ "$(cat .deploy/current)" = "v1 v1" ] || fail "current should be v1 after rollback"
grep -c "migrate" log | grep -qx 2 || fail "rollback must not migrate"
scripts/deploy.sh --rollback >/dev/null
expect_live ghcr.io/OWNER/store-backend:v2

: >log
if FAIL_ON=:v3 scripts/deploy.sh v3 >/dev/null 2>&1; then fail "a failed start must fail the deploy"; fi
expect_live ghcr.io/OWNER/store-backend:v2
[ "$(cat .deploy/current)" = "v2 v2" ] || fail "state must not advance on failure"
tail -n1 log | grep -q "API_IMAGE=ghcr.io/OWNER/store-backend:v2" || fail "previous release not restarted"

if scripts/deploy.sh latest >/dev/null 2>&1; then fail "latest must be refused"; fi
if scripts/deploy.sh >/dev/null 2>&1; then fail "a tag is required"; fi
rm -rf .deploy
if scripts/deploy.sh --rollback >/dev/null 2>&1; then fail "rollback needs history"; fi
echo OK
