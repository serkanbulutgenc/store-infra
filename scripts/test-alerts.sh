#!/usr/bin/env bash
# alerts-check.sh and notify.sh with a fake docker and a recording NOTIFY. No daemon.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/env"
cp "$here"/scripts/{alerts-check,backup-check,notify}.sh "$work/scripts/"
touch "$work/compose.yaml"
cat >"$work/fake-docker" <<'F'
#!/usr/bin/env bash
[ -n "${DOCKER_DOWN:-}" ] && exit 1
# the probes must not inherit the caller's stdin (a terminal would stop docker exec under timeout)
[ "$(readlink /proc/$$/fd/0)" = /dev/null ] || { case "$*" in *"exec -T"*|*"ps --status"*) echo "probe inherited stdin" >&2; exit 97 ;; esac; }
failing() { case ",${PROBE_FAIL:-}," in *",$1,"*) return 0 ;; esac; return 1; }
case "$*" in
  *"exec -T api python -c"*) failing api && exit 1; exit 0 ;;
  *"exec -T web wget"*) failing web && exit 1; exit 0 ;;
  *"ps --status running --services"*) printf 'api\nweb\n'; failing caddy || echo caddy; exit 0 ;;
esac
echo "${FAILED_COUNT:-0}"
F
cat >"$work/notify" <<'F'
#!/usr/bin/env bash
echo "$1 | $2" >>"$SENT"
F
cat >"$work/fake-curl" <<'F'
#!/usr/bin/env bash
# Logs the arguments, the contents of a -K config file and a message sent on stdin (-T -).
echo "$*" >>"$CURL_LOG"
prev=""
for a in "$@"; do [ "$prev" = "-K" ] && cat "$a" >>"$CURL_LOG.cfg"; prev=$a; done
case "$*" in *"-T -"*) cat >>"$CURL_LOG.mail" ;; esac
if [ -n "${CURL_FAIL:-}" ]; then case "$*" in *"$CURL_FAIL"*)
  printf '> AUTH PLAIN SECRETBASE64\n< 550-5.7.1 rejected for test\n< 550 5.7.1 second line\ncurl: (55) DATA failed: 550\n' >&2
  exit 55 ;; esac; fi
F
chmod +x "$work"/fake-* "$work/notify"
export DOCKER="$work/fake-docker" NOTIFY="$work/notify" SENT="$work/sent" CURL_LOG="$work/curl" ALERT_STATE_DIR="$work/alerts" BACKUP_STATE_DIR="$work/backup"
mkdir -p "$BACKUP_STATE_DIR"
cd "$work"
fail() { echo "FAIL: $*"; cat sent 2>/dev/null || true; exit 1; }
now=2000000000
echo $((now - 3600)) | tee "$BACKUP_STATE_DIR/last-success-db" >"$BACKUP_STATE_DIR/last-success-media"
export PROBE_TRIES=1 PROBE_RETRY_SECONDS=0
run() { printf x | NOW=$1 DISK_PERCENT=${2:-50} FAILED_COUNT=${3:-0} scripts/alerts-check.sh 2>/dev/null; }
count() { grep -c "$1" sent 2>/dev/null || true; }

run $now || fail "healthy system must pass"
[ ! -e sent ] || fail "healthy system must not alert"

run $now 85 || true; [ "$(count 'disk 85%')" = 1 ] || fail "disk over 80% must alert"
run $((now + 900)) 85 || true; [ "$(count 'disk 85%')" = 1 ] || fail "disk alert must not repeat within 6h"
run $((now + 22000)) 85 || true; [ "$(count 'disk 85%')" = 2 ] || fail "disk alert must repeat after 6h"
run $((now + 30000)) 80 || fail "80% exactly is fine"

run $now 50 2 || true; [ "$(count 'emails failed')" = 1 ] || fail "new failed emails must alert"
run $now 50 2 || fail "same failed count must not alert again"
[ "$(count 'emails failed')" = 1 ] || fail "failed emails alerted twice"
run $now 50 3 || true; [ "$(count 'emails failed')" = 2 ] || fail "a further failure must alert"

if DOCKER_DOWN=1 run $now; then fail "unreadable outbox must be flagged"; fi
[ "$(count 'cannot read')" = 1 ] || fail "outbox probe failure not alerted"

echo $((now - 27 * 3600)) >"$BACKUP_STATE_DIR/last-success-db"
run $now 50 3 || true; [ "$(count 'backup overdue')" = 1 ] || fail "old backup must alert"
run $((now + 900)) 50 3 || true; [ "$(count 'backup overdue')" = 1 ] || fail "backup alert repeated early"

