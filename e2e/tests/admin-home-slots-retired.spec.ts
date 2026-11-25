import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner } from "../support/seed";

// Store-infra #172-#174: the home page has no Banner Slots of its own. Its images are managed in
// the Vitrin, so the Banner'lar screen offers only the announcement bar and the Category page top,
// and a Slayt section can no longer pick Banners. Nothing here changes data.
test("the Banner'lar screen offers only the announcement bar and the Category page top", async ({
  browser,
  baseURL,
}) => {
  const state = await loginState(browser, baseURL, seedOwner());
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("/admin/banners");

  await page.getByRole("button", { name: "Yeni banner" }).click();
  const slots = page.getByLabel("Alan", { exact: true });
  await expect(slots.locator("option")).toHaveText(["Duyuru çubuğu", "Kategori sayfası üstü"]);
  // New Banners start on the Category page top, the Slot that takes pictures.
  await expect(slots).toHaveValue("category_top");

  // An old link to a retired Slot just shows the list.
  await page.goto("/admin/banners?slot=home_hero");
  await expect(page.getByRole("heading", { name: "Banner'lar" }).first()).toBeVisible();
  await context.close();
});

test("a Slayt section offers its own images, not Banners", async ({ browser, baseURL }) => {
  const state = await loginState(browser, baseURL, seedOwner());
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("/admin/homepage");

  await page.getByRole("button", { name: "Slayt: ayarlar" }).first().click();
  const source = page.getByLabel("Slayt nereden gelsin?");
  await expect(source.locator("option")).toHaveText([
    "Öne çıkan ürünler (ana sayfa koleksiyonu ya da yeni ürünler)",
    "Bir koleksiyon",
    "Kendi görsellerim",
  ]);
  await context.close();
});
