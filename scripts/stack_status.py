"""Read `docker compose ps --all --format json` on stdin; exit 1 if anything is down or unhealthy.

Arguments name services that must also be there and report healthy: an optional service
whose profile is off is otherwise simply absent.
"""

import json
import sys


def load(text: str) -> list[dict]:
    text = text.strip()
    if not text:
        return []
    if text.startswith("["):  # older Compose prints one JSON array
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]  # newer: one object per line


def problems(rows: list[dict], required: list[str]) -> list[str]:
    out = []
    for row in rows:
        state, health = row.get("State"), row.get("Health") or "-"
        if state != "running" or health == "unhealthy":
            out.append(f"{row.get('Service')}: state={state} health={health}")
    health_of = {row.get("Service"): row.get("Health") for row in rows}
    for name in required:
        if name not in health_of:
            out.append(f"{name}: required but not in the stack")
        elif health_of[name] != "healthy":
            out.append(f"{name}: required to be healthy, health={health_of[name] or '-'}")
    return out


if __name__ == "__main__":
    rows = load(sys.stdin.read())
    bad = problems(rows, sys.argv[1:])
    print(f"{len(rows)} services checked")
    if not rows:
        print("no services found: is the stack up?")
        sys.exit(1)
    if bad:
        print("UNHEALTHY OR DOWN:\n  " + "\n  ".join(bad))
        sys.exit(1)
