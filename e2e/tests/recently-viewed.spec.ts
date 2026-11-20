import { expect, type Locator, type Page, test } from "@playwright/test";
import { loginCustomerState } from "../support/auth";
import { seedCustomer, seedViewedShop, sellOut, type ViewedSeed } from "../support/seed";

// "Son baktıklarınız" (GLOSSARY: Recently viewed): the list lives in the browser, so every test
// starts in a fresh browser context with an empty list.
let shop: ViewedSeed;
let customerState: Awaited<ReturnType<typeof loginCustomerState>>;

test.beforeAll(async ({ browser, baseURL }) => {
  shop = seedViewedShop();
  customerState = await loginCustomerState(browser, baseURL, seedCustomer());
});

const rail = (page: Page) => page.getByRole("region", { name: "Son baktıklarınız" });

async function slugsIn(rail: Locator) {
  const hrefs = await rail.locator('a[href^="/urun/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  return [...new Set(hrefs)].map((h) => h.replace("/urun/", ""));
}

/** Open a Product's page and wait until it has rendered (the page records the view on mount). */
async function view(page: Page, index: number) {
  const product = shop.products[index];
  if (!product) throw new Error(`no seeded product ${index}`);
  await page.goto(`/urun/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.title })).toBeVisible();
}

const slug = (index: number) => shop.products[index]?.slug ?? "";

test("without history there is no rail, not even in the server's HTML", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Yeni gelenler" })).toBeVisible();

  await expect(rail(page)).toHaveCount(0);
  expect(await (await page.request.get("/")).text()).not.toContain("Son baktıklarınız");
});

test("three viewed Products show most recent first on the homepage above 'Yeni gelenler'", async ({ page }) => {
  await view(page, 0);
  await view(page, 1);
  await view(page, 2);

  await page.goto("/");
  await expect(rail(page)).toBeVisible();
  expect(await slugsIn(rail(page))).toEqual([slug(2), slug(1), slug(0)]);

  const viewed = await rail(page).getByRole("heading", { name: "Son baktıklarınız" }).boundingBox();
  const latest = await page.getByRole("heading", { name: "Yeni gelenler" }).boundingBox();
  expect(viewed?.y).toBeLessThan(latest?.y ?? 0);
});

test("on a product page the rail leaves out that Product and sits below 'Benzer ürünler'", async ({ page }) => {
  await view(page, 0);
  await view(page, 1);
  await view(page, 2);
  await view(page, 3);

  await expect(rail(page)).toBeVisible();
  expect(await slugsIn(rail(page))).toEqual([slug(2), slug(1), slug(0)]);

  const similar = await page.getByRole("heading", { name: "Benzer ürünler" }).boundingBox();
  const viewed = await rail(page).getByRole("heading", { name: "Son baktıklarınız" }).boundingBox();
  expect(similar).not.toBeNull();
  expect(viewed?.y).toBeGreaterThan(similar?.y ?? Number.POSITIVE_INFINITY);
});

test("'Temizle' empties the list, and it stays empty after a reload", async ({ page }) => {
  await view(page, 0);
  await page.goto("/");
  await expect(rail(page)).toBeVisible();

  await rail(page).getByRole("button", { name: "Temizle" }).click();
  await expect(rail(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Yeni gelenler" })).toBeVisible();
  await expect(rail(page)).toHaveCount(0);
});

test("signing out clears the list", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: customerState, locale: "tr-TR" });
  const page = await context.newPage();
  try {
    await view(page, 0);
    await view(page, 1);
    await page.goto("/");
    await expect(rail(page)).toBeVisible();

    await page.goto("/hesap");
    await page.getByRole("button", { name: "Çıkış yap" }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole("heading", { name: "Yeni gelenler" })).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a Product that sells out drops out of the rail", async ({ page }) => {
  await view(page, 0);
  await view(page, 1);
  await page.goto("/");
  await expect(rail(page)).toBeVisible();
  expect(await slugsIn(rail(page))).toEqual([slug(1), slug(0)]);

  sellOut(slug(1));
  await page.reload();

  await expect(rail(page)).toBeVisible();
  expect(await slugsIn(rail(page))).toEqual([slug(0)]);
});
