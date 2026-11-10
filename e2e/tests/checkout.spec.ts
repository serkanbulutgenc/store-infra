import { expect, test } from "@playwright/test";
import { type Seed, seedShop } from "../support/seed";

// Guest cash-on-delivery checkout, then the order found in the Dashboard.
// Adding to the basket happens in the browser; `page.goto("/sepet")` is then a full load
// rendered by the Start server, which has to forward the guest's session cookie to Django
// (the SSR cookie hop). If that hop breaks, the basket is empty and this test fails.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let orderNumber = "";

test.beforeAll(() => {
  seed = seedShop();
});

test("a guest browses, fills a basket and places a COD order", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  // Browse: find the product in the listing and open it.
  await page.goto("/ara");
  await page.getByRole("link", { name: new RegExp(seed.title) }).first().click();
  await expect(page.getByRole("heading", { name: seed.title })).toBeVisible();

  // Add to the basket.
  await page.getByRole("button", { name: seed.size, exact: true }).click();
  await page.getByRole("button", { name: "Sepete ekle" }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();

  // SSR cookie hop: a full load of /sepet must still know this guest's basket.
  await page.goto("/sepet");
  await expect(page.getByRole("link", { name: new RegExp(seed.title) }).first()).toBeVisible();
  await page.getByRole("link", { name: "Ödemeye geç" }).click();

  // Checkout as a guest, cash on delivery.
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
  await page.getByLabel("Ad soyad").fill("E2E Alıcı");
  await page.getByLabel("E-posta").fill("e2e.shopper@example.com");
  await page.getByLabel("Telefon").fill("0532 123 45 67");
  await page.getByLabel("İl", { exact: true }).fill("İstanbul");
  await page.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await page.getByLabel("Mahalle", { exact: true }).fill("Caferağa");
  await page.getByLabel("Cadde, sokak, bina ve daire no").fill("Moda Caddesi No 1 Daire 2");
  await page.getByRole("radio", { name: /Kapıda ödeme/ }).check();
  await page.getByLabel(/Kapıda ödeme bedeli olan/).check();
  await page.getByLabel(/Mesafeli satış sözleşmesini/).check();
  await page.getByRole("button", { name: /Siparişi onayla/ }).click();

  // Confirmation.
  await expect(page).toHaveURL(/\/siparis-onayi/);
  await expect(page.getByRole("heading", { name: "Siparişiniz alındı" })).toBeVisible();
  orderNumber = (await page.getByText(/Sipariş numaranız:/).locator("strong").innerText()).trim();
  expect(orderNumber).not.toBe("");
  expect(pageErrors).toEqual([]);
});

test("the order appears in the Dashboard", async ({ page }) => {
  expect(orderNumber, "the first test places the order").not.toBe("");

  await page.goto("/admin/login");
  await page.getByLabel("E-posta").fill(seed.staffEmail);
  await page.getByLabel("Parola").fill(seed.staffPassword);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);

  await page.goto("/admin/orders");
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();
  await page.getByRole("link", { name: orderNumber }).click();
  await expect(page.getByText("E2E Alıcı").first()).toBeVisible();
  await expect(page.getByText(/Kapıda ödeme/).first()).toBeVisible();
});
