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
echo "${FAILED_COUNT:-0}"
F
cat >"$work/notify" <<'F'
#!/usr/bin/env bash
echo "$1 | $2" >>"$SENT"
F
cat >"$work/fake-curl" <<'F'
#!/usr/bin/env bash
echo "$*" >>"$CURL_LOG"
F
chmod +x "$work"/fake-* "$work/notify"
export DOCKER="$work/fake-docker" NOTIFY="$work/notify" SENT="$work/sent" CURL_LOG="$work/curl" ALERT_STATE_DIR="$work/alerts" BACKUP_STATE_DIR="$work/backup"
mkdir -p "$BACKUP_STATE_DIR"
cd "$work"
fail() { echo "FAIL: $*"; cat sent 2>/dev/null || true; exit 1; }
now=2000000000
echo $((now - 3600)) | tee "$BACKUP_STATE_DIR/last-success-db" >"$BACKUP_STATE_DIR/last-success-media"
run() { NOW=$1 DISK_PERCENT=${2:-50} FAILED_COUNT=${3:-0} scripts/alerts-check.sh 2>/dev/null; }
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

# notify.sh: pushes to ntfy with title/priority/email; silent success without a channel
printf 'NTFY_URL=https://ntfy.example/topic\nALERT_EMAIL=owner@example.com\n' >env/alerts.env
CURL="$work/fake-curl" scripts/notify.sh "T" "message" 5 2>/dev/null
grep -q 'Title: T' curl && grep -q 'Priority: 5' curl && grep -q 'Email: owner@example.com' curl && grep -q 'https://ntfy.example/topic' curl || fail "ntfy request wrong: $(cat curl)"
: >env/alerts.env; : >curl
CURL="$work/fake-curl" scripts/notify.sh "T" "m" 2>/dev/null || fail "no channel must not fail"
[ ! -s curl ] || fail "nothing should be sent without NTFY_URL"
echo OK
