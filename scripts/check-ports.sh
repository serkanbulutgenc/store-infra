#!/usr/bin/env bash
# From OUTSIDE the server: confirm only SSH, 80 and 443 answer.
#   scripts/check-ports.sh shop.example.com
# Uses nmap when installed (all 65535 TCP ports), else a bash scan of the ports that
# usually leak (Postgres, Redis, the app ports, Docker's API).
set -euo pipefail
host=${1:?usage: check-ports.sh <host>}
allowed="22 80 443"

if command -v nmap >/dev/null; then
  open=$(nmap -Pn -p- --open -T4 -oG - "$host" | grep -o '[0-9]*/open' | cut -d/ -f1 | sort -n | tr '\n' ' ')
else
  open=""
  for p in 21 22 23 25 80 443 2375 2376 3000 3306 5000 5432 5555 6379 8000 8080 8443 9200 27017; do
    if timeout 2 bash -c ">/dev/tcp/$host/$p" 2>/dev/null; then open="$open$p "; fi
  done
fi
open=$(echo "$open" | xargs -n1 2>/dev/null | sort -n | xargs)
echo "open on $host: ${open:-none}"
for p in $open; do
  case " $allowed " in *" $p "*) ;; *) echo "FAIL: unexpected open port $p" >&2; bad=1 ;; esac
done
[ -z "${bad:-}" ] || exit 1
echo "OK: only SSH, 80 and 443"
