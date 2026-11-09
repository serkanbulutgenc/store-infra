#!/usr/bin/env bash
# Fail if any service is not running, or reports unhealthy. Run after `up --wait`
# and again after the tests (a service that crashed mid-run fails the job).
set -euo pipefail
cd "$(dirname "$0")/.."
args=(); IFS=, read -ra files <<< "${E2E_COMPOSE_FILES:-compose.yaml,compose.dev.yaml}"
for f in "${files[@]}"; do args+=(-f "$f"); done
docker compose "${args[@]}" ps --all --format json | python3 scripts/stack_status.py
