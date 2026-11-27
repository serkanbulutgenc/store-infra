import { expect, type Page, test } from "@playwright/test";
import { tab, useStaffLogin } from "../support/auth";
import { type SizeGuideSeed, seedSizeGuideShop } from "../support/seed";
import { openListing } from "../support/storefront";

// The Size guide ("Beden tablosu") and the Fit note ("Kalıp notu") from the Dashboard to the
// Storefront, as a Staff user (who may edit both). The tests run in order: each builds on the one
// before. The Products sit in Product classes of their own, so no other spec's product shows a guide.
test.describe.configure({ mode: "serial" });

let shop: SizeGuideSeed;
const suffix = Date.now().toString(36);
const classGuide = `Sınıf ölçüleri ${suffix}`;
const ownGuide = `Ürüne özel ölçüler ${suffix}`;
const fitNote = `Dar kalıp, bir beden büyük alın ${suffix}`;

useStaffLogin([], () => {
  shop = seedSizeGuideShop();
});

const guideLink = (page: Page) => page.getByRole("button", { name: "Beden tablosu" });

async function openGuide(page: Page) {
  await guideLink(page).click();
  return page.getByRole("dialog", { name: "Beden tablosu" });
}

test("a class guide and a Fit note show on the Storefront: the link and note on the page, the guide in the dialog", async ({
  page,
}) => {
  await page.goto(`/admin/product-classes/${shop.classId}/size-guide`);
  await page.getByRole("textbox", { name: "Tablo" }).fill(`| Beden | Göğüs |\n| --- | --- |\n| M | 96 |\n\n${classGuide}`);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Beden tablosu kaydedildi.")).toBeVisible();

  await page.goto(`/admin/products/${shop.plain.id}`);
  await tab(page, "Beden tablosu").click();
  await page.getByRole("textbox", { name: "Kalıp notu" }).fill(fitNote);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  await page.goto(`/urun/${shop.plain.slug}`);
  await expect(page.getByText(fitNote)).toBeVisible();
  // The note is in the page HTML itself, the guide text is not: it loads when the dialog opens.
  const html = await (await page.request.get(`/urun/${shop.plain.slug}`)).text();
  expect(html).toContain(fitNote);
  expect(html).not.toContain(classGuide);

  const dialog = await openGuide(page);
  await expect(dialog.getByText(classGuide)).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "96" })).toBeVisible();

  // A listing card's Variant picker shows the Fit note and opens the same guide on top of itself.
  await openListing(page);
  await page.getByRole("button", { name: `${shop.plain.title} sepete ekle` }).click();
  const picker = page.getByRole("dialog", { name: shop.plain.title });
  await expect(picker.getByText(fitNote)).toBeVisible();
  const guide = await openGuide(page);
  await expect(guide.getByText(classGuide)).toBeVisible();
  await guide.getByRole("button", { name: "Kapat" }).click();
  await expect(guide).toHaveCount(0);
  await expect(picker).toBeVisible();
});

test("a Product's own guide replaces the class guide, and removing it brings the class guide back", async ({
  page,
}) => {
  // The other Product of the class keeps the class guide throughout.
  await page.goto(`/admin/products/${shop.overridden.id}`);
  await tab(page, "Beden tablosu").click();
  await expect(page.getByTestId("guide-source")).toContainText(`“${shop.className}” sınıfının tablosunu gösterir`);
  await page.getByRole("textbox", { name: "Bu ürüne özel beden tablosu" }).fill(ownGuide);
  await expect(page.getByTestId("guide-source")).toHaveText("Bu ürün kendi tablosunu gösterir.");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  await page.goto(`/urun/${shop.overridden.slug}`);
  let dialog = await openGuide(page);
  await expect(dialog.getByText(ownGuide)).toBeVisible();
  await expect(dialog.getByText(classGuide)).toHaveCount(0);

  await page.goto(`/urun/${shop.plain.slug}`);
  dialog = await openGuide(page);
  await expect(dialog.getByText(classGuide)).toBeVisible();
  await expect(dialog.getByText(ownGuide)).toHaveCount(0);

  // Removing the override puts the Product back on the class guide.
  await page.goto(`/admin/products/${shop.overridden.id}`);
  await tab(page, "Beden tablosu").click();
  await page.getByRole("button", { name: "Sınıf tablosunu kullan" }).click();
  await expect(page.getByTestId("guide-source")).toContainText("sınıfının tablosunu gösterir");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  await page.goto(`/urun/${shop.overridden.slug}`);
  dialog = await openGuide(page);
  await expect(dialog.getByText(classGuide)).toBeVisible();
  await expect(dialog.getByText(ownGuide)).toHaveCount(0);
});

test("a One-size Product shows no Beden tablosu link, even with a guide written for it", async ({
  page,
}) => {
  await page.goto(`/admin/products/${shop.oneSize.id}`);
  await tab(page, "Beden tablosu").click();
  await page.getByRole("textbox", { name: "Bu ürüne özel beden tablosu" }).fill(ownGuide);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  // A Product with a guide does show the link (checked above), so its absence here is the rule at work.
  await page.goto(`/urun/${shop.oneSize.slug}`);
  await expect(page.getByRole("heading", { name: shop.oneSize.title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sepete ekle", exact: true })).toBeVisible();
  await expect(guideLink(page)).toHaveCount(0);
  await expect(page.getByText("Beden tablosu")).toHaveCount(0);
});
