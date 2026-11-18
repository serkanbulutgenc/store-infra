import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #39: the Vouchers list is paged like the other Dashboard tables, newest first,
// and the status filter narrows the pages. An Owner needs TOTP, so a Staff user with
// `manage_vouchers` granted directly stands in.
const run = Date.now().toString(36).toUpperCase();
const COUNT = 12;
const SIZE = 10;
// Created oldest first, so the list (newest first) shows the last ones on page 1.
const codes = Array.from({ length: COUNT }, (_, i) => `E2E${run}P${String(i).padStart(2, "0")}`);

test.beforeAll(() => {
  const out = runDjangoScript(`
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from store_backend.services import voucher_admin

now = timezone.now()
for code in ${JSON.stringify(codes)}:
    voucher_admin.create(
        None,
        code=code,
        kind="percentage",
        value=Decimal("10"),
        minimum=None,
        cap=None,
        once_per_customer=False,
        starts_at=now - timedelta(days=1),
        ends_at=None,
    )
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(`voucher seeding failed:\n${out}`);
});

test("the voucher list is paged, newest first, and the page lives in the URL", async ({
  browser,
  baseURL,
}) => {
  const state = await loginState(browser, baseURL, seedStaff(["manage_vouchers"]));
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`/admin/vouchers?size=${SIZE}`);
  await expect(page.getByRole("heading", { name: "Kuponlar" })).toBeVisible();

  // Page 1 holds the newest SIZE; the oldest of this run waits on page 2.
  const newest = codes.slice(-1)[0] as string;
  const oldest = codes[0] as string;
  await expect(page.getByRole("row", { name: new RegExp(newest) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(oldest) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Önceki" })).toBeDisabled();

  await page.getByRole("button", { name: "Sonraki" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("row", { name: new RegExp(oldest) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(newest) })).toHaveCount(0);

  // A reload keeps the page, since the URL is the state.
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(oldest) })).toBeVisible();

  // A status filter goes back to page 1 and counts only what it matches (none is expired).
  await page.getByLabel("Duruma göre filtrele").selectOption("expired");
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByRole("row", { name: new RegExp(oldest) })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await context.close();
});
