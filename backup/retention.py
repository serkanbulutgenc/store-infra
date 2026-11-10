#!/usr/bin/env python3
"""Retention and restore-chain selection for off-site backup object names.

Names carry a UTC date: db-YYYY-MM-DD.sql.gz.age, media-YYYY-MM-DD-full.tar.age,
media-YYYY-MM-DD-incr.tar.age.

  retention.py prune [--today YYYY-MM-DD] < names   print names to delete
  retention.py chain [--upto YYYY-MM-DD]  < names   print media names to restore, in order

Policy: keep the newest 14 daily backups, the newest of each of the last 8 ISO weeks (media fulls: weekly and monthly only) and
the newest of each of the last 6 months. Media incrementals are kept for 14 days; the
full each kept incremental builds on is always kept.
"""
import re
import sys
from datetime import date, timedelta

DAILY, WEEKLY, MONTHLY = 14, 8, 6
PATTERN = re.compile(r"(\d{4}-\d{2}-\d{2})")


def when(name):
    m = PATTERN.search(name)
    return date.fromisoformat(m.group(1)) if m else None


def policy_keep(items, daily=DAILY):
    """items: [(date, name)] -> set of names kept by the daily/weekly/monthly rule."""
    items = sorted(items, reverse=True)
    keep = {n for _, n in items[:daily]}
    for key, limit in ((lambda d: d.isocalendar()[:2], WEEKLY), (lambda d: (d.year, d.month), MONTHLY)):
        seen = []
        for d, n in items:
            k = key(d)
            if k not in seen:
                seen.append(k)
                if len(seen) <= limit:
                    keep.add(n)
    return keep


def prune(names, today):
    dated = [(when(n), n) for n in names if when(n)]  # unknown names are never deleted
    db = [(d, n) for d, n in dated if n.startswith("db-")]
    fulls = [(d, n) for d, n in dated if n.startswith("media-") and "-full" in n]
    incrs = [(d, n) for d, n in dated if n.startswith("media-") and "-incr" in n]
    keep = policy_keep(db) | policy_keep(fulls, daily=0)
    recent = [(d, n) for d, n in incrs if (today - d).days < DAILY]
    keep |= {n for _, n in recent}
    for d, _ in recent:  # the base full of every kept incremental
        bases = [fd for fd, _ in fulls if fd <= d]
        if bases:
            keep |= {n for fd, n in fulls if fd == max(bases)}
    return sorted(n for _, n in dated if n not in keep)


def chain(names, upto):
    dated = sorted((when(n), n) for n in names if when(n) and n.startswith("media-") and when(n) <= upto)
    fulls = [(d, n) for d, n in dated if "-full" in n]
    if not fulls:
        return []
    base = fulls[-1]
    return [base[1]] + [n for d, n in dated if "-incr" in n and d >= base[0]]


def main(argv):
    mode, opts = argv[0], dict(zip(argv[1::2], argv[2::2]))
    names = [line.strip() for line in sys.stdin if line.strip()]
    if mode == "prune":
        today = date.fromisoformat(opts["--today"]) if "--today" in opts else date.today()
        out = prune(names, today)
    elif mode == "chain":
        out = chain(names, date.fromisoformat(opts["--upto"]) if "--upto" in opts else date.max)
    else:
        sys.exit(__doc__)
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1:])
