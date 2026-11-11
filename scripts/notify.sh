#!/usr/bin/env bash
# Send one alert to the Owner: an ntfy push, and an email over SMTP when configured.
#   scripts/notify.sh "Title" "Message" [priority 1-5, default 4]
# Always prints the alert to stderr, so journald/systemd keeps a record even when no
# channel is configured. Exits 0 when a channel failed, so a broken channel never hides the
# original problem; the failure is printed too. Channels are independent: a failed push does
# not stop the email. ntfy.sh no longer sends anonymous email, so email goes straight to the
# SMTP relay (ALERT_EMAIL, ALERT_SMTP_*) instead of through ntfy. Test hook: CURL.
set -uo pipefail
cd "$(dirname "$0")/.."
CURL=${CURL:-curl}
[ -f env/alerts.env ] && { set -a; . env/alerts.env; set +a; }
title=${1:?title}; message=${2:?message}; priority=${3:-4}
echo "ALERT: $title: $message" >&2

if [ -n "${NTFY_URL:-}" ]; then
  "$CURL" -fsS -m 10 --retry 2 -H "Title: $title" -H "Priority: $priority" -H "Tags: warning" \
    -d "$message" "$NTFY_URL" >/dev/null || echo "notify: push to ntfy FAILED" >&2
else
  echo "notify: NTFY_URL is not set (env/alerts.env); alert not pushed" >&2
fi

send_email() {
  local from=${ALERT_SMTP_FROM:-$ALERT_SMTP_USER} cfg subject body
  cfg=$(mktemp) || return 1
  trap 'rm -f "$cfg"' RETURN
  chmod 600 "$cfg"
  # Credentials go through a private config file, not the command line (visible in `ps`).
  esc() { printf '%s' "$1" | sed 's/[\\"]/\\&/g'; }
  printf 'user = "%s:%s"\n' "$(esc "$ALERT_SMTP_USER")" "$(esc "$ALERT_SMTP_PASSWORD")" >"$cfg"
  subject=${title//[$'\r\n']/ }
  body=${message//$'\n'/$'\r\n'}
  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n' \
    "$from" "$ALERT_EMAIL" "$subject" "$(date -R)" "$body" |
    "$CURL" -sS -m 30 --ssl-reqd -K "$cfg" --mail-from "$from" --mail-rcpt "$ALERT_EMAIL" \
      -T - "$ALERT_SMTP_URL" >/dev/null
}

if [ -n "${ALERT_EMAIL:-}" ]; then
  if [ -z "${ALERT_SMTP_URL:-}" ] || [ -z "${ALERT_SMTP_USER:-}" ] || [ -z "${ALERT_SMTP_PASSWORD:-}" ]; then
    echo "notify: ALERT_EMAIL needs ALERT_SMTP_URL, ALERT_SMTP_USER and ALERT_SMTP_PASSWORD in env/alerts.env; alert not emailed" >&2
  else
    send_email || echo "notify: email FAILED" >&2
  fi
fi
exit 0
