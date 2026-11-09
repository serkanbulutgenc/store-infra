#!/usr/bin/env bash
# Create env/*.env from the templates with mode 600. Never overwrites existing files.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
for f in env/*.env.example; do
  target="${f%.example}"
  if [ -e "$target" ]; then echo "keep   $target"; else cp "$f" "$target"; echo "create $target (fill in the blanks)"; fi
done
[ -e .env ] || { cp .env.example .env; echo "create .env"; }
chmod 600 env/*.env .env
