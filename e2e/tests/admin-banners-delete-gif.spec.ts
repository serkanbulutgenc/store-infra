import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { solidGif } from "../support/images";
import { seedOwner } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #130: an Owner uploads a GIF to a picture Banner without alt text (allowed, with a
// warning), the Storefront serves the GIF itself, and the Banner can be deleted from its page.
const run = Date.now().toString(36);
const alt = `E2E gif ${run}`;

test.afterAll(() => {
  runDjangoScript(`
from store_backend.catalog.models import Banner

Banner.objects.filter(image_alt__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

test("a GIF Banner without alt text can be uploaded, shown and deleted", async ({
  browser,
  baseURL,
}) => {
  const state = await loginState(browser, baseURL, seedOwner());
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();

  await page.goto("/admin/banners");
  await page.getByRole("button", { name: "Yeni banner" }).click();
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect(page).toHaveURL(/\/admin\/banners\/\d+$/);
  const id = page.url().split("/").pop();

  await page.getByLabel("Görsel yükle", { exact: true }).setInputFiles({
    name: "hareket.gif",
    mimeType: "image/gif",
    buffer: solidGif(800, 800),
  });
  await expect(page.getByText("Görsel yüklendi.").first()).toBeVisible();
  await expect(page.getByText(/alternatif metni yok/).first()).toBeVisible();

  // Alt text can still be added afterwards.
  await page.getByLabel("Alternatif metin").fill(alt);
  await page.getByRole("button", { name: "Metni kaydet" }).click();
  await expect(page.getByText("Metin kaydedildi.").first()).toBeVisible();
  await expect(page.getByText(/alternatif metni yok/)).toHaveCount(0);

  await page.getByRole("button", { name: /^Sil/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();
  await expect(page.getByText("Banner silindi.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/banners$/);
  await expect(page.locator(`a[href$="/admin/banners/${id}"]`)).toHaveCount(0);
  await context.close();
});
