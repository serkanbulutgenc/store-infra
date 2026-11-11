#!/usr/bin/env bash
# Internal alerts, run every 15 minutes by the store-alerts systemd timer:
#   - disk: root filesystem above DISK_ALERT_PERCENT (default 80)
#   - outbox: more email Messages have gone `failed` (gave up after all retries) than the
#     last time we looked (the count is kept in .alerts/outbox-failed)
#   - backup age: delegated to scripts/backup-check.sh (26 hours)
#   - stack health: api /health, the storefront home page (inside the web container) and
#     the caddy container; retried to ride out a deploy restart. A lasting failure alerts
#     hourly and one "back up" message follows recovery. While healthy, HEARTBEAT_URL (a
#     dead-man's-switch check, e.g. healthchecks.io) is pinged, so a dead server or timer is
#     noticed by the service when the pings stop.
# Disk, backup and probe alerts repeat every 6 hours while the condition lasts; failed
# emails alert once per new failure.
# Test hooks: DOCKER, CURL, DISK_PERCENT (instead of df), NOW, ALERT_STATE_DIR, NOTIFY,
# PROBE_TRIES, PROBE_RETRY_SECONDS.
set -uo pipefail
cd "$(dirname "$0")/.."
DOCKER=${DOCKER:-docker}; NOTIFY=${NOTIFY:-scripts/notify.sh}
STATE=${ALERT_STATE_DIR:-.alerts}; NOW=${NOW:-$(date +%s)}
[ -f env/alerts.env ] && { set -a; . env/alerts.env; set +a; }
LIMIT=${DISK_ALERT_PERCENT:-80}
mkdir -p "$STATE"; rc=0

alert_once() { # alert_once KEY TITLE MESSAGE [PRIORITY] [REPEAT_SECONDS]: skip repeats (default 6 hours)
  local last
  last=$(cat "$STATE/sent-$1" 2>/dev/null || echo 0)
  [ $((NOW - last)) -ge "${5:-21600}" ] || return 0
  "$NOTIFY" "$2" "$3" "${4:-4}" && echo "$NOW" >"$STATE/sent-$1"
}
clear_alert() { rm -f "$STATE/sent-$1"; }

used=${DISK_PERCENT:-$(df --output=pcent / | tail -n1 | tr -dc 0-9)}
if [ "$used" -gt "$LIMIT" ]; then
  rc=1; alert_once disk "Store: disk ${used}% full" "The root disk on $(hostname) is ${used}% full (limit ${LIMIT}%). Free space before backups or uploads fail."
else clear_alert disk; fi

COMPOSE_FILES=(-f compose.yaml)
if [ -f .env ] && grep -q '^PROXY_NETWORK=.' .env; then COMPOSE_FILES+=(-f compose.proxy.yaml); fi
CURL=${CURL:-curl}
RETRIES=${PROBE_TRIES:-3}; RETRY_WAIT=${PROBE_RETRY_SECONDS:-30}
dc() { timeout 20 "$DOCKER" compose "${COMPOSE_FILES[@]}" "$@"; }
probe_stack() { # prints what is not healthy, nothing when all is well
  local down=""
  dc exec -T api python -c "import urllib.request as u; u.urlopen('http://api:5000/health', timeout=5)" >/dev/null 2>&1 || down="api"
  dc exec -T web wget -q -O /dev/null -T 5 http://127.0.0.1:3000/ >/dev/null 2>&1 || down="${down:+$down, }storefront (web)"
  dc ps --status running --services 2>/dev/null | grep -qx caddy || down="${down:+$down, }caddy"
  printf '%s' "$down"
}
down=""
for ((try = 1; try <= RETRIES; try++)); do
  down=$(probe_stack)
  [ -z "$down" ] && break
  [ "$try" -lt "$RETRIES" ] && sleep "$RETRY_WAIT"
done
if [ -n "$down" ]; then
  rc=1; alert_once down "Store: DOWN" "Not healthy after $RETRIES checks: $down. Check: docker compose ps; docker compose logs --tail=50." 5 3600
else
  if [ -e "$STATE/sent-down" ]; then "$NOTIFY" "Store: back up" "All services are healthy again." 3; fi
  clear_alert down
  if [ -n "${HEARTBEAT_URL:-}" ]; then
    "$CURL" -fsS -m 10 --retry 3 "$HEARTBEAT_URL" >/dev/null || echo "alerts-check: heartbeat ping FAILED" >&2
  fi
fi

failed=$("$DOCKER" compose "${COMPOSE_FILES[@]}" exec -T api python manage.py outbox_failed_count 2>/dev/null | tr -dc 0-9)
if [ -z "$failed" ]; then
  rc=1; alert_once outbox-probe "Store: cannot read the email outbox" "scripts/alerts-check.sh could not run outbox_failed_count in the api container."
else
  clear_alert outbox-probe
  seen=$(cat "$STATE/outbox-failed" 2>/dev/null || echo "$failed")   # first look: no alert for history
  if [ "$failed" -gt "$seen" ]; then
    rc=1; "$NOTIFY" "Store: emails failed" "$((failed - seen)) new email(s) gave up after all retries ($failed failed in total). Open Dashboard > Orders and resend, or check SMTP."
  fi
  echo "$failed" >"$STATE/outbox-failed"
fi

if ! msg=$(NOTIFY=true scripts/backup-check.sh 2>&1); then
  rc=1; alert_once backup "Store: backup overdue" "$msg"
else clear_alert backup; fi
exit $rc
