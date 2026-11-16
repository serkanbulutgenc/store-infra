import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { resetCheckoutRateLimit, type Seed, seedShop, seedStaff, seedVoucher } from "../support/seed";
import { applyVoucher, checkoutAndPlace } from "../support/storefront";

// A return refunds what the Shopper actually paid for the returned items, net of the Voucher:
// one of two 100,00 items bought with 10% off is worth 90,00, not 100,00. Refunds are
// Owner-only, so a Staff user with `record_refunds` granted directly stands in.
test.describe.configure({ mode: "serial" });

const NET_REFUND = "90.00";

let seed: Seed;
let staffState: Awaited<ReturnType<typeof loginState>>;
let code = "";
let orderNumber = "";
let trackingHref = "";

test.beforeAll(async ({ browser, baseURL }) => {
  resetCheckoutRateLimit();
  seed = seedShop();
  code = seedVoucher({ suffix: "RT" }); // 10%, no limits
  staffState = await loginState(browser, baseURL, seedStaff(["record_refunds"]));
});

test("a Guest buys two items with the voucher", async ({ page }) => {
  // Two of the same item: the second add raises the quantity to 2 (2 x 100,00).
  for (let i = 0; i < 2; i += 1) {
    await page.goto("/ara");
    await page.getByRole("link", { name: new RegExp(seed.title) }).first().click();
    await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
    await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
  }
  await page.goto("/sepet");
  await applyVoucher(page, code);
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  await expect(page.getByText("−₺20,00")).toBeVisible(); // 10% of 200,00

  orderNumber = await checkoutAndPlace(page, `e2e.return.${Date.now().toString(36)}@example.com`);
  await expect(page.getByText("−₺20,00")).toBeVisible();
  trackingHref =
    (await page.getByRole("link", { name: "Siparişimi takip et" }).getAttribute("href")) ?? "";
  expect(trackingHref).toContain("/siparis-takip");
});

test("Staff ship it and deliver it, which records the cash on delivery", async ({ browser, baseURL }) => {
  expect(orderNumber, "the Guest's order").not.toBe("");
  const context = await browser.newContext({ baseURL, storageState: staffState });
  const page = await context.newPage();
  await page.goto(`/admin/orders/${orderNumber}`);

  await page.getByRole("button", { name: "Kargola", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kargo firması").selectOption({ index: 0 });
  await dialog.getByLabel("Takip numarası").fill("E2E123456");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  await page.getByRole("button", { name: "Teslim edildi", exact: true }).click();

  // Delivery records a cash-on-delivery order as paid in full, which a refund needs.
  await expect(page.getByText("Teslim edildi").first()).toBeVisible();
  await expect(page.getByText("Ödendi", { exact: true }).first()).toBeVisible();
  await context.close();
});

test("the Shopper asks to return one of the two items", async ({ browser, baseURL }) => {
  expect(trackingHref, "the Guest's tracking link").not.toBe("");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(trackingHref);
  await expect(page.getByText("Teslim edildi").first()).toBeVisible();

  await page.getByLabel(new RegExp(seed.title)).first().check();
  await page.getByLabel(new RegExp(`${seed.title} iade adedi`)).selectOption("1");
  await page.getByRole("button", { name: "İade talebi gönder" }).click();
  await expect(page.getByText("İade talebiniz alındı.")).toBeVisible();
  await context.close();
});

test("Staff see what the Shopper paid for that item, net of the voucher", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, storageState: staffState });
  const page = await context.newPage();
  await page.goto(`/admin/orders/${orderNumber}`);

  // One of two items bought at 200,00 - 20,00: it is worth 90,00, not 100,00.
  await expect(page.getByText("Müşterinin bu ürünler için ödediği tutar: ₺90,00")).toBeVisible();
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByRole("button", { name: "Teslim alındı", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Teslim alındı", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("button", { name: "İade öde", exact: true })).toBeVisible();
  await expect(page.getByText("Müşterinin bu ürünler için ödediği tutar: ₺90,00")).toBeVisible();
  await context.close();
});

test("the refund is offered at the net amount and recorded", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: staffState });
  const page = await context.newPage();
  await page.goto(`/admin/orders/${orderNumber}`);

  await page.getByRole("button", { name: "İade öde", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Tutar")).toHaveValue(NET_REFUND);
  await dialog.getByLabel("Yöntem").selectOption("cash");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByText("İade ödendi").first()).toBeVisible();
  await context.close();
});
