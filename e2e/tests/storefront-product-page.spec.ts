import { expect, test } from "@playwright/test";
import { type GallerySeed, type Seed, seedGalleryProduct, seedShop } from "../support/seed";

// The product page: a one-size product adds with one click, a multi-size one asks for a size,
// the thumbnails stand in a column left of the photo, and the details sit in tabs.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let gallery: GallerySeed;

test.beforeAll(() => {
  seed = seedShop();
  gallery = seedGalleryProduct();
});

async function open(page: import("@playwright/test").Page, title: string) {
  await page.goto("/ara");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("a one-size product adds to the basket with no size to pick", async ({ page }) => {
  await open(page, seed.title);
  await expect(page.getByRole("group", { name: "Beden" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
});

test("a product with several sizes asks for one first", async ({ page }) => {
  await open(page, gallery.title);
  const add = page.getByRole("button", { name: "Beden seçin" });
  await expect(add).toBeDisabled();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
});

test("the thumbnails stand in a column to the left of the photo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, gallery.title);
  const thumbs = page.getByRole("list", { name: "Fotoğraflar" });
  await expect(thumbs.getByRole("button")).toHaveCount(3);
  await expect(thumbs).toBeVisible();
  await expect(page.locator("main img").first()).toBeVisible();
  const [list, main] = await Promise.all([
    thumbs.boundingBox(),
    page.locator("main img").first().boundingBox(),
  ]);
  expect(list && main && list.x + list.width <= main.x + 1).toBe(true);
  const [first, last] = await Promise.all([
    thumbs.getByRole("button").first().boundingBox(),
    thumbs.getByRole("button").last().boundingBox(),
  ]);
  expect(first && last && last.y > first.y && Math.abs(last.x - first.x) < 2).toBe(true);
  // Picking a thumbnail marks it as the current photo.
  await thumbs.getByRole("button").nth(2).click();
  await expect(thumbs.getByRole("button").nth(2)).toHaveAttribute("aria-current", "true");
});

test("on a phone the thumbnails sit in a row under the photo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, gallery.title);
  const thumbs = page.getByRole("list", { name: "Fotoğraflar" });
  await expect(thumbs).toBeVisible();
  await expect(page.locator("main img").first()).toBeVisible();
  const [list, main] = await Promise.all([
    thumbs.boundingBox(),
    page.locator("main img").first().boundingBox(),
  ]);
  expect(list && main && list.y >= main.y + main.height - 1).toBe(true);
});

test("attributes, reviews and description are tabs", async ({ page }) => {
  await open(page, gallery.title);
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveText([
    "Ürün özellikleri",
    /^Yorumlar( \(\d+\))?$/,
    "Açıklama",
  ]);
  await expect(page.getByRole("tab", { name: "Ürün özellikleri" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: /^Yorumlar/ }).click();
  await expect(page.getByText("Henüz değerlendirme yok.")).toBeVisible();
  await page.getByRole("tab", { name: "Açıklama" }).click();
  await expect(page.getByText("Açıklama yok.")).toBeVisible();
});
