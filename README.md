# store-infra

Compose stack, Caddy config, env templates and runbook for the Aura Tekstil store. The apps live in `store-backend` and `store-frontend`.

| Service | Role | Network |
| --- | --- | --- |
| `caddy` | only public service: TLS, `/media/*` from a shared volume, maintenance page | edge |
| `web` | TanStack Start server (storefront and `/admin`), proxies `/api/**` to `api` | edge, app |
| `api` | Django + gunicorn on :5000 | app, data |
| `worker`, `beat` | Celery, same image as `api` | app, data |
| `postgres`, `redis` | data stores, not reachable from the host | data (internal) |

## Local

```sh
docker compose up                 # placeholder app images; Caddy on http://localhost:8080
docker compose stop web           # http://localhost:8080 now serves the 503 maintenance page
```

The bare command also loads `compose.override.yaml`, which swaps the apps for a placeholder image and Caddy to plain HTTP. Production never loads it.

## Local with the real apps

Builds from `../store-backend` and `../../Web/store-frontend` (change `BACKEND_DIR` / `FRONTEND_DIR` in `.env` if yours differ):

```sh
scripts/init-env.sh               # creates env/*.env (mode 600); fill in the blanks
docker compose -f compose.yaml -f compose.dev.yaml up --build
docker compose -f compose.yaml -f compose.dev.yaml exec api python manage.py migrate   # first start, and after pulling new migrations
```

The api's `/start` does not migrate (only `scripts/deploy.sh` does), so a fresh database stays empty until you run `migrate`; until then `beat` crash-loops and the API returns 500s. Postgres only reads `POSTGRES_PASSWORD` when it first creates the volume: if you regenerate `env/postgres.env` afterwards, the services fail with "password authentication failed", so reset the dev database with `docker compose -f compose.yaml -f compose.dev.yaml down -v` (this deletes its data).

Emails go to Mailpit at http://localhost:8025. The dev overlay sets `DJANGO_DEV_STACK=True`, `OWNER_MFA_REQUIRED=False` and `EMAIL_USE_TLS=False`; production refuses to start with either of the last two unless `DJANGO_DEV_STACK=True` is set, so never copy them into a server's `env/django.env`. `assign_owner` makes your account an Owner (`docker compose ... exec api python manage.py assign_owner you@example.com`).

## Production

```sh
cp .env.example .env              # SITE_ADDRESS, API_IMAGE, WEB_IMAGE
scripts/init-env.sh
docker compose -f compose.yaml up -d
```

## Deploy

`scripts/deploy.sh <tag>` pulls, migrates and restarts; `scripts/deploy.sh --rollback` returns to the previous tags. `scripts/server-baseline.sh` hardens a new VPS and `scripts/check-ports.sh <host>` verifies only 22, 80 and 443 are open. See `docs/runbook.md`.

## Backups

`scripts/backup.sh` writes encrypted nightly backups of Postgres and the media volume to an off-site rclone remote; `scripts/backup-check.sh` alerts when none succeeded in 26 hours; `scripts/restore.sh` rebuilds a scratch stack from them for the monthly drill. Setup, key handling and the drill log are in `docs/runbook.md`.

## Monitoring

Backend errors go to Sentry (scrubbed), logs are JSON with rotation, `scripts/alerts-check.sh` (timer, every 15 minutes) pushes disk, failed-email and backup-age alerts through ntfy, and an external service watches the storefront and `/api/health`. Setup and acceptance checks: `docs/runbook.md`.

## Checks

`scripts/check.sh` runs the deploy-script and backup/restore tests (fake docker), validates both Compose configurations, asserts only `caddy` publishes ports, and validates the Caddyfile (the last step needs a Docker daemon).

## End-to-end smoke tests

Playwright tests in `e2e/` run against the real stack (both app images built from the sibling checkouts). The CI job `.github/workflows/e2e.yml` runs on pull requests: it builds the images, runs `up --wait`, asserts every service is up, runs the tests, asserts again, and dumps logs plus the Playwright report on failure.

