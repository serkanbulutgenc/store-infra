import { expect, type Page, test } from "@playwright/test";
import { loginState, tab } from "../support/auth";
import {
  type DescriptionSeed,
  seedDescriptionProduct,
  seedOwner,
  seedStaff,
  seedUserWith,
} from "../support/seed";

// The Product Description editor by role: an Owner writes one and it shows on the Storefront; a
// user without `manage_product_photos` can still write the text but has no image button, and the
// upload endpoint refuses them (a user with the permission gets through the same call, so the 403
// is the permission and not a missing CSRF token or a bad request).
test.describe.configure({ mode: "serial" });

let ownerState: Awaited<ReturnType<typeof loginState>>;
let noPhotosState: Awaited<ReturnType<typeof loginState>>;
let staffState: Awaited<ReturnType<typeof loginState>>;
let owned: DescriptionSeed;
let limited: DescriptionSeed;

test.beforeAll(async ({ browser, baseURL }) => {
  owned = seedDescriptionProduct();
  limited = seedDescriptionProduct();
  ownerState = await loginState(browser, baseURL, seedOwner());
  noPhotosState = await loginState(
    browser,
    baseURL,
    seedUserWith(["view_products", "manage_products"]),
  );
  staffState = await loginState(browser, baseURL, seedStaff());
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const panel = (page: Page) => page.getByRole("tabpanel", { name: "Açıklama" });
const area = (page: Page) => page.getByRole("textbox", { name: "Açıklama" });

async function openDescription(page: Page, product: DescriptionSeed) {
  await page.goto(`/admin/products/${product.id}`);
  await tab(page, "Açıklama").click();
  await expect(area(page)).toBeVisible();
}

/** The same upload the editor's image button makes; the web proxy adds the CSRF header. */
const upload = (page: Page) =>
  page.request.post("/api/admin/description-images", {
    multipart: { file: { name: "kumas.png", mimeType: "image/png", buffer: PNG } },
  });

test("an Owner writes a Description with an image and it shows on the Storefront", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, locale: "tr-TR", storageState: ownerState });
  const page = await context.newPage();
  await openDescription(page, owned);
  await expect(panel(page).getByRole("button", { name: "Görsel yükle" })).toBeVisible();
  await area(page).fill("Owner **yazdı**");
  await panel(page).getByLabel("Görsel dosyası seç").setInputFiles({
    name: "kumas.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(area(page)).toHaveValue(/!\[görsel açıklaması\]\(.*\/media\/description\/.+\.png\)/);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();
  await context.close();

  const shop = await browser.newContext({ baseURL, locale: "tr-TR" });
  const storefront = await shop.newPage();
  await storefront.goto(`/urun/${owned.slug}`);
  await storefront.getByRole("tab", { name: "Açıklama" }).click();
  const text = storefront.getByRole("tabpanel", { name: "Açıklama" });
  await expect(text.locator("strong")).toHaveText("yazdı");
  await expect(text.locator('img[src*="/media/description/"]')).toHaveCount(1);
  await shop.close();
});

test("without manage_product_photos the text can be written, but there is no image button", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    storageState: noPhotosState,
  });
  const page = await context.newPage();
  await openDescription(page, limited);
  await expect(panel(page).getByRole("button", { name: "Kalın" })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Görsel yükle" })).toHaveCount(0);
  await expect(panel(page).getByLabel("Görsel dosyası seç")).toHaveCount(0);

  await area(page).fill("Sadece **metin**");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();
  await page.reload();
  await tab(page, "Açıklama").click();
  await expect(area(page)).toHaveValue("Sadece **metin**");
  await context.close();
});

test("the upload endpoint refuses a user without manage_product_photos and accepts Staff", async ({
  browser,
  baseURL,
}) => {
  const denied = await browser.newContext({ baseURL, locale: "tr-TR", storageState: noPhotosState });
  const deniedPage = await denied.newPage();
  await deniedPage.goto("/admin");
  const refused = await upload(deniedPage);
  expect(refused.status()).toBe(403);
  await denied.close();

  // Same call as Staff, who hold the permission: it goes through, so the 403 above is the permission.
  const allowed = await browser.newContext({ baseURL, locale: "tr-TR", storageState: staffState });
  const allowedPage = await allowed.newPage();
  await allowedPage.goto("/admin");
  const accepted = await upload(allowedPage);
  expect(accepted.status()).toBe(201);
  expect((await accepted.json()).url).toMatch(/\/media\/description\//);
  await allowed.close();
});
