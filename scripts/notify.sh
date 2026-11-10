#!/usr/bin/env bash
# Send one alert to the Owner: ntfy push (and email through ntfy when ALERT_EMAIL is set).
#   scripts/notify.sh "Title" "Message" [priority 1-5, default 4]
# Always prints the alert to stderr, so journald/systemd keeps a record even when no
# channel is configured. Exits 0 when the push could not be sent, so a broken channel never
# hides the original problem; the failure is printed too. Test hook: CURL.
set -uo pipefail
cd "$(dirname "$0")/.."
CURL=${CURL:-curl}
[ -f env/alerts.env ] && { set -a; . env/alerts.env; set +a; }
title=${1:?title}; message=${2:?message}; priority=${3:-4}
echo "ALERT: $title: $message" >&2
[ -n "${NTFY_URL:-}" ] || { echo "notify: NTFY_URL is not set (env/alerts.env); alert not pushed" >&2; exit 0; }
args=(-fsS -m 10 --retry 2 -H "Title: $title" -H "Priority: $priority" -H "Tags: warning")
[ -z "${ALERT_EMAIL:-}" ] || args+=(-H "Email: $ALERT_EMAIL")
"$CURL" "${args[@]}" -d "$message" "$NTFY_URL" >/dev/null || echo "notify: push to ntfy FAILED" >&2
exit 0