Locally, with the dev stack already up (`docker compose -f compose.yaml -f compose.dev.yaml up -d --wait`):

```sh
scripts/assert-stack-up.sh        # fails if any service is down or unhealthy
cd e2e && pnpm install && pnpm exec playwright install chromium
pnpm test                         # E2E_BASE_URL defaults to http://localhost:8080
```

`e2e/tests/checkout.spec.ts` is the guest cash-on-delivery journey: it seeds a product and a Staff user through the api container's Django shell (`e2e/support/seed.ts`), browses, fills the basket, places the order and finds it in the Dashboard. The full page load of `/sepet` after adding to the basket checks that the Start server forwards the guest's session cookie to Django (the SSR cookie hop); if that breaks the basket is empty and the test fails. It also sets the shop-wide COD and shipping fees, so use a throwaway stack; it leaves its seeded product and Staff user behind (names are unique per run).

`e2e/tests/admin-product.spec.ts` checks the product editor tabs (Staff do not see cost price or Supplier, unsaved edits survive tab switches and save in one request, the old photos URL lands on the Fotoğraflar tab).

`e2e/tests/admin-settings.spec.ts` checks the tabbed Settings form (one PATCH for edits in two tabs; an invalid field in a hidden tab marks it and blocks the save). Specs log in once and reuse the session (`e2e/support/auth.ts`) because the login endpoint allows 10 a minute per IP.

`e2e/tests/admin-shell.spec.ts` logs in as a seeded Staff user (`seedStaff`, which leaves shop settings alone) and checks the Dashboard shell: grouped sidebar, Owner-only items hidden, collapse persisted across a reload, keyboard use, breadcrumbs, user menu, sign-out and the phone menu.

`e2e/tests/campaign-flow.spec.ts` runs a Campaign from the Dashboard to the order: a 20% Campaign is created on the seeded Category (by Staff with `manage_campaigns` granted, standing in for the Owner, who needs TOTP), the listing and product page show the Campaign price, the struck Shelf price and the badge, a guest checkout charges the Campaign price (a second order with a Voucher on top), the Order screen shows the Campaign, and deactivating it restores the Shelf price. `e2e/tests/campaign-staff.spec.ts` checks plain Staff have no Campaign menu entry, are redirected from the screen and get 403 from the API.

`e2e/tests/similar-products.spec.ts` seeds one Category (the current Product, one of its Brand, two others, a sold-out and a draft Product) and checks the "Benzer ürünler" rail: the same Brand ranks first, the page's own Product, the sold-out and the draft one are left out, the rail sits below the tabs, its links are in the server's HTML, the quick view shows no such block, and a Product with nothing similar has no block. `e2e/tests/recently-viewed.spec.ts` checks "Son baktıklarınız": no rail without history, three viewed Products most recent first above "Yeni gelenler" on the homepage, the product page's rail leaving out its own Product and sitting below "Benzer ürünler", "Temizle", sign-out clearing the list, and a sold-out Product dropping out. Each test starts in a fresh browser context, since the list lives in the browser.

