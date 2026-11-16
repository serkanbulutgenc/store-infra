import { expect, test } from "@playwright/test";
import { resetCheckoutRateLimit, type Seed, seedShop, seedVoucher } from "../support/seed";
import { addToBasket } from "../support/storefront";

// The "Kupon kodu" field also sits on the checkout page, inside the checkout form's summary.
// Applying a code there must stay on the page, keep what was typed and place no order.
let seed: Seed;
let code = "";

test.beforeAll(() => {
  resetCheckoutRateLimit();
  seed = seedShop();
  code = seedVoucher({ suffix: "K" });
});

test.beforeEach(async ({ page }) => {
  await addToBasket(page, seed);
  await page.goto("/odeme"); // a full load: the server renders the page, then it hydrates
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
});

test("the Uygula button applies the code without reloading the page", async ({ page }) => {
  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });
  await page.getByLabel("Ad soyad").fill("E2E Alıcı");
  await page.getByLabel("Kupon kodu").fill(code);
  await page.getByRole("button", { name: "Uygula" }).click();

  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible();
  expect(loads, "the page must not be loaded again").toBe(0);
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByLabel("Ad soyad")).toHaveValue("E2E Alıcı"); // what was typed is kept
});

test("Enter in the code field applies the code and does not try to place the order", async ({
  page,
}) => {
  let placed = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/store/checkout")) placed += 1;
  });
  await page.getByLabel("Kupon kodu").fill(code);
  await page.getByLabel("Kupon kodu").press("Enter");

  await expect(page.getByText(`Kupon (${code})`)).toBeVisible();
  expect(placed, "no order may be placed by applying a code").toBe(0);
  await expect(page).toHaveURL(/\/odeme$/);
});
