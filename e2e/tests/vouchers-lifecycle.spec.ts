import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import {
  resetCheckoutRateLimit,
  type Seed,
  seedShop,
  seedStaff,
  seedVoucher,
} from "../support/seed";
import { addToBasket, applyVoucher, checkoutAndPlace } from "../support/storefront";

// What happens to a Voucher's use when its order goes away: cancelling gives the use back.
// An Owner needs TOTP, so a Staff user with `manage_vouchers` granted directly stands in.
const INVALID = "Geçersiz kupon kodu.";

let seed: Seed;
let ownerState: Awaited<ReturnType<typeof loginState>>;

test.beforeAll(async ({ browser, baseURL }) => {
  resetCheckoutRateLimit();
  seed = seedShop();
  ownerState = await loginState(browser, baseURL, seedStaff(["manage_vouchers"]));
});

const refusal = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

/** A Guest orders one item with the code applied in the cart; returns the order number. */
async function placeWithCode(page: Page, code: string, email: string) {
  await addToBasket(page, seed);
  await page.goto("/sepet");
  await applyVoucher(page, code);
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  return checkoutAndPlace(page, email);
}

/** Another Shopper tries the code on the checkout page. */
async function tryAtCheckout(page: Page, code: string) {
  await addToBasket(page, seed);
  await page.goto("/odeme");
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
  await applyVoucher(page, code);
}

test.describe("Staff cancel an order", () => {
  test.describe.configure({ mode: "serial" });
  let code = "";
  let orderNumber = "";

  test.beforeAll(() => {
    code = seedVoucher({ suffix: "ST", cap: 1 });
  });

  test("an order takes the only use, so the next Shopper is refused", async ({
    browser,
    baseURL,
    page,
  }) => {
    orderNumber = await placeWithCode(page, code, `e2e.cancel.staff.${Date.now().toString(36)}@example.com`);

    const other = await (await browser.newContext({ baseURL })).newPage();
    await tryAtCheckout(other, code);
    await expect(refusal(other, INVALID)).toBeVisible();
    await other.context().close();

    const owner = await (await browser.newContext({ baseURL, storageState: ownerState })).newPage();
    await owner.goto("/admin/vouchers");
    const row = owner.locator("tr", { hasText: code });
    await expect(row).toContainText("1 / 1");
    await expect(row).toContainText("Tükendi");
    await owner.context().close();
  });

  test("Staff cancel the order, which keeps its record of the voucher", async ({
    browser,
    baseURL,
  }) => {
    expect(orderNumber, "the previous test places the order").not.toBe("");
    const context = await browser.newContext({ baseURL, storageState: ownerState });
    const page = await context.newPage();

    await page.goto(`/admin/orders/${orderNumber}`);
    await page.getByRole("button", { name: "İptal et", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Gerekçe").fill("E2E: müşteri vazgeçti");
    await dialog.getByRole("button", { name: "Kaydet" }).click();

    await expect(page.getByText("Sipariş iptal edildi.")).toBeVisible();
    await expect(page.getByText("İptal edildi").first()).toBeVisible();
    // The order still says what it was charged: its own record, not the live voucher.
    await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
    await expect(page.getByText("−₺10,00")).toBeVisible();
    await context.close();
  });

  test("the use is back: the list counts none and the next Shopper can place an order with it", async ({
    browser,
    baseURL,
  }) => {
    const owner = await (await browser.newContext({ baseURL, storageState: ownerState })).newPage();
    await owner.goto("/admin/vouchers");
    const row = owner.locator("tr", { hasText: code });
    await expect(row).toContainText("0 / 1");
    await expect(row).toContainText("Aktif");

    const next = await (await browser.newContext({ baseURL })).newPage();
    await tryAtCheckout(next, code);
    await expect(next.getByText(`Kupon (${code})`)).toBeVisible();
    await expect(next.getByText("−₺10,00")).toBeVisible();
    await next.context().close();

    // Used again, it is spent again.
    const again = await (await browser.newContext({ baseURL })).newPage();
    await placeWithCode(again, code, `e2e.cancel.staff2.${Date.now().toString(36)}@example.com`);
    await again.context().close();
    await owner.reload();
    await expect(owner.locator("tr", { hasText: code })).toContainText("1 / 1");
    await owner.context().close();
  });
});

test("a Shopper who cancels their own order gives the use back too", async ({
  browser,
  baseURL,
  page,
}) => {
  const code = seedVoucher({ suffix: "SH", cap: 1 });
  await placeWithCode(page, code, `e2e.cancel.shopper.${Date.now().toString(36)}@example.com`);

  // From the confirmation page to the tracking page, then cancel there.
  await page.getByRole("link", { name: "Siparişimi takip et" }).click();
  await expect(page.getByRole("heading", { name: /^Sipariş AT-/ })).toBeVisible();
  await page.getByRole("button", { name: "Siparişi iptal et", exact: true }).click();
  await page.getByRole("button", { name: "Evet, siparişi iptal et" }).click();
  await expect(page.getByText("İptal edildi").first()).toBeVisible();

  const owner = await (await browser.newContext({ baseURL, storageState: ownerState })).newPage();
  await owner.goto("/admin/vouchers");
  await expect(owner.locator("tr", { hasText: code })).toContainText("0 / 1");
  await owner.context().close();

  const next = await (await browser.newContext({ baseURL })).newPage();
  await tryAtCheckout(next, code);
  await expect(next.getByText(`Kupon (${code})`)).toBeVisible();
  await next.context().close();
});
