#!/usr/bin/env bash
# Nightly backup to the off-site rclone remote, encrypted client-side with age.
#
#   scripts/backup.sh [db|media|all]      default: all
#
# db     compressed pg_dump -> db-YYYY-MM-DD.sql.gz.age
# media  Sunday (or first run, or a stale chain): full tar -> media-DATE-full.tar.age;
#        other nights: only files changed since the last success -> media-DATE-incr.tar.age
# Then prunes the remote to 14 daily, 8 weekly and 6 monthly (backup/retention.py).
# Only the PUBLIC age key lives on this server; restoring needs the private key.
# Success is recorded in .backup/last-success-{db,media}; scripts/backup-check.sh alerts
# when either is older than 26 hours. Test hooks: DOCKER, AGE, RCLONE, NOW (epoch).
set -uo pipefail
cd "$(dirname "$0")/.."
DOCKER=${DOCKER:-docker}; AGE=${AGE:-age}; RCLONE=${RCLONE:-rclone}
STATE=${BACKUP_STATE_DIR:-.backup}
NOW=${NOW:-$(date +%s)}
DAY=$(date -u -d "@$NOW" +%F)
MEDIA_VOLUME=${BACKUP_MEDIA_VOLUME:-store_media}
MEDIA_IMAGE=${BACKUP_MEDIA_IMAGE:-caddy:2}   # any image with busybox/GNU tar and find; already pulled
die() { echo "backup: $*" >&2; exit 1; }

[ -f env/backup.env ] && { set -a; . env/backup.env; set +a; }
[ -n "${RCLONE_REMOTE:-}" ] || die "RCLONE_REMOTE is not set (env/backup.env)"
[ -n "${AGE_RECIPIENT:-}" ] || die "AGE_RECIPIENT is not set (env/backup.env)"
mkdir -p "$STATE"
# Keep a log under the state directory whatever runs us (cron, systemd, by hand); the
# journal and the terminal still get the output too.
exec > >(tee -a "$STATE/backup.log") 2>&1

COMPOSE_FILES=(-f compose.yaml)
if [ -f .env ] && grep -q '^PROXY_NETWORK=.' .env; then COMPOSE_FILES+=(-f compose.proxy.yaml); fi
compose() { "$DOCKER" compose "${COMPOSE_FILES[@]}" "$@"; }
upload() { "$AGE" -r "$AGE_RECIPIENT" | "$RCLONE" rcat "$RCLONE_REMOTE/$1"; } # stdin -> encrypted object
prune() { # prune PREFIX: delete remote objects outside the retention policy
  local old
  old=$("$RCLONE" lsf "$RCLONE_REMOTE" | grep "^$1-" | python3 backup/retention.py prune --today "$DAY") || return 1
  [ -z "$old" ] || while read -r n; do "$RCLONE" deletefile "$RCLONE_REMOTE/$n" || echo "backup: could not delete $n" >&2; done <<<"$old"
}
discard() { "$RCLONE" deletefile "$RCLONE_REMOTE/$1" 2>/dev/null || true; } # never leave a partial object that a restore would pick
verify() { # verify NAME: the object exists and is not empty
  [ "$("$RCLONE" size --json "$RCLONE_REMOTE/$1" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["bytes"])' 2>/dev/null || echo 0)" -gt 0 ]
}

backup_db() {
  local name="db-$DAY.sql.gz.age"
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip -9 | upload "$name" && verify "$name" || { discard "$name"; return 1; }
  echo "$NOW" >"$STATE/last-success-db"
  prune db || echo "backup: warning: pruning db backups failed" >&2
}

backup_media() {
  local kind=incr name since mins
  since=$(cat "$STATE/media-since" 2>/dev/null || echo 0)
  [ "$(date -u -d "@$NOW" +%u)" = 7 ] || [ "$since" = 0 ] || [ ! -f "$STATE/media-last-full" ] && kind=full
  [ -f "$STATE/media-last-full" ] && [ $((NOW - $(cat "$STATE/media-last-full"))) -gt $((8 * 86400)) ] && kind=full
  name="media-$DAY-$kind.tar.age"
  mins=$(((NOW - since) / 60 + 120))   # two hours of slack so nothing written mid-run is missed
  local script='cd /media && tar -cf - .'
  [ "$kind" = full ] || script="cd /media && { find . -type f -mmin -$mins; echo .; } | tar -cf - --no-recursion -T -"
  "$DOCKER" run --rm -v "$MEDIA_VOLUME:/media:ro" --entrypoint sh "$MEDIA_IMAGE" -c "$script" | upload "$name" && verify "$name" || { discard "$name"; return 1; }
  echo "$NOW" >"$STATE/media-since"
  [ "$kind" = full ] && echo "$NOW" >"$STATE/media-last-full"
  echo "$NOW" >"$STATE/last-success-media"
  prune media || echo "backup: warning: pruning media backups failed" >&2
}

what=${1:-all}; rc=0
case "$what" in
  db) backup_db || rc=1 ;;
  media) backup_media || rc=1 ;;
  all) backup_db || rc=1; backup_media || rc=1 ;;
  *) die "usage: backup.sh [db|media|all]" ;;
esac
[ $rc -eq 0 ] || die "FAILED ($what); last-success files not updated for the failed part"
[ "$what" = all ] && [ -n "${PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "$PING_URL" >/dev/null || true
echo "backup: ok ($what, $DAY)"
