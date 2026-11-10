import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import retention as r

TODAY = date(2026, 11, 10)


def db(d):
    return f"db-{d.isoformat()}.sql.gz.age"


class Prune(unittest.TestCase):
    def test_keeps_14_daily_8_weekly_6_monthly(self):
        names = [db(TODAY - timedelta(days=i)) for i in range(400)]
        kept = set(names) - set(r.prune(names, TODAY))
        self.assertTrue({db(TODAY - timedelta(days=i)) for i in range(14)} <= kept)
        self.assertLessEqual(len(kept), 14 + 8 + 6)
        dates = [r.when(n) for n in kept]
        self.assertEqual(len({d.isocalendar()[:2] for d in dates if (TODAY - d).days < 8 * 7}), 8)
        self.assertGreaterEqual(len({(d.year, d.month) for d in dates}), 6)

    def test_old_backups_are_deleted(self):
        self.assertIn(db(TODAY - timedelta(days=399)), r.prune([db(TODAY - timedelta(days=i)) for i in range(400)], TODAY))

    def test_few_backups_all_kept_and_unknown_names_ignored(self):
        names = [db(TODAY), "notes.txt"]
        self.assertEqual(r.prune(names, TODAY), [])

    def test_media_incrementals_keep_their_base_full(self):
        names = [f"media-{TODAY - timedelta(days=i)}-{'full' if (TODAY - timedelta(days=i)).weekday() == 6 else 'incr'}.tar.age"
                 for i in range(60)]
        kept = set(names) - set(r.prune(names, TODAY))
        for n in names:
            if "incr" in n and (TODAY - r.when(n)).days < 14:
                self.assertIn(n, kept)
        self.assertIn("media-2026-11-08-full.tar.age", kept)  # base of the newest incrementals
        self.assertIn("media-2026-10-25-full.tar.age", kept)  # base of incrementals 14 days back
        self.assertNotIn("media-2026-10-02-incr.tar.age", kept)


class Chain(unittest.TestCase):
    names = ["media-2026-11-01-full.tar.age", "media-2026-11-02-incr.tar.age", "media-2026-11-08-full.tar.age",
             "media-2026-11-09-incr.tar.age", "media-2026-11-10-incr.tar.age", "db-2026-11-10.sql.gz.age"]

    def test_latest_full_then_later_incrementals(self):
        self.assertEqual(r.chain(self.names, date.max), [self.names[2], self.names[3], self.names[4]])

    def test_upto_picks_an_earlier_chain(self):
        self.assertEqual(r.chain(self.names, date(2026, 11, 5)), [self.names[0], self.names[1]])

    def test_no_full_means_empty(self):
        self.assertEqual(r.chain(["media-2026-11-02-incr.tar.age"], date.max), [])


if __name__ == "__main__":
    unittest.main()
