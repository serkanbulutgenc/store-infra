import { expect, type Page, test } from "@playwright/test";
import { loginCustomerState } from "../support/auth";
import {
  resetCheckoutRateLimit,
  type Seed,
  seedCustomer,
  seedShop,
  seedVoucher,
} from "../support/seed";
import { addToBasket, applyVoucher, checkoutAndPlace } from "../support/storefront";

// What a Shopper meets when a Voucher's limits stop it: expiry, minimum, cap, once per Customer.
// Codes are seeded with the limit under test, and every refusal is read on the checkout page,
// where the field sits inside the checkout form. A refusal never says why beyond "expired" and
// "minimum"; used up, already used, switched off and unknown all read as "invalid".
const EXPIRED = "Bu kuponun süresi dolmuş.";
const MINIMUM = "Sepet tutarı bu kupon için yeterli değil.";
const INVALID = "Geçersiz kupon kodu.";

let seed: Seed;

test.beforeAll(() => {
  resetCheckoutRateLimit();
  seed = seedShop();
});

/** Put the item in the basket and try the code on the checkout page. */
async function tryAtCheckout(page: Page, code: string) {
  await addToBasket(page, seed);
  await page.goto("/odeme");
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
  await applyVoucher(page, code);
}

const refusal = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

test("an expired code is refused as expired and takes nothing off", async ({ page }) => {
  const code = seedVoucher({ suffix: "EX", startsInDays: -60, endsInDays: -30 });
  await tryAtCheckout(page, code);

  await expect(refusal(page, EXPIRED)).toBeVisible();
  await expect(page.getByText(`Kupon (${code})`)).toHaveCount(0);
  await expect(page.getByText(/^−₺/)).toHaveCount(0);
});

test("a basket under the minimum is refused, and a code that is not there reads as invalid", async ({
  page,
}) => {
  const code = seedVoucher({ suffix: "MN", minimum: "250" }); // the basket holds one 100,00 item
  await tryAtCheckout(page, code);
  await expect(refusal(page, MINIMUM)).toBeVisible();
  await expect(page.getByText(`Kupon (${code})`)).toHaveCount(0);

  // Nothing tells a Shopper whether a code exists: an unknown one reads as plain "invalid".
  await page.getByLabel("Kupon kodu").fill("YOKBOYLEBIRKOD");
  await page.getByRole("button", { name: "Uygula" }).click();
  await expect(refusal(page, INVALID)).toBeVisible();
});

test("a used-up cap refuses the next Shopper without saying why", async ({ browser, baseURL }) => {
  const code = seedVoucher({ suffix: "CP", cap: 1 });

  const first = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(first, seed);
  await first.goto("/sepet");
  await applyVoucher(first, code);
  await expect(first.getByText(`Kupon (${code})`)).toBeVisible();
  await checkoutAndPlace(first, `e2e.cap.one.${Date.now().toString(36)}@example.com`);
  await expect(first.getByText(`Kupon (${code})`)).toBeVisible(); // it took the one use
  await first.context().close();

  const second = await (await browser.newContext({ baseURL })).newPage();
  await tryAtCheckout(second, code);
  await expect(refusal(second, INVALID)).toBeVisible();
  await expect(second.getByText(`Kupon (${code})`)).toHaveCount(0);
  await second.context().close();
});

