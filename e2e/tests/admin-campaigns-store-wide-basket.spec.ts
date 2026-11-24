import { type Browser, expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { resetCheckoutRateLimit, type Seed, seedShop, seedVoucher } from "../support/seed";
import { runDjangoScript } from "../support/stack";
import { addToBasket, applyVoucher, checkoutAndPlace } from "../support/storefront";

// Store-infra #148: a whole-store Campaign, and Basket Campaigns (a minimum basket amount, then a
// TL amount off, or free shipping). The seeded product costs 100,00 and is alone in its Category.
// The creator is Staff with `manage_campaigns` granted directly, standing in for the Owner (an
// Owner needs TOTP). The tests run in order: each builds on the one before.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let voucher = "";
const run = Date.now().toString(36);
const storeWide = `E2E Tüm mağaza ${run}`;
const basket = `E2E Sepet ${run}`;

useStaffLogin(["manage_campaigns"], () => {
  resetCheckoutRateLimit();
  seed = seedShop();
  voucher = seedVoucher({ suffix: "W" }); // 10% off
});

// A Campaign left on would price every other spec's products, and a Basket Campaign would change
// every other spec's order totals, so switch ours off whatever happened.
test.afterAll(() => {
  runDjangoScript(`
from store_backend.catalog.models import BasketCampaign, Campaign

Campaign.objects.filter(name__contains=${JSON.stringify(run)}).update(is_active=False)
BasketCampaign.objects.filter(name__contains=${JSON.stringify(run)}).update(is_active=False)
print("SWITCHED OFF")
`);
});

/** A Shopper's own browser: a signed-in Dashboard user is never a Shopper. */
async function shopper(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR" });
  return { page: await context.newPage(), close: () => context.close() };
}

const card = (page: Page) => page.getByRole("link", { name: new RegExp(seed.title) }).first();

async function openBasketTab(page: Page) {
  await page.goto("/admin/campaigns");
  await page.getByRole("tab", { name: "Sepet kampanyaları" }).click();
  await expect(page.getByRole("link", { name: "Yeni sepet kampanyası" })).toBeVisible();
}

async function editBasketCampaign(page: Page) {
  await openBasketTab(page);
  await page.getByRole("link", { name: `${basket} düzenle` }).click();
  await expect(page.getByLabel("Kampanya adı")).toHaveValue(basket);
}

test("a whole-store Campaign needs no target and prices every product", async ({ page }) => {
  await page.goto("/admin/campaigns/new");
  await page.getByLabel("Kampanya adı").fill(storeWide);
  await page.getByLabel("İndirim yüzdesi").fill("25");
  // Without targets or the switch the form refuses...
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("En az bir ürün, kategori veya koleksiyon seçin.")).toBeVisible();
  // ...with the switch the pickers go away and it saves.
  await page.getByLabel(/^Tüm mağaza/).check();
  await expect(page.getByLabel(/^Kategoriler/)).toBeHidden();
  await page.getByRole("button", { name: "Kaydet" }).click();

  const row = page.getByRole("row", { name: new RegExp(storeWide) });
  await expect(row.getByText("Tüm mağaza", { exact: true })).toBeVisible();
  await expect(row.getByText("%25")).toBeVisible();

  await page.goto("/ara");
  await expect(card(page).getByText("₺75,00")).toBeVisible();
  await expect(card(page).getByText("-25%")).toBeVisible();

  // Switched off again so the other tests see the Shelf price.
  await page.goto("/admin/campaigns");
  await row.getByRole("button", { name: "Kapat" }).click();
  await expect(page.getByText("Kampanya kapatıldı.")).toBeVisible();
  await page.goto("/ara");
  await expect(card(page).getByText("₺100,00")).toBeVisible();
});

test("the Owner creates a Basket Campaign and sees what the Shopper will read", async ({
  page,
}) => {
  await openBasketTab(page);
  await page.getByRole("link", { name: "Yeni sepet kampanyası" }).click();
  await expect(page).toHaveURL(/\/admin\/basket-campaigns\/new$/);
  await page.getByLabel("Kampanya adı").fill(basket);
  await page.getByLabel("Asgari sepet tutarı (₺)").fill("100");
  await page.getByLabel("İndirim tutarı (₺)").fill("10");
  await expect(page.getByText("100 ₺ üzeri 10 ₺ indirim")).toBeVisible(); // the live preview

  // An amount as large as the minimum is refused.
  await page.getByLabel("İndirim tutarı (₺)").fill("100");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İndirim tutarı sepet tutarından küçük olmalı.")).toBeVisible();

  await page.getByLabel("İndirim tutarı (₺)").fill("10");
  await page.getByRole("button", { name: "Kaydet" }).click();

  const row = page.getByRole("row", { name: new RegExp(basket) });
  await expect(row).toBeVisible();
  await expect(row.getByText("100 ₺ üzeri 10 ₺ indirim")).toBeVisible();
  await expect(row.getByText("Aktif")).toBeVisible();
});

