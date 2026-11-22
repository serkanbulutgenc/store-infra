import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { descriptionOf, type ImportSeed, seedImportShop } from "../support/seed";

// The catalogue import (Owner-only) when a file changes only a Product's own fields: a new
// Description. The preview used to count variants only, so such a file looked like "nothing to
// change" and could not be confirmed (store-infra#100).
test.describe.configure({ mode: "serial" });

let seed: ImportSeed;
let ownerState: Awaited<ReturnType<typeof loginState>>;

test.beforeAll(async ({ browser, baseURL }) => {
  seed = seedImportShop();
  ownerState = await loginState(browser, baseURL, seed.owner);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(ownerState.cookies);
});

const title = () => `E2E Ithal ${seed.run}`;

/** One Product with two variants (S, M); only the Description differs between files. */
function csv(description: string): Buffer {
  const quoted = `"${description.replace(/"/g, '""')}"`;
  const head = "product_name,category,brand,supplier,product_class,colour,size,sku,shelf_price_try,kdv_class,quantity,notes,description";
  const row = (size: string) =>
    `${title()},E2E Ithal ${seed.run},,,Giyim,${seed.colour},${size},,150.00,,4,,${quoted}`;
  return Buffer.from(`${head}\n${row("S")}\n${row("M")}\n`);
}

async function preview(page: Page, description: string) {
  await page.goto("/admin/import");
  await expect(page.getByRole("heading", { name: "Ürünleri içe aktar" })).toBeVisible();
  await page.getByLabel("CSV dosyası").setInputFiles({
    name: "urunler.csv",
    mimeType: "text/csv",
    buffer: csv(description),
  });
  await expect(page.getByRole("region", { name: "Önizleme" })).toBeVisible();
}

const confirm = (page: Page) => page.getByRole("button", { name: "Onayla ve içe aktar" });

test("the first file creates the Product with its Description", async ({ page }) => {
  await preview(page, "Eski açıklama");
  await expect(page.getByRole("region", { name: "Önizleme" })).toContainText("1 yeni ürün");
  await confirm(page).click();
  await expect(page.getByRole("heading", { name: "İçe aktarma tamamlandı" })).toBeVisible();
  expect(descriptionOf(title())).toBe("Eski açıklama");
});

test("a file that changes only the Description previews as a changed Product and can be confirmed", async ({
  page,
}) => {
  await preview(page, "Yeni **açıklama**");
  const summary = page.getByRole("region", { name: "Önizleme" });
  await expect(summary).toContainText("1 değişen ürün");
  await expect(summary).toContainText("0 güncellenen varyant");
  await expect(summary).toContainText("2 değişmeyen varyant");
  await expect(page.getByText("değişecek bir şey yok")).toHaveCount(0);
  await expect(confirm(page)).toBeEnabled();
  // Nothing is saved by the preview.
  expect(descriptionOf(title())).toBe("Eski açıklama");

  await confirm(page).click();
  await expect(page.getByRole("heading", { name: "İçe aktarma tamamlandı" })).toBeVisible();
  expect(descriptionOf(title())).toBe("Yeni **açıklama**");
});

test("the same file again has nothing to change and cannot be confirmed", async ({ page }) => {
  await preview(page, "Yeni **açıklama**");
  const summary = page.getByRole("region", { name: "Önizleme" });
  await expect(summary).toContainText("0 değişen ürün");
  await expect(page.getByText("değişecek bir şey yok")).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
});

test("an empty Description cell never clears the stored one", async ({ page }) => {
  await preview(page, "");
  await expect(page.getByRole("region", { name: "Önizleme" })).toContainText("0 değişen ürün");
  await expect(confirm(page)).toBeDisabled();
  expect(descriptionOf(title())).toBe("Yeni **açıklama**");
});