`e2e/tests/stock-alerts.spec.ts` runs Stock alerts end to end on one Product with a sold-out Size (M) and an in-stock one (L): with the Store setting off there is no "Haber ver"; a Staff user holding `manage_settings` (standing in for the Owner, who needs TOTP) turns it on in the Settings tab "Stok bildirimi"; the unticked consent box blocks the form; two guests subscribe and confirm from the Mailpit link (`e2e/support/mail.ts`, `E2E_MAILPIT_URL`, default http://localhost:8025); the stock grid shows "2 bekliyor"; one guest's reject link (signed, so the test builds it as the link in an earlier alert would be) takes it to 1; a Staff restock in the grid sends one alert to the guest still waiting and none to the other, and the count clears. The Staff session runs in its own browser context so the guests are not signed-in Shoppers (a signed-in Shopper gets no email field). The spec turns the shop-wide setting off again afterwards.

`e2e/tests/admin-reports.spec.ts` checks Raporlar as a real Owner (the dev stack has `OWNER_MFA_REQUIRED=False`, so no TOTP). `seedReportsShop` places a known set of orders through the storefront API (COD and bank transfer, one cancelled, one with a Voucher, one delivered with part of it returned and received) and backdates them into a random 7-day window of its own in 2000 to 2019, so other specs' orders and earlier runs never fall in it and the figures are exact; the screen opens on that custom range. The spec checks the Sales cards (4 orders, 8 items, ₺1.180,00, the fees apart, read from the fee rows saved with each order), the Products ranking, the Returns rate (40% of 5 shipped units, "Beden uymadı") and the Voucher row, that a Staff user has no menu entry, is redirected and gets 403 from the API, and that the Sales CSV has the expected rows and an "Dışa aktarım" entry appears in the Audit log. Like the checkout spec it changes the shop-wide cash-on-delivery fee, so use a throwaway stack.

`e2e/tests/storefront-product-page.spec.ts` covers the product page and the listing card: a one-size product adds with one click, a multi-size one asks for a size, the thumbnail column (desktop and phone), the tabs, a colour switch (`seedColourProduct`: photos, sizes and stock label follow the colour, a size the new colour lacks is dropped, a sold-out size turns the button into "Tükendi") and the card's bag button (a one-size product is added at once; a multi-size one opens the size strip, "Kapat" closes it without adding, a chip adds that size).

`e2e/tests/admin-import-description.spec.ts` runs the catalogue import as a real Owner on a file that changes only a Product's Description (store-infra#100): the first file creates the Product, the second previews as "1 değişen ürün" with every variant unchanged and can be confirmed (the preview saves nothing; the Description is read back from the database), the same file again is blocked as "değişecek bir şey yok", and an empty Description cell never clears the stored one.

`e2e/tests/storefront-infinite-scroll.spec.ts` seeds a 30-product category and checks the listing: scrolling loads the second page and ends with a message, the load-more control is a `rel="next"` link, a deep `?page=2` renders both pages, sorting resets the page, and Back from a product returns to the loaded list.

`e2e/tests/admin-size-guide.spec.ts` covers the Size guide and the Fit note from the Dashboard to the Storefront: a class guide and a Fit note written by Staff show as the "Beden tablosu" link, the note and the dialog (the note is in the page HTML, the guide text is not); a Product's own guide replaces the class guide and removing it restores it; a One-size Product shows no link. It seeds Product classes of its own, so no other spec's product gets a guide.

The Voucher specs (`e2e/tests/vouchers-*.spec.ts`) cover the whole feature against the real stack. An Owner needs TOTP, so a Staff user with `manage_vouchers` (and `record_refunds` for refunds) granted directly stands in for the Owner; Staff without it are checked as Staff. `vouchers-dashboard` is the Owner journey (create in the Dashboard, a Guest uses it, the order and list show it, Staff have no Voucher area but see it on an order); `vouchers-checkout` is a signed-in Customer; `vouchers-checkout-page` applies a code on the checkout page itself (the field sits inside the checkout form: no reload, no order placed by Enter); `vouchers-limits` covers expiry, minimum, cap, once per Customer (account and Guest email) and a code another Shopper used up after it was applied; `vouchers-lifecycle` cancels an order as Staff and as the Shopper and checks the use comes back; `vouchers-returns` returns one of two items bought with a Voucher and checks the refund is offered at what the Shopper paid, net of it. The checkout is limited to 10 placements per 10 minutes per address, which one suite run exceeds, so these specs call `resetCheckoutRateLimit()` first; use a throwaway stack. `vouchers-pagination` seeds 12 Vouchers and checks the list is paged newest first (page in the URL, kept on reload, status filter back to page 1).

To reuse the harness for a new test, add a spec under `e2e/tests/`. `e2e/support/stack.ts` has helpers for running commands in service containers (`execInService`) and for reading endpoints Caddy does not publish (`getFromApiContainer`).

CI notes: `scripts/ci-env.sh` writes throwaway env files with random secrets. The workflow checks out `store-backend` and `store-frontend` from the same owner; for private repos add a `CHECKOUT_TOKEN` secret with read access.
