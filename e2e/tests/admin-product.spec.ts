import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedProduct, seedStaff } from "../support/seed";

// The product editor as tabs, as a Staff user (cost price and Supplier are Owner-only).
test.describe.configure({ mode: "serial" });

let storageState: Awaited<ReturnType<typeof loginState>>;
let product: { id: number; title: string };

test.beforeAll(async ({ browser, baseURL }) => {
  product = seedProduct();
  storageState = await loginState(browser, baseURL, seedStaff());
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(storageState.cookies);
});

const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(name) });

async function openEditor(page: Page, path = `/admin/products/${product.id}`) {
  await page.goto(path);
  await expect(tab(page, "Genel")).toBeVisible();
}

test("the editor has Genel, Fiyat, Varyantlar and Fotoğraflar tabs", async ({ page }) => {
  await openEditor(page);
  for (const name of ["Genel", "Fiyat", "Varyantlar", "Fotoğraflar"]) {
    await expect(tab(page, name)).toBeVisible();
  }
  await expect(tab(page, "Genel")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Ürün adı")).toHaveValue(product.title);
});

test("Staff do not see the cost price or the Supplier", async ({ page }) => {
  await openEditor(page);
  await tab(page, "Fiyat").click();
  await expect(page.getByLabel("Satış fiyatı (KDV dahil)")).toBeVisible();
  await expect(page.getByLabel("Alış fiyatı")).toHaveCount(0);
  await expect(page.getByLabel("Tedarikçi", { exact: true })).toHaveCount(0);
});

test("unsaved changes survive tab switches and save in one request", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && new RegExp(`/products/${product.id}$`).test(r.url())) {
      writes.push(r.postData() ?? "");
    }
  });
  await openEditor(page);

  await page.getByLabel("Ürün adı").fill(`${product.title} düzenlendi`);
  await tab(page, "Fiyat").click();
  await page.getByLabel("Satış fiyatı (KDV dahil)").fill("149.90");
  await tab(page, "Varyantlar").click();
  await expect(page.getByRole("button", { name: "Varyant ekle" })).toBeVisible();
  await tab(page, "Genel").click();
  await expect(page.getByLabel("Ürün adı")).toHaveValue(`${product.title} düzenlendi`);
  await tab(page, "Fiyat").click();
  await expect(page.getByLabel("Satış fiyatı (KDV dahil)")).toHaveValue("149.90");

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain("düzenlendi");
  expect(writes[0]).toContain("149.90");
});

test("an invalid price in a hidden tab marks the Fiyat tab", async ({ page }) => {
  await openEditor(page);
  await tab(page, "Fiyat").click();
  await page.getByLabel("Satış fiyatı (KDV dahil)").fill("abc");
  await tab(page, "Genel").click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(tab(page, "Fiyat").getByText("Geçersiz alan var")).toBeAttached();
  await expect(tab(page, "Genel").getByText("Geçersiz alan var")).toHaveCount(0);
});

test("the old photos URL lands on the Fotoğraflar tab", async ({ page }) => {
  await openEditor(page, `/admin/products/${product.id}/photos`);
  await expect(page).toHaveURL(new RegExp(`/admin/products/${product.id}\\?tab=photos`));
  await expect(tab(page, "Fotoğraflar")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Fotoğraflar" })).toBeVisible();
});