test("the basket and checkout show the discount, and a Voucher takes its share of what is left", async ({
  page,
  browser,
  baseURL,
}) => {
  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await expect(guest.page.getByText("100 ₺ üzeri 10 ₺ indirim")).toBeVisible();
  await expect(guest.page.getByText("−₺10,00")).toBeVisible();
  await applyVoucher(guest.page, voucher);
  await expect(guest.page.getByText(`Kupon (${voucher})`)).toBeVisible();
  await expect(guest.page.getByText("−₺9,00")).toBeVisible(); // 10% of 100 - 10, not of 100
  const number = await checkoutAndPlace(guest.page, "basket-campaign@example.com");
  // The confirmation lists the campaign before the Voucher.
  await expect(guest.page.getByText("100 ₺ üzeri 10 ₺ indirim")).toBeVisible();
  await expect(guest.page.getByText("−₺10,00")).toBeVisible();
  await guest.close();

  await page.goto("/admin/orders");
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByText("Sepet kampanyası (100 ₺ üzeri 10 ₺ indirim)")).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible();
  await expect(page.getByText(`Kupon (${voucher})`)).toBeVisible();
  await expect(page.getByText("−₺9,00")).toBeVisible();
});

test("a basket below the minimum gets nothing", async ({ page, browser, baseURL }) => {
  await editBasketCampaign(page);
  await page.getByLabel("Asgari sepet tutarı (₺)").fill("100,01");
  await page.getByLabel("İndirim tutarı (₺)").fill("10");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("row", { name: new RegExp(basket) })).toBeVisible();

  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await expect(guest.page.getByText("100,01 ₺ üzeri")).toHaveCount(0);
  await expect(guest.page.getByText("−₺10,00")).toHaveCount(0);
  await guest.close();
});

test("free shipping waives the shipping fee, and the order says why", async ({
  page,
  browser,
  baseURL,
}) => {
  await editBasketCampaign(page);
  await page.getByLabel("Asgari sepet tutarı (₺)").fill("100");
  await page.getByLabel("Ne sağlar?").selectOption({ label: "Ücretsiz kargo" });
  await expect(page.getByLabel(/^İndirim/)).toHaveCount(0); // free shipping takes no amount
  await expect(page.getByText("100 ₺ üzeri ücretsiz kargo")).toBeVisible();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(basket) }).getByText("100 ₺ üzeri ücretsiz kargo"),
  ).toBeVisible();

  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await expect(guest.page.getByText("100 ₺ üzeri ücretsiz kargo")).toBeVisible();
  await expect(guest.page.getByText("Ücretsiz kargo", { exact: true })).toBeVisible();
  const number = await checkoutAndPlace(guest.page, "free-shipping@example.com");
  await expect(guest.page.getByText("Ücretsiz", { exact: true })).toBeVisible(); // the Kargo line
  await guest.close();

  await page.goto("/admin/orders");
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByText("Sepet kampanyası (100 ₺ üzeri ücretsiz kargo)")).toBeVisible();
  await expect(page.getByText("Ücretsiz kargo", { exact: true })).toBeVisible();
});

test("a Basket Campaign an Order used can be closed but not deleted", async ({
  page,
  browser,
  baseURL,
}) => {
  await openBasketTab(page);
  await page.getByRole("button", { name: `${basket} sil` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(dialog).toContainText("siparişte kullanıldı"); // refused, with the way out
  await dialog.getByRole("button", { name: "Kapat" }).click();
  await expect(page.getByText("Sepet kampanyası kapatıldı.")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(basket) }).getByText("Kapalı")).toBeVisible();

  const guest = await shopper(browser, baseURL);
  await addToBasket(guest.page, seed);
  await guest.page.goto("/sepet");
  await expect(guest.page.getByText("ücretsiz kargo")).toHaveCount(0);
  await guest.close();
});
