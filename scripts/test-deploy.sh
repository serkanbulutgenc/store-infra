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
if [[ "$*" == *"config --services"* ]]; then
  [ -z "${FAIL_CONFIG:-}" ] || exit 1
  printf '%s\n' caddy web api worker beat postgres redis ${SEARCH:+elasticsearch}
  exit 0
fi
# A broken Elasticsearch fails every `up` that includes it: by name, or by naming nothing.
if [[ -n "${SEARCH_BROKEN:-}" && "$*" == *" up -d "* ]]; then
  named=${*##*--wait-timeout }
  if [[ "$named" != *" "* || "$named" == *elasticsearch* ]]; then exit 1; fi
fi
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

chown_line=$(grep -n "run --rm --no-deps -u root api chown -R django:django /app/store_backend/media" log | head -1 | cut -d: -f1)
[ -n "$chown_line" ] || fail "no media ownership fix"
[ "$migrate_line" -lt "$chown_line" ] && [ "$chown_line" -lt "$restart_line" ] || fail "chown must run after migrate and before the restart"

scripts/deploy.sh v2 >/dev/null
expect_live ghcr.io/OWNER/store-backend:v2
[ "$(cat .deploy/previous)" = "v1 v1" ] || fail "previous should be v1"

scripts/deploy.sh --rollback >/dev/null
expect_live ghcr.io/OWNER/store-backend:v1
[ "$(cat .deploy/current)" = "v1 v1" ] || fail "current should be v1 after rollback"
grep -c "migrate" log | grep -qx 2 || fail "rollback must not migrate"
grep -c "chown" log | grep -qx 2 || fail "rollback must not touch media ownership"
scripts/deploy.sh --rollback >/dev/null
expect_live ghcr.io/OWNER/store-backend:v2

: >log
if FAIL_ON=:v3 scripts/deploy.sh v3 >/dev/null 2>&1; then fail "a failed start must fail the deploy"; fi
expect_live ghcr.io/OWNER/store-backend:v2
[ "$(cat .deploy/current)" = "v2 v2" ] || fail "state must not advance on failure"
tail -n1 log | grep -q "API_IMAGE=ghcr.io/OWNER/store-backend:v2" || fail "previous release not restarted"

# Search suggestions are optional: Elasticsearch starts after the shop and never decides
# whether a release is healthy.
shop="up -d --remove-orphans --wait --wait-timeout 180 caddy web api worker beat postgres redis |"
search="up -d --wait --wait-timeout 180 elasticsearch |"

: >log
scripts/deploy.sh v4 >/dev/null
grep -qF "$shop" log || fail "every service must be named when the profile is off"
if grep -q "up -d.*elasticsearch" log; then fail "profile off: Elasticsearch must not be started"; fi

: >log
SEARCH=1 scripts/deploy.sh v5 >/dev/null 2>err || fail "deploy with search"
grep -qF "$shop" log || fail "the shop must be waited for without Elasticsearch"
shop_line=$(grep -nF "$shop" log | head -1 | cut -d: -f1)
search_line=$(grep -nF "$search" log | head -1 | cut -d: -f1)
[ -n "$search_line" ] && [ "$shop_line" -lt "$search_line" ] || fail "Elasticsearch must start after the shop"
if grep -qi "warning" err; then fail "a healthy Elasticsearch must not warn"; fi

: >log
SEARCH=1 SEARCH_BROKEN=1 scripts/deploy.sh v6 >/dev/null 2>err || fail "a broken Elasticsearch must not fail a deploy"
expect_live ghcr.io/OWNER/store-backend:v6
[ "$(cat .deploy/current)" = "v6 v6" ] || fail "state must advance despite a broken Elasticsearch"
grep -qi "warning.*Elasticsearch" err || fail "a broken Elasticsearch must be reported"

SEARCH=1 SEARCH_BROKEN=1 scripts/deploy.sh --rollback >/dev/null 2>err || fail "a broken Elasticsearch must not fail a rollback"
expect_live ghcr.io/OWNER/store-backend:v5
grep -qi "warning.*Elasticsearch" err || fail "rollback must report a broken Elasticsearch"

: >log
if FAIL_CONFIG=1 scripts/deploy.sh v7 >/dev/null 2>&1; then fail "an unreadable Compose configuration must fail the deploy"; fi
expect_live ghcr.io/OWNER/store-backend:v5
if grep -q "remove-orphans" log; then fail "nothing must be restarted without the service list"; fi

if scripts/deploy.sh latest >/dev/null 2>&1; then fail "latest must be refused"; fi
if scripts/deploy.sh >/dev/null 2>&1; then fail "a tag is required"; fi
rm -rf .deploy
if scripts/deploy.sh --rollback >/dev/null 2>&1; then fail "rollback needs history"; fi
echo OK
