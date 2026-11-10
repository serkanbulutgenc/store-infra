#!/usr/bin/env bash
# Static checks that need no running stack. Needs the docker CLI (and daemon for the Caddy step).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== deploy script (fake docker)"
scripts/test-deploy.sh
echo "== backup scripts (fake docker, age, rclone) and retention"
scripts/test-backup.sh
python3 backup/test_retention.py
echo "== alerts (fake docker, notify)"
scripts/test-alerts.sh
echo "== compose (placeholder + production)"
docker compose config -q
docker compose -f compose.yaml config -q
docker compose -f compose.yaml -f backup/compose.restore.yaml config -q
echo "== only caddy publishes ports"
published=$(docker compose -f compose.yaml config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin)["services"]; print(" ".join(sorted(n for n,s in c.items() if s.get("ports"))))')
[ "$published" = "caddy" ] || { echo "FAIL: services publishing ports: $published"; exit 1; }
echo "== caddyfile"
docker run --rm -e SITE_ADDRESS=example.com -v "$PWD/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
echo OK