# stack health: a lasting failure alerts, repeats hourly, and recovery is announced once
rm -f "$ALERT_STATE_DIR/sent-down"; : >sent; echo $((now - 3600)) | tee "$BACKUP_STATE_DIR/last-success-db" >"$BACKUP_STATE_DIR/last-success-media"
if PROBE_FAIL=api run $now; then fail "api down must fail the run"; fi
[ "$(count 'Store: DOWN | .*: api\.')" = 1 ] || fail "api down must alert once: $(cat sent)"
PROBE_FAIL=api run $((now + 900)) || true; [ "$(count 'Store: DOWN')" = 1 ] || fail "down alert must not repeat within 1h"
PROBE_FAIL=api run $((now + 3700)) || true; [ "$(count 'Store: DOWN')" = 2 ] || fail "down alert must repeat after 1h"
PROBE_FAIL=web,caddy run $((now + 7400)) || true; grep -q 'storefront (web), caddy' sent || fail "web and caddy failures must be named: $(cat sent)"
run $((now + 8300)) || fail "recovered system must pass"
[ "$(count 'Store: back up')" = 1 ] || fail "recovery must be announced once"
run $((now + 9200)) || fail "healthy again"; [ "$(count 'Store: back up')" = 1 ] || fail "recovery announced twice"
PROBE_FAIL=api run $((now + 10100)) || true; [ "$(count 'Store: DOWN')" = 4 ] || fail "a new outage must alert again"
rm -f "$ALERT_STATE_DIR/sent-down"

# heartbeat: pinged only while healthy
: >curl
HEARTBEAT_URL=https://hc.example/ping CURL="$work/fake-curl" run $now || fail "healthy with heartbeat"
grep -q 'https://hc.example/ping' curl || fail "heartbeat not pinged when healthy"
: >curl
PROBE_FAIL=api HEARTBEAT_URL=https://hc.example/ping CURL="$work/fake-curl" run $((now + 20000)) || true
[ ! -s curl ] || fail "heartbeat must not be pinged while down"
: >sent

# notify.sh: ntfy push with title and priority (no Email header: ntfy.sh drops anonymous email)
cat >env/alerts.env <<'E'
NTFY_URL=https://ntfy.example/topic
ALERT_EMAIL=owner@example.com
ALERT_SMTP_URL=smtp://mail.example:587
ALERT_SMTP_USER=shop@example.com
ALERT_SMTP_PASSWORD='p"w\d'
E
rm -f curl curl.cfg curl.mail
CURL="$work/fake-curl" scripts/notify.sh "Store: DOWN" $'line one\nline two' 5 2>/dev/null
grep -q 'Title: Store: DOWN' curl && grep -q 'Priority: 5' curl && grep -q 'https://ntfy.example/topic' curl || fail "ntfy request wrong: $(cat curl)"
! grep -qi 'Email:' curl || fail "the ntfy request must not carry an Email header"
# ...and the email goes over SMTP, with credentials only in the private config file
grep -q 'smtp://mail.example:587' curl && grep -q -- '--ssl-reqd' curl && grep -q -- '--mail-rcpt owner@example.com' curl && grep -q -- '--mail-from shop@example.com' curl || fail "smtp request wrong: $(cat curl)"
! grep -qF 'w\d' curl || fail "the SMTP password must not be on the command line"
grep -qF 'user = "shop@example.com:p\"w\\d"' curl.cfg || fail "credentials not quoted in the config file: $(cat curl.cfg)"
grep -q '^Subject: Store: DOWN' curl.mail && grep -q '^To: owner@example.com' curl.mail && grep -q 'line two' curl.mail || fail "mail content wrong: $(cat curl.mail)"
# a failed channel is reported, does not stop the other one, and never fails the caller
rm -f curl curl.cfg curl.mail
CURL_FAIL=ntfy CURL="$work/fake-curl" scripts/notify.sh "T" "m" 2>err || fail "a failed push must not fail the caller"
grep -q 'push to ntfy FAILED' err && [ -s curl.mail ] || fail "email must still be sent when the push fails"
rm -f curl curl.cfg curl.mail
CURL_FAIL=smtp CURL="$work/fake-curl" scripts/notify.sh "T" "m" 2>err || fail "a failed email must not fail the caller"
grep -q 'email FAILED' err && grep -q 'ntfy.example' curl || fail "push must still be sent when the email fails"
grep -q 'notify: smtp: < 550-5.7.1 rejected for test' err && grep -q 'notify: smtp: curl: (55)' err || fail "the server's refusal must be shown: $(cat err)"
! grep -q 'SECRETBASE64' err || fail "the encoded login must never be printed"
grep -q '^Message-ID: <[0-9]*\.[0-9]*@example.com>' curl.mail || fail "mail needs a Message-ID: $(cat curl.mail)"
# ALERT_EMAIL without SMTP settings: say so, send nothing by email
printf 'NTFY_URL=https://ntfy.example/topic\nALERT_EMAIL=owner@example.com\n' >env/alerts.env
rm -f curl curl.cfg curl.mail
CURL="$work/fake-curl" scripts/notify.sh "T" "m" 2>err || fail "incomplete SMTP settings must not fail"
grep -q 'needs ALERT_SMTP_URL' err && [ ! -e curl.mail ] || fail "an incomplete SMTP config must not send mail"
# no channel at all
: >env/alerts.env; rm -f curl curl.cfg curl.mail
CURL="$work/fake-curl" scripts/notify.sh "T" "m" 2>/dev/null || fail "no channel must not fail"
[ ! -e curl ] && [ ! -e curl.mail ] || fail "nothing should be sent without a channel"
echo OK
