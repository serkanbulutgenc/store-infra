# Launch checklist (ticket 37)

Source: PRD section 8. Walk the Owner through every item. Tick only when the evidence exists. Record decisions in [decisions.md](decisions.md).

Go-live is blocked until every box is ticked and one restore drill is logged in [restore-drill-log.md](restore-drill-log.md).

| # | Item | Done (date) | Completed by | Evidence / link |
|---|------|-------------|--------------|-----------------|
| 1a | Lawyer-approved text loaded for every Legal page; versions bumped | | | |
| 1b | Pre-information form, withdrawal and hygiene wording, privacy notice approved and loaded | | | |
| 1c | Lawyer mapped each checkout field to a lawful basis | | | |
| 1d | Lawyer confirmed bank-transfer refund handling and the 30-day clock for unpaid transfers | | | |
| 2a | ETBIS registration | | | |
| 2b | VERBIS exemption confirmed | | | |
| 2c | IYS registration (before the first marketing send) | | | |
| 2d | Transfer-abroad review: VPS, email vendor, error-tracking vendor | | | |
| 3a | Accountant: tax regime and e-Arsiv status | | | |
| 3b | Accountant: method (portal or integrator) and monthly volume | | | |
| 3c | Accountant: buyer ID placeholder for individuals | | | |
| 3d | Accountant: portal login method | | | |
| 3e | Accountant: cash-register treatment of COD | | | |
| 3f | Accountant: KDV rate on shipping and COD fees | | | |
| 3g | Accountant: KDV class per accessory category | | | |
| 3h | Accountant: retention beyond 5 years | | | |
| 4a | Return-carrier agreement signed; carrier named in the pre-information | 2026-11-12 | Owner (Serkan) | Aras Kargo; see [returns-review.md](returns-review.md) |
| 4b | Retention period for personal data decided | | | |
| 4c | Real carrier prices and desi values loaded; no dummy values left (see [rates-load.md](rates-load.md), ticket 53) | | | |
| 5a | Email vendor chosen | | | |
| 5b | SPF, DKIM, DMARC set on the shop domain (see runbook) | | | |
| 5c | DNS owned by the Owner | | | |
| 5d | Sitemap submitted in Google Search Console | | | |
| 6a | One successful restore drill logged | | | |
| 6b | Owner confirmed the 24-hour loss window | | | |
| 7 | Existing shop stock loaded into the Dashboard (see [stock-load.md](stock-load.md)) | | | |

## Blockers to clear first

Tickets 32 to 36 are closed (33 and 35 on 2026-11-11). What still gates go-live is the checklist above, including the logged restore drill.
