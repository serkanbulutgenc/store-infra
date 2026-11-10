#!/usr/bin/env bash
# Exit 1 (and push through scripts/notify.sh) when the database or media backup has not
# succeeded in the last 26 hours. Run hourly by the store-backup-check systemd timer; a
# failed unit is visible in `systemctl --failed`. Test hooks: NOW (epoch), BACKUP_STATE_DIR.
set -uo pipefail
cd "$(dirname "$0")/.."
STATE=${BACKUP_STATE_DIR:-.backup}
NOW=${NOW:-$(date +%s)}
MAX=${BACKUP_MAX_AGE_HOURS:-26}
[ -f env/backup.env ] && { set -a; . env/backup.env; set +a; }
problems=()
for part in db media; do
  last=$(cat "$STATE/last-success-$part" 2>/dev/null || echo "")
  if [ -z "$last" ]; then problems+=("$part: no successful backup recorded")
  elif [ $((NOW - last)) -gt $((MAX * 3600)) ]; then problems+=("$part: last success $(((NOW - last) / 3600))h ago (limit ${MAX}h)")
  fi
done
[ ${#problems[@]} -eq 0 ] && { echo "backup-check: ok"; exit 0; }
msg="${problems[*]}"
${NOTIFY:-scripts/notify.sh} "Store: backup overdue" "$msg"
exit 1
