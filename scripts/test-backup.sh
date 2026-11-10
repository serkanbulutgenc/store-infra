#!/usr/bin/env bash
# Round trip of backup.sh -> restore.sh and the age alert, with fake docker/age/rclone
# (a local directory plays the off-site remote, "encryption" is a marker line). No daemon.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/backup" "$work/remote" "$work/env"
cp "$here"/scripts/{backup,backup-check,restore,notify}.sh "$work/scripts/"
cp "$here/backup/retention.py" "$here/backup/compose.restore.yaml" "$work/backup/"
touch "$work/compose.yaml"
printf 'RCLONE_REMOTE=%s\nAGE_RECIPIENT=age1testkey\n' "$work/remote" >"$work/env/backup.env"
echo identity >"$work/id.txt"

cat >"$work/fake-age" <<'F'
#!/usr/bin/env bash
if [ "$1" = -r ]; then { echo "AGE:$2"; cat; }; else { read -r h; [ "$h" = "AGE:age1testkey" ] || exit 1; cat; }; fi
F
cat >"$work/fake-rclone" <<'F'
#!/usr/bin/env bash
case "$1" in
  rcat) cat >"$2" ;;
  cat) cat "$2" ;;
  lsf) ls "$2" ;;
  deletefile) rm "$2" ;;
  size) printf "{\"bytes\":%s}" "$(wc -c <"$3")" ;;
esac
F
cat >"$work/fake-docker" <<'F'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_LOG"
case "$*" in
  *"exec -T postgres sh -c pg_dump"*) echo "CREATE TABLE t();" ;;
  *"run --rm -v store_media"*) echo "tar-of-media" ;;
  *"count(*)"*) echo 42 ;;
esac
case "$*" in *" -i "*) cat >/dev/null ;; esac
F
chmod +x "$work"/fake-*
export DOCKER="$work/fake-docker" AGE="$work/fake-age" RCLONE="$work/fake-rclone" FAKE_LOG="$work/log" BACKUP_STATE_DIR="$work/state"
cd "$work"
fail() { echo "FAIL: $*"; cat "$FAKE_LOG" 2>/dev/null || true; exit 1; }
day() { date -u -d "@$1" +%F; }

# 2026-11-08 is a Sunday: first run is full. Monday is incremental.
sun=$(date -u -d "2026-11-08 03:00:00 UTC" +%s); mon=$((sun + 86400))
NOW=$sun scripts/backup.sh >/dev/null
ls remote | grep -qx 'db-2026-11-08.sql.gz.age' || fail "no db object"
ls remote | grep -qx 'media-2026-11-08-full.tar.age' || fail "no full media object"
NOW=$mon scripts/backup.sh >/dev/null
ls remote | grep -qx 'media-2026-11-09-incr.tar.age' || fail "no incremental media object"
grep -q -- '-mmin' "$FAKE_LOG" || fail "incremental must select changed files"
head -n1 remote/db-2026-11-09.sql.gz.age | grep -qx 'AGE:age1testkey' || fail "db object not encrypted to the recipient"

# age alert: fresh passes, 27h old fails, missing fails
NOW=$((mon + 3600)) scripts/backup-check.sh >/dev/null || fail "fresh backup flagged"
if NOW=$((mon + 27 * 3600)) scripts/backup-check.sh 2>/dev/null; then fail "27h-old backup must alert"; fi
NOW=$((mon + 25 * 3600)) scripts/backup-check.sh >/dev/null || fail "25h must not alert"
rm "$BACKUP_STATE_DIR/last-success-media"
if NOW=$mon scripts/backup-check.sh 2>/dev/null; then fail "missing media success must alert"; fi

# a failing pg_dump fails the run and does not refresh the success marker
before=$(cat "$BACKUP_STATE_DIR/last-success-db")
sed -i 's/echo "CREATE TABLE t();"/exit 3/' fake-docker
if NOW=$((mon + 86400)) scripts/backup.sh db 2>/dev/null; then fail "failed dump must fail the run"; fi
[ "$(cat "$BACKUP_STATE_DIR/last-success-db")" = "$before" ] || fail "marker advanced on failure"
sed -i 's/exit 3/echo "CREATE TABLE t();"/' fake-docker

# restore: right key works, picks the latest full + later incrementals
SKIP_HTTP=1 scripts/restore.sh id.txt >out.txt || { cat out.txt; fail "restore failed"; }
grep -q 'database db-2026-11-09' out.txt || fail "latest dump not chosen"
grep -q 'media-2026-11-08-full.tar.age media-2026-11-09-incr.tar.age' out.txt || fail "wrong media chain"
grep -q 'restore: OK' out.txt || fail "restore did not finish"
grep -q -- '-p store-restore' "$FAKE_LOG" || fail "restore must use the scratch project"
! grep -- '-p store ' "$FAKE_LOG" || fail "restore touched the live project"
SKIP_HTTP=1 scripts/restore.sh id.txt --date 2026-11-08 >out2.txt || fail "dated restore failed"
grep -q "database db-2026-11-08" out2.txt || fail "--date ignored"
grep -q "media-2026-11-08-full.tar.age$" out2.txt || fail "--date must not use later incrementals"
if scripts/restore.sh missing.txt 2>/dev/null; then fail "identity file is required"; fi
echo OK