test("a code another Shopper just used up is refused at placement, and the order can go on without it", async ({
  browser,
  baseURL,
}) => {
  const code = seedVoucher({ suffix: "LS", cap: 1 });
  const stamp = Date.now().toString(36);

  // Both hold the code in their baskets while one use is left.
  const slow = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(slow, seed);
  await slow.goto("/sepet");
  await applyVoucher(slow, code);
  await expect(slow.getByText(`Kupon (${code})`)).toBeVisible();
  await slow.getByRole("link", { name: "Ödemeye geç" }).click();
  await expect(slow.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();

  const quick = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(quick, seed);
  await quick.goto("/sepet");
  await applyVoucher(quick, code);
  await expect(quick.getByText(`Kupon (${code})`)).toBeVisible();
  await checkoutAndPlace(quick, `e2e.quick.${stamp}@example.com`);
  await quick.context().close();

  // The slow Shopper now places the order: the last use is gone.
  await slow.getByLabel("Ad soyad").fill("E2E Alıcı");
  await slow.getByLabel("E-posta", { exact: true }).fill(`e2e.slow.${stamp}@example.com`);
  await slow.getByLabel("Telefon").fill("0532 123 45 67");
  await slow.getByLabel("İl", { exact: true }).fill("İstanbul");
  await slow.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await slow.getByLabel("Mahalle", { exact: true }).fill("Caferağa");
  await slow.getByLabel("Cadde, sokak, bina ve daire no").fill("Moda Caddesi No 1 Daire 2");
  await slow.getByRole("radio", { name: /Kapıda ödeme/ }).check();
  await slow.getByLabel(/Kapıda ödeme bedeli olan/).check();
  await slow.getByLabel(/Mesafeli satış sözleşmesini/).check();
  await slow.getByRole("button", { name: /Siparişi onayla/ }).click();

  await expect(refusal(slow, INVALID)).toBeVisible();
  await expect(slow).toHaveURL(/\/odeme/); // no order was placed

  await slow.getByRole("button", { name: "Kuponsuz devam et" }).click();
  await expect(slow.getByText(`Kupon (${code})`)).toHaveCount(0);
  await slow.getByRole("button", { name: /Siparişi onayla/ }).click();
  await expect(slow).toHaveURL(/\/siparis-onayi/);
  await expect(slow.getByText(`Kupon (${code})`)).toHaveCount(0); // placed, at full price
  await slow.context().close();
});

test("a once-per-Customer code works once for a Customer, and still for another", async ({
  browser,
  baseURL,
}) => {
  const code = seedVoucher({ suffix: "OC", oncePerCustomer: true });
  const ayse = seedCustomer();
  const deniz = seedCustomer();
  const ayseState = await loginCustomerState(browser, baseURL, ayse);
  const denizState = await loginCustomerState(browser, baseURL, deniz);

  // Her first order uses it.
  const first = await (await browser.newContext({ baseURL, storageState: ayseState })).newPage();
  await addToBasket(first, seed);
  await first.goto("/sepet");
  await applyVoucher(first, code);
  await expect(first.getByText(`Kupon (${code})`)).toBeVisible();
  await checkoutAndPlace(first);
  await first.context().close();

  // Her second order is refused, on the checkout page, as a plain "invalid".
  const again = await (await browser.newContext({ baseURL, storageState: ayseState })).newPage();
  await tryAtCheckout(again, code);
  await expect(refusal(again, INVALID)).toBeVisible();
  await expect(again.getByText(`Kupon (${code})`)).toHaveCount(0);
  await again.context().close();

  // Another Customer is not affected.
  const other = await (await browser.newContext({ baseURL, storageState: denizState })).newPage();
  await tryAtCheckout(other, code);
  await expect(other.getByText(`Kupon (${code})`)).toBeVisible();
  await expect(other.getByText("−₺10,00")).toBeVisible();
  await other.context().close();
});

test("a once-per-Customer code also stops the same Guest email, whatever its case", async ({
  browser,
  baseURL,
}) => {
  const code = seedVoucher({ suffix: "GM", oncePerCustomer: true });
  const email = `e2e.same.guest.${Date.now().toString(36)}@example.com`;

  const first = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(first, seed);
  await first.goto("/sepet");
  await applyVoucher(first, code);
  await checkoutAndPlace(first, email);
  await expect(first.getByText(`Kupon (${code})`)).toBeVisible();
  await first.context().close();

  // A Guest is only known by email once the order is placed, so the code still applies in the
  // basket and the refusal comes at placement, on the same address in other capitals.
  const second = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(second, seed);
  await second.goto("/sepet");
  await applyVoucher(second, code);
  await expect(second.getByText(`Kupon (${code})`)).toBeVisible();
  await second.getByRole("link", { name: "Ödemeye geç" }).click();
  await second.getByLabel("Ad soyad").fill("E2E Alıcı");
  await second.getByLabel("E-posta", { exact: true }).fill(email.toUpperCase());
  await second.getByLabel("Telefon").fill("0532 123 45 67");
  await second.getByLabel("İl", { exact: true }).fill("İstanbul");
  await second.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await second.getByLabel("Mahalle", { exact: true }).fill("Caferağa");
  await second.getByLabel("Cadde, sokak, bina ve daire no").fill("Moda Caddesi No 1 Daire 2");
  await second.getByRole("radio", { name: /Kapıda ödeme/ }).check();
  await second.getByLabel(/Kapıda ödeme bedeli olan/).check();
  await second.getByLabel(/Mesafeli satış sözleşmesini/).check();
  await second.getByRole("button", { name: /Siparişi onayla/ }).click();
  await expect(refusal(second, INVALID)).toBeVisible();
  await expect(second).toHaveURL(/\/odeme/); // no order was placed
  await second.context().close();

  // Another address is not affected.
  const other = await (await browser.newContext({ baseURL })).newPage();
  await addToBasket(other, seed);
  await other.goto("/sepet");
  await applyVoucher(other, code);
  await checkoutAndPlace(other, `e2e.other.guest.${Date.now().toString(36)}@example.com`);
  await expect(other.getByText(`Kupon (${code})`)).toBeVisible();
  await other.context().close();
});
