import { expect, test } from "@playwright/test";
import { loginCustomerState, loginState } from "../support/auth";
import {
  resetCheckoutRateLimit,
  type Seed,
  seedCustomer,
  seedShop,
  seedStaff,
  seedVoucher,
} from "../support/seed";
import { addToBasket, applyVoucher, checkoutAndPlace } from "../support/storefront";

// A signed-in Customer uses a Voucher at checkout; the Voucher then shows on their own order
// page and the Dashboard counts one use for it.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let customer: { email: string; password: string };
let customerState: Awaited<ReturnType<typeof loginCustomerState>>;
let ownerState: Awaited<ReturnType<typeof loginState>>;
let code = "";
let orderNumber = "";

test.beforeAll(async ({ browser, baseURL }) => {
  resetCheckoutRateLimit();
  seed = seedShop();
  customer = seedCustomer();
  code = seedVoucher({ suffix: "C" });
  customerState = await loginCustomerState(browser, baseURL, customer);
  ownerState = await loginState(browser, baseURL, seedStaff(["manage_vouchers"]));
});

test("a signed-in Customer applies the voucher and places the order", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, storageState: customerState });
  const page = await context.newPage();
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await addToBasket(page, seed);
  await page.goto("/sepet");
  await applyVoucher(page, code);
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible();

  orderNumber = await checkoutAndPlace(page);
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  expect(pageErrors).toEqual([]);
  await context.close();
});

test("the order is in the Customer's own orders, with the voucher", async ({
  browser,
  baseURL,
}) => {
  expect(orderNumber, "the previous test places the order").not.toBe("");
  const context = await browser.newContext({ baseURL, storageState: customerState });
  const page = await context.newPage();

  await page.goto("/hesap/siparisler");
  await expect(page.getByRole("link", { name: new RegExp(orderNumber) })).toBeVisible();
  await page.goto(`/hesap/siparisler/${orderNumber}`);
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible();
  await context.close();
});

test("the Dashboard shows the order for that Customer and counts one use", async ({
  browser,
  baseURL,
}) => {
  expect(orderNumber, "the first test places the order").not.toBe("");
  const context = await browser.newContext({ baseURL, storageState: ownerState });
  const page = await context.newPage();

  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByText(customer.email)).toBeVisible();
  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();

  await page.goto("/admin/vouchers");
  const row = page.locator("tr", { hasText: code });
  await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible(); // no cap: just "1"
  await context.close();
});
