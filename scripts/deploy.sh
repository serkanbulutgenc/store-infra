#!/usr/bin/env bash
# One-command deploy and rollback, run on the server from the store-infra checkout.
#
#   scripts/deploy.sh v1.4.0              api and web both at v1.4.0
#   scripts/deploy.sh v1.4.0 v1.3.2       api and web at different tags
#   scripts/deploy.sh --rollback          back to the tags that were live before
#
# Steps: pull the images, start Postgres and Redis, run migrations with the NEW api
# image, restart everything on the new tags and wait for healthchecks. If the restart
# does not come up healthy the previous tags are started again.
#
# Migrations must stay backwards compatible with the previous release for one deploy
# (add before you use, drop only in a later release), because a rollback restarts the
# old images against the already-migrated database and never un-migrates.
#
# State: .deploy/current and .deploy/previous hold "api_tag web_tag". .env is rewritten
# so a plain `docker compose -f compose.yaml up -d` after a reboot uses the live tags.
# Test hooks: DOCKER overrides the docker binary, WAIT_TIMEOUT the healthcheck wait.
set -euo pipefail
cd "$(dirname "$0")/.."

DOCKER=${DOCKER:-docker}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-180}
STATE=.deploy
compose() { "$DOCKER" compose -f compose.yaml "$@"; }
die() { echo "deploy: $*" >&2; exit 1; }

[ -f .env ] || die ".env is missing (cp .env.example .env, then scripts/init-env.sh)"
mkdir -p "$STATE"

image_repo() { # image_repo API_IMAGE -> ghcr.io/acme/store-backend (tag stripped)
  local value
  value=$(sed -n "s/^$1=//p" .env | tail -n1)
  [ -n "$value" ] || die "$1 is not set in .env"
  echo "${value%:*}"
}

check_tag() {
  case "$1" in
    "" | latest) die "refusing tag '$1': deploy a pinned version (a release tag or sha-<commit>)" ;;
    *[!A-Za-z0-9._-]*) die "invalid tag '$1'" ;;
  esac
}

set_env() { # set_env KEY VALUE, rewriting .env in place (mode kept)
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    echo "$1=$2" >>.env
  fi
}

start() { # start API_TAG WEB_TAG: bring the whole stack up on these tags
  API_IMAGE="$API_REPO:$1" WEB_IMAGE="$WEB_REPO:$2" \
    compose up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT"
}

record() { # record API_TAG WEB_TAG: make these the live tags
  if [ -f "$STATE/current" ] && [ "$(cat "$STATE/current")" != "$1 $2" ]; then
    cp "$STATE/current" "$STATE/previous"
  fi
  echo "$1 $2" >"$STATE/current"
  set_env API_IMAGE "$API_REPO:$1"
  set_env WEB_IMAGE "$WEB_REPO:$2"
}

API_REPO=$(image_repo API_IMAGE)
WEB_REPO=$(image_repo WEB_IMAGE)

if [ "${1:-}" = "--rollback" ]; then
  [ -f "$STATE/previous" ] || die "nothing to roll back to (no .deploy/previous)"
  read -r api_tag web_tag <"$STATE/previous"
  echo "== rolling back to api=$api_tag web=$web_tag"
  start "$api_tag" "$web_tag" || die "rollback did not come up healthy; see: docker compose logs"
  # Swap, so running --rollback twice flips back.
  cp "$STATE/current" "$STATE/swap"
  echo "$api_tag $web_tag" >"$STATE/current"
  mv "$STATE/swap" "$STATE/previous"
  set_env API_IMAGE "$API_REPO:$api_tag"
  set_env WEB_IMAGE "$WEB_REPO:$web_tag"
  echo "== rolled back"
  exit 0
fi

api_tag=${1:-}
web_tag=${2:-$api_tag}
check_tag "$api_tag"
check_tag "$web_tag"

echo "== deploying api=$api_tag web=$web_tag"
API_IMAGE="$API_REPO:$api_tag" WEB_IMAGE="$WEB_REPO:$web_tag" compose pull api worker beat web
compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" postgres redis
echo "== migrating"
API_IMAGE="$API_REPO:$api_tag" compose run --rm --no-deps api python manage.py migrate --noinput

echo "== restarting"
if ! start "$api_tag" "$web_tag"; then
  echo "deploy: the new release did not come up healthy" >&2
  if [ -f "$STATE/current" ]; then
    read -r old_api old_web <"$STATE/current"
    echo "deploy: restarting the previous release api=$old_api web=$old_web" >&2
    start "$old_api" "$old_web" || echo "deploy: previous release did not come up either" >&2
  fi
  exit 1
fi

record "$api_tag" "$web_tag"
echo "== deployed api=$api_tag web=$web_tag"
