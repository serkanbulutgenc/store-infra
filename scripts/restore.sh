#!/usr/bin/env bash
# Restore the latest (or a dated) off-site backup into a SCRATCH Compose project and check
# that it works. Never touches the live stack: project name `store-restore`, own volumes,
# Caddy on 127.0.0.1:$RESTORE_PORT (default 8081).
#
#   scripts/restore.sh AGE_IDENTITY_FILE [--date YYYY-MM-DD] [--keep]
#
# AGE_IDENTITY_FILE is the PRIVATE key kept off the VPS; copy it over for the drill and
# delete it afterwards. --keep leaves the scratch stack running for a manual look
# (remove with: docker compose -p store-restore -f compose.yaml -f backup/compose.restore.yaml down -v).
# Run on the server (or any machine with the same env/*.env and the images pulled).
# Test hooks: DOCKER, AGE, RCLONE, SKIP_HTTP=1.
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER=${DOCKER:-docker}; AGE=${AGE:-age}; RCLONE=${RCLONE:-rclone}
PROJECT=store-restore
MEDIA_IMAGE=${BACKUP_MEDIA_IMAGE:-caddy:2}
die() { echo "restore: $*" >&2; exit 1; }

identity=${1:-}; shift || true
[ -f "$identity" ] || die "usage: restore.sh AGE_IDENTITY_FILE [--date YYYY-MM-DD] [--keep]"
upto=$(date -u +%F); keep=0
while [ $# -gt 0 ]; do
  case "$1" in --date) [ $# -ge 2 ] || die "--date needs a value"; upto=$2; shift 2 ;; --keep) keep=1; shift ;; *) die "unknown argument $1" ;; esac
done
[[ "$upto" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && date -d "$upto" >/dev/null 2>&1 || die "bad --date $upto (want YYYY-MM-DD)"
[ -f env/backup.env ] && { set -a; . env/backup.env; set +a; }
[ -n "${RCLONE_REMOTE:-}" ] || die "RCLONE_REMOTE is not set (env/backup.env)"

compose() { "$DOCKER" compose -p "$PROJECT" -f compose.yaml -f backup/compose.restore.yaml "$@"; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
fetch() { "$RCLONE" cat "$RCLONE_REMOTE/$1" | "$AGE" -d -i "$identity"; } # decrypted bytes on stdout

names=$("$RCLONE" lsf "$RCLONE_REMOTE")
dump=$(grep '^db-' <<<"$names" | awk -v max="db-$upto" '$0 <= max "~"' | sort | tail -n1)
[ -n "$dump" ] || die "no database backup found on or before $upto"
mapfile -t chain < <(python3 backup/retention.py chain --upto "$upto" <<<"$names")
[ -n "${chain[0]:-}" ] || die "no media backup found on or before $upto"
echo "restore: database $dump; media ${chain[*]}"

echo "== fetch and decrypt"
fetch "$dump" | gunzip >"$work/db.sql"
[ -s "$work/db.sql" ] || die "the database dump is empty (wrong key?)"

echo "== scratch stack: data services"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d --wait postgres redis
compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$work/db.sql" >/dev/null

echo "== media"
compose up --no-start api >/dev/null   # creates the scratch project's media volume
for part in "${chain[@]}"; do
  fetch "$part" | "$DOCKER" run --rm -i -v "${PROJECT}_media:/media" --entrypoint sh "$MEDIA_IMAGE" -c 'tar -xf - -C /media'
done

echo "== scratch stack: apps"
# worker and beat are NOT started: they hold live SMTP/payment credentials and would act on restored data
compose up -d --wait api web caddy
if [ "${SKIP_HTTP:-0}" != 1 ]; then
  compose exec -T api python -c "import urllib.request as u; print('api /health', u.urlopen('http://api:5000/health', timeout=5).status)"
  code=$(curl -s -o /dev/null -w '%{http_code}' --retry 5 --retry-connrefused --retry-delay 2 "http://127.0.0.1:${RESTORE_PORT:-8081}/")
  [ "$code" = 200 ] || die "storefront through Caddy answered $code"
fi
migrations=$(compose exec -T postgres sh -c 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from django_migrations"')
files=$("$DOCKER" run --rm -v "${PROJECT}_media:/media:ro" --entrypoint sh "$MEDIA_IMAGE" -c 'find /media -type f | wc -l')
echo "restore: OK (migrations applied: $migrations, media files: $files, storefront 200)"

if [ "$keep" = 1 ]; then echo "restore: scratch stack left running at http://127.0.0.1:${RESTORE_PORT:-8081}"
else compose down -v --remove-orphans >/dev/null; echo "restore: scratch stack removed"; fi
