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

## Phase 2 release: Legal pages, then Admin features (tickets 60-74)

Not part of the PRD list above, but each step needs evidence before the release counts as done. Plan: release 60-62 (Legal pages) on their own first, then 63-74 as one batch (63-68 admin features, 69-74 category tree and deletes). The backend must be live before the frontend: the new storefront calls endpoints the old backend does not have.

**Before each release**
- [ ] Nightly backup is fresh, or run `scripts/backup.sh` by hand; note the file name.
- [ ] Backend tests green on the commit being released; frontend `tsc`, `biome` and `vitest` green.
- [ ] `store-backend` and `store-frontend` pushed; the `publish.yml` runs finished and the `sha-` or `v*` tags exist in ghcr.
- [ ] Outside trading hours.

**Release**
- [ ] On the server: `git pull`, then `scripts/deploy.sh <tag>` with api and web on the same tag. It runs `migrate` with the new api image and rolls back on a failed health check.
- [ ] Note the tag in [decisions.md](decisions.md) and the previous tag from `.deploy/current`, in case `--rollback` is needed.
- [ ] Rollback does not undo migrations. The 63-68 migrations add tables and columns, plus data migrations that grant the new permissions to the Owner role (`staff` 0006, 0007) and backfill category profiles (`catalog` 0007). The 69-74 migrations (`staff` 0008 `restructure_categories`, 0009 `delete_catalogue`) only add a permission and grant it to the Owner. None removes anything, so the old release keeps working on the new schema for one deploy. One caveat for 69-70: the old backend assumes two category levels. Once a Category exists at depth 3 or deeper, a rollback leaves the old menu and browse code facing a tree it cannot show, so before using `--rollback` move or delete the deeper Categories. The 60-62 release is different: `shop` 0011 drops `StoreSettings.legal_versions`, so the old image cannot run after it. Take the backup first.

**After the 63-74 release, check by hand as the Owner and as Staff**
- [ ] Product classes (63): Owner can create one from an existing size scheme; Staff cannot see the screen.
- [ ] Attributes (64): a value saved on a Product shows in the product page block and as a filter.
- [ ] Variants (65): the matrix generator and the stock grid work; stock changes appear in the Audit log.
- [ ] Categories (66): reorder by drag and drop changes the storefront menu; a hidden Category's URL gives 404.
- [ ] Favorites (67): heart as a Shopper, as a guest (login, then return with the heart applied) and see the list in the account area. A Dashboard login gets 403 on the Favorites API.
- [ ] Reviews (68): after a delivered test order, a star-only rating shows at once; a text review waits in Dashboard "Yorumlar" and shows after approval; delete a test review.
- [ ] Category tree (69, 72): Dashboard Kategoriler shows one tree with expand all and collapse all; add child is off at depth 5; a depth-6 Category cannot be created.
- [ ] Move (69): as Owner, "Taşı…" blocks the Category itself, its descendants and parents that would pass depth 5; a valid move carries the subtree and lands last among its new siblings. Staff see neither "Taşı…" nor "Sil".
- [ ] Deeper categories (70): import a five-part `A > B > C > D > E` path, then import it again (no duplicates); a mid-level Category page lists the Products of its descendants; hide a depth-2 Category and depths 3-5 give 404 on the Storefront and leave the sitemap.
- [ ] Category delete (69, 73): a Category with children or Products is refused with the counts; an empty one is deleted, its URL gives 404 and its image files are gone.
- [ ] Other deletes (71, 73): Brand, Supplier, Colour, Variant and Product each delete when unreferenced and are refused with a count when referenced; the last Variant of a published Product cannot be deleted; each delete appears in the Audit log. Staff see no delete buttons and get 403 on the API.
- [ ] Drag and drop (74): as Owner, drag a Category before, after and inside another; the Storefront menu follows at once. Its own subtree and drops past depth 5 are dimmed. By keyboard: Space on the handle, arrows, Space to drop. As Staff, reordering works and a drop that changes the parent does nothing.
- [ ] Category menu: on desktop, hovering a top-level Category opens a panel of its sub-categories as thumbnail cards with their children listed beneath; a Category without an image shows a plain tile; one without children is a plain link. On a phone, the hamburger opens a drawer that drills down and back. A hidden Category and a Category whose image is still processing show no thumbnail. The backend must be live first: the menu reads `image_url` from `/api/store/categories?depth=3`.
- [ ] Error tracking (Bugsink) shows no new errors for 30 minutes after the release.

**Open items these features add to the PRD list**
- Item 4b (personal-data retention): decide it together with the Reviews and Favorites rules. Both are deleted when an account is deleted (ADR 0004).
- Item 1a/1b: the privacy notice should mention that a review shows the first name and last initial publicly, and that Favorites are stored. Ask the lawyer before the Reviews release goes public.
- Item 7: the category path in the stock-load file may be up to five levels deep ([stock-load.md](stock-load.md)); missing ancestors are created on confirm. The matrix generator and bulk stock grid (65) can speed up the stock load in [stock-load.md](stock-load.md).
