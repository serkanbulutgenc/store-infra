import { expect, type Page } from "@playwright/test";
import type { Seed } from "./seed";

/** Open the seeded product and put one item of the seeded size in the basket. */
export async function addToBasket(page: Page, seed: Seed) {
  await page.goto("/ara");
  await page.getByRole("link", { name: new RegExp(seed.title) }).first().click();
  await page.getByRole("button", { name: seed.size, exact: true }).click();
  await page.getByRole("button", { name: "Sepete ekle" }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
}

/** Type a code into the cart's "Kupon kodu" field and apply it; the caller checks the outcome. */
export async function applyVoucher(page: Page, code: string) {
  await page.getByLabel("Kupon kodu").fill(code);
  await page.getByRole("button", { name: "Uygula" }).click();
}

/**
 * From the cart, go to checkout, fill the form (cash on delivery) and place the order.
 * `email` is for a Guest; a signed-in Customer's own address is already filled in and stays.
 * Returns the order number from the confirmation page.
 */
export async function checkoutAndPlace(page: Page, email?: string): Promise<string> {
  await page.getByRole("link", { name: "Ödemeye geç" }).click();
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
  await page.getByLabel("Ad soyad").fill("E2E Alıcı");
  if (email) await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Telefon").fill("0532 123 45 67");
  await page.getByLabel("İl", { exact: true }).fill("İstanbul");
  await page.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await page.getByLabel("Mahalle", { exact: true }).fill("Caferağa");
  await page.getByLabel("Cadde, sokak, bina ve daire no").fill("Moda Caddesi No 1 Daire 2");
  await page.getByRole("radio", { name: /Kapıda ödeme/ }).check();
  await page.getByLabel(/Kapıda ödeme bedeli olan/).check();
  await page.getByLabel(/Mesafeli satış sözleşmesini/).check();
  await page.getByRole("button", { name: /Siparişi onayla/ }).click();
  await expect(page).toHaveURL(/\/siparis-onayi/);
  await expect(page.getByRole("heading", { name: "Siparişiniz alındı" })).toBeVisible();
  return (await page.getByText(/Sipariş numaranız:/).locator("strong").innerText()).trim();
}
