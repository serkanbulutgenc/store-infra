#!/usr/bin/env bash
# Feeds scripts/stack_status.py sample `docker compose ps` output. Needs no Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*"; exit 1; }
row() { echo "{\"Service\":\"$1\",\"State\":\"$2\",\"Health\":\"$3\"}"; }
status() { # status REQUIRED... (rows on stdin)
  python3 scripts/stack_status.py "$@" >/dev/null 2>&1
}

api=$(row api running healthy); worker=$(row worker running "")
printf '%s\n' "$api" "$worker" | status || fail "a healthy stack must pass"
printf '%s\n' "$api" "$(row worker exited "")" | status && fail "a stopped service must fail"
printf '%s\n' "$api" "$(row web running unhealthy)" | status && fail "an unhealthy service must fail"
echo -n | status && fail "an empty stack must fail"

search=$(row elasticsearch running healthy)
printf '%s\n' "$api" "$search" | status elasticsearch || fail "a required healthy service must pass"
printf '%s\n' "$api" | status elasticsearch && fail "a required service that is missing must fail"
for health in unhealthy starting ""; do
  printf '%s\n' "$api" "$(row elasticsearch running "$health")" | status elasticsearch &&
    fail "a required service must report healthy, not '$health'"
done
echo OK
