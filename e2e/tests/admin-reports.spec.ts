import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginState, tab } from "../support/auth";
import { type ReportsSeed, seedReportsShop, seedStaff } from "../support/seed";

// Raporlar (GLOSSARY: Owner). One known set of orders, backdated into a window of its own (see `seedReportsShop`), read
// as the Owner on a custom range, with every expected figure worked out by hand in the comments below.
//
//   window day 1  COD cheap x2                      200.00 sale, 2 items
//   window day 2  transfer dear x1, paid            200.00 sale, 1 item   (the COD cheap x1 the same day was cancelled)
//   window day 3  COD cheap x2 with a 10% Voucher   180.00 sale, 2 items, 20.00 off
//   window day 4  COD dear x5, 2 sent back          1000.00 - 2 x 200.00 = 600.00, 3 items (wrong size, received)
//   => 4 orders, 8 items, 1180.00, average 295.00; cheap 4 units 380.00, dear 4 units 800.00; dear and size M shipped 5,
//      2 returned: 40%.
// The Owner is a real Owner: the dev stack has OWNER_MFA_REQUIRED=False, so there is no TOTP step.
test.describe.configure({ mode: "serial" });

let seed: ReportsSeed;
let ownerState: Awaited<ReturnType<typeof loginState>>;
let staffState: Awaited<ReturnType<typeof loginState>>;

test.beforeAll(async ({ browser, baseURL }) => {
  seed = seedReportsShop();
  ownerState = await loginState(browser, baseURL, seed.owner);
  staffState = await loginState(browser, baseURL, seedStaff());
});

/** "225.00" as the screen shows money: "₺225,00" (the screen drops the space Intl puts after the symbol). */
const money = (amount: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(amount)).replace(/\s/g, "");

/** The Raporlar screen on the seeded window, as the Owner. */
async function openReports(browser: Parameters<Parameters<typeof test>[2]>[0]["browser"], baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR", storageState: ownerState });
  const page = await context.newPage();
  await page.goto(`/admin/reports?date_from=${seed.from}&date_to=${seed.to}`);
  await expect(page.getByRole("heading", { name: "Raporlar" })).toBeVisible();
  return { page, context };
}

const card = (page: Page, label: string) => page.locator('[data-slot="card"]').filter({ hasText: label });

test("the Owner's Sales figures match the orders: a cancel is no sale, a Voucher is netted, a return comes off", async ({
  browser,
  baseURL,
}) => {
  const { page, context } = await openReports(browser, baseURL);
  await expect(card(page, "Sipariş")).toContainText("4");
  await expect(card(page, "Ürün adedi")).toContainText("8");
  await expect(card(page, "Ciro")).toContainText("₺1.180,00");
  await expect(card(page, "Ortalama sepet")).toContainText("₺295,00");
  // Fees are charged on top and kept apart from the revenue; read from the fee rows saved with each order.
  await expect(page.getByText(`Kargo ücreti: ${money(seed.fees.shipping)}`)).toBeVisible();
  await expect(page.getByText(`Kapıda ödeme ücreti: ${money(seed.fees.cod)}`)).toBeVisible();
  // Nothing is waiting for a transfer.
  await expect(page.getByText("Ödeme bekleyen")).toHaveCount(0);
  // The chart is there, with the same figures for a screen reader.
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.locator("table.sr-only")).toContainText("₺600,00");
  await context.close();
});

test("Products ranks by revenue, Returns shows the rate and the reason, Campaigns and Vouchers shows the Voucher", async ({
  browser,
  baseURL,
}) => {
  const { page, context } = await openReports(browser, baseURL);

  await tab(page, "Ürünler").click();
  const products = page.locator("tbody tr");
  await expect(products).toHaveCount(2);
  await expect(products.nth(0)).toContainText(seed.dear);
  await expect(products.nth(0)).toContainText("₺800,00");
  await expect(products.nth(1)).toContainText(seed.cheap);
  await expect(products.nth(1)).toContainText("₺380,00");

  await tab(page, "İadeler").click();
  const byProduct = page.locator("tbody tr").filter({ hasText: seed.dear });
  await expect(byProduct).toContainText("%40 (2 / 5 adet)");
  await expect(byProduct).toContainText("Beden uymadı: 2");
  await expect(page.locator("tbody tr").filter({ hasText: /^M/ })).toContainText("%40 (2 / 5 adet)");

  await tab(page, "Kampanya ve kuponlar").click();
  const voucher = page.locator("tbody tr").filter({ hasText: seed.voucher });
  await expect(voucher).toContainText("₺180,00"); // revenue, net of the Voucher
  await expect(voucher).toContainText("₺20,00"); // the discount it gave
  await expect(page.getByText("Bu dönemde kampanya satışı yok")).toBeVisible();
  await context.close();
});

test("Staff have no menu entry, are sent away from the screen and get 403 from the API", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "tr-TR", storageState: staffState });
  const page = await context.newPage();
  await page.goto("/admin");
  // Wait for the sidebar before asserting the entry is absent, or the check proves nothing.
  await expect(page.getByRole("link", { name: "Siparişler" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Raporlar" })).toHaveCount(0);

  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/admin\/?$/);

  const response = await page.request.get(`/api/admin/reports/sales?date_from=${seed.from}&date_to=${seed.to}`);
  expect(response.status()).toBe(403);
  await context.close();
});

test("the Sales CSV downloads with the figures of the screen, and the Owner finds the export in the Audit log", async ({
  browser,
  baseURL,
}) => {
  const { page, context } = await openReports(browser, baseURL);
  await expect(card(page, "Ciro")).toContainText("₺1.180,00");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV indir" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`rapor-satis-${seed.from}-${seed.to}.csv`);
  const path = await download.path();
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  expect(lines[0]).toBe("period,orders,items,revenue,average_order");
  const day = (n: number) => {
    const d = new Date(`${seed.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  expect(lines.slice(1)).toEqual([
    `${day(0)},1,2,200.00,200.00`,
    `${day(1)},1,1,200.00,200.00`,
    `${day(2)},1,2,180.00,180.00`,
    `${day(3)},1,3,600.00,600.00`,
    `${day(4)},0,0,0.00,0.00`,
    `${day(5)},0,0,0.00,0.00`,
    `${day(6)},0,0,0.00,0.00`,
  ]);

  // The download is Audit-logged (the screen itself is not).
  await page.goto("/admin/audit-log?action=export_run");
  const entry = page.locator("tbody tr").filter({ hasText: seed.owner.email }).first();
  await expect(entry).toContainText("Dışa aktarım");
  await context.close();
});
