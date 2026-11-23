import { type Browser, expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { resetCheckoutRateLimit, type Seed, seedShop, seedVoucher } from "../support/seed";
import { addToBasket, applyVoucher, checkoutAndPlace } from "../support/storefront";

// A Campaign from the Dashboard to the order. The seeded product has a Shelf price of 100,00 and
// sits alone in its own Category, so a 20% Campaign on that Category prices only it at 80,00.
// The creator is Staff with `manage_campaigns` granted directly, standing in for the Owner (an
// Owner needs TOTP to log in). The tests run in order: each builds on the one before.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let voucher = "";
const campaign = `E2E Kampanya ${Date.now().toString(36)}`;

useStaffLogin(["manage_campaigns"], () => {
  resetCheckoutRateLimit();
  seed = seedShop();
  voucher = seedVoucher({ suffix: "C" }); // 10% off
});

/**
 * A Shopper's own browser, with no Dashboard login. A Dashboard user is never a Shopper (see
 * "Shopper" in store-backend's GLOSSARY.md): signed in as Staff, adding to the basket does
 * nothing, so the shopping steps cannot use the logged-in `page`.
 */
async function shopper(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR" });
  return { page: await context.newPage(), close: () => context.close() };
}

/** The listing card of the seeded product. */
const card = (page: Page) => page.getByRole("link", { name: new RegExp(seed.title) }).first();

async function openListing(page: Page) {
  await page.goto("/ara");
  await expect(card(page)).toBeVisible();
}

test("the Owner creates and activates a Campaign on a Category", async ({ page }) => {
  await page.goto("/admin/campaigns");
  await page.getByRole("link", { name: "Yeni kampanya" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/); // its own page, not a dialog
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Kampanya adı").fill(campaign);
  await page.getByLabel("İndirim yüzdesi").fill("20");
  // The Category field is an autocomplete: nothing is listed under it until it is used.
  const categories = page.getByLabel(/^Kategoriler/);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await categories.fill(seed.category);
  await expect(page.getByRole("option", { name: seed.category })).toBeVisible();
  await categories.press("Enter"); // picks the highlighted suggestion
  await expect(page.getByRole("button", { name: `${seed.category} çıkar` })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Kaydet" }).click();

  const row = page.getByRole("row", { name: new RegExp(campaign) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Aktif")).toBeVisible();
  await expect(row.getByText("%20")).toBeVisible();
});

test("the listing and the product page show the Campaign price, the struck Shelf price and the badge", async ({
  page,
}) => {
  await openListing(page);
  await expect(card(page).getByText("₺80,00")).toBeVisible();
  await expect(card(page).locator("s")).toHaveText(/₺100,00/);
  await expect(card(page).getByText("-20%")).toBeVisible();

  await card(page).click();
  await expect(page.getByRole("heading", { name: seed.title })).toBeVisible();
  await expect(page.getByText("₺80,00").first()).toBeVisible();
  await expect(page.locator("s").filter({ hasText: "₺100,00" }).first()).toBeVisible();
  await expect(page.getByText("-20%").first()).toBeVisible();
});

test("checkout charges the Campaign price, and the Order screen shows the Campaign", async ({
  page,
  browser,
  baseURL,
}) => {
  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await expect(guest.page.getByText("₺80,00").first()).toBeVisible();
  const number = await checkoutAndPlace(guest.page, "campaign-guest@example.com");
  await guest.close();

  await page.goto("/admin/orders");
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByText(`Kampanya: ${campaign}`)).toBeVisible();
  await expect(page.getByText(`(₺80,00)`).first()).toBeVisible(); // the frozen Campaign price
  // The Owner's Campaign name opens that Campaign on its own admin page.
  await page.getByRole("link", { name: campaign }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/\d+$/);
  const id = page.url().split("/").pop();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Kampanya adı")).toHaveValue(campaign);
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\?tab=campaigns/); // back on the list
  // An old `?edit=` link lands on the same page.
  await page.goto(`/admin/campaigns?edit=${id}`);
  await expect(page).toHaveURL(/\/admin\/campaigns\/\d+$/);
});

test("a Voucher comes off the Campaign price", async ({ page, browser, baseURL }) => {
  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await applyVoucher(guest.page, voucher);
  await expect(guest.page.getByText(`Kupon (${voucher})`)).toBeVisible();
  await expect(guest.page.getByText("−₺8,00")).toBeVisible(); // 10% of 80,00, not of 100,00
  const number = await checkoutAndPlace(guest.page, "campaign-voucher@example.com");
  await guest.close();

  await page.goto("/admin/orders");
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByText(`Kampanya: ${campaign}`)).toBeVisible();
  await expect(page.getByText(`Kupon (${voucher})`)).toBeVisible();
  await expect(page.getByText("−₺8,00")).toBeVisible();
});

test("deactivating the Campaign puts the Shelf price back", async ({ page }) => {
  await page.goto("/admin/campaigns");
  const row = page.getByRole("row", { name: new RegExp(campaign) });
  await row.getByRole("button", { name: "Kapat" }).click();
  await expect(page.getByText("Kampanya kapatıldı.")).toBeVisible();
  await expect(row.getByText("Kapalı")).toBeVisible();

  await openListing(page);
  await expect(card(page).getByText("₺100,00")).toBeVisible();
  await expect(card(page).getByText("-20%")).toHaveCount(0);
  await expect(card(page).locator("s")).toHaveCount(0);
});
