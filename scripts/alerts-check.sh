#!/usr/bin/env bash
# Internal alerts, run every 15 minutes by the store-alerts systemd timer:
#   - disk: root filesystem above DISK_ALERT_PERCENT (default 80)
#   - outbox: more email Messages have gone `failed` (gave up after all retries) than the
#     last time we looked (the count is kept in .alerts/outbox-failed)
#   - backup age: delegated to scripts/backup-check.sh (26 hours)
# Disk, backup and probe alerts repeat every 6 hours while the condition lasts; failed
# emails alert once per new failure.
# Test hooks: DOCKER, DISK_PERCENT (instead of df), NOW, ALERT_STATE_DIR, NOTIFY.
set -uo pipefail
cd "$(dirname "$0")/.."
DOCKER=${DOCKER:-docker}; NOTIFY=${NOTIFY:-scripts/notify.sh}
STATE=${ALERT_STATE_DIR:-.alerts}; NOW=${NOW:-$(date +%s)}
[ -f env/alerts.env ] && { set -a; . env/alerts.env; set +a; }
LIMIT=${DISK_ALERT_PERCENT:-80}
mkdir -p "$STATE"; rc=0

alert_once() { # alert_once KEY TITLE MESSAGE: skip repeats within 6 hours
  local last
  last=$(cat "$STATE/sent-$1" 2>/dev/null || echo 0)
  [ $((NOW - last)) -ge 21600 ] || return 0
  "$NOTIFY" "$2" "$3" && echo "$NOW" >"$STATE/sent-$1"
}
clear_alert() { rm -f "$STATE/sent-$1"; }

used=${DISK_PERCENT:-$(df --output=pcent / | tail -n1 | tr -dc 0-9)}
if [ "$used" -gt "$LIMIT" ]; then
  rc=1; alert_once disk "Store: disk ${used}% full" "The root disk on $(hostname) is ${used}% full (limit ${LIMIT}%). Free space before backups or uploads fail."
else clear_alert disk; fi

COMPOSE_FILES=(-f compose.yaml)
if [ -f .env ] && grep -q '^PROXY_NETWORK=.' .env; then COMPOSE_FILES+=(-f compose.proxy.yaml); fi
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
