import { expect, test } from "@playwright/test";
import {
  type ColourSeed,
  type GallerySeed,
  type Seed,
  seedColourProduct,
  seedGalleryProduct,
  seedShop,
} from "../support/seed";

// The product page: a one-size product adds with one click, a multi-size one asks for a size,
// the thumbnails stand in a column left of the photo, the details sit in tabs, a colour switch
// follows through to photos, sizes and stock, and the card's bag button adds from the listing.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let gallery: GallerySeed;
let colours: ColourSeed;

test.beforeAll(() => {
  seed = seedShop();
  gallery = seedGalleryProduct();
  colours = seedColourProduct();
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

test("switching colour changes the photos, the sizes and the stock label", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, colours.title);
  const thumbs = page.getByRole("list", { name: "Fotoğraflar" });
  const sizes = page.getByRole("group", { name: "Beden" });
  const add = page.locator("main").getByRole("button", { name: /^(Sepete ekle|Beden seçin|Tükendi)$/ });
  // The first colour: one photo (so no thumbnails), sizes S and M, nothing picked yet.
  await expect(page.getByRole("button", { name: colours.first })).toHaveAttribute("aria-pressed", "true");
  await expect(thumbs).toHaveCount(0);
  await expect(sizes.getByRole("button")).toHaveText(["S", "M"]);
  await page.getByRole("button", { name: "S", exact: true }).click();
  await expect(add).toHaveText("Sepete ekle");
  // The second colour: two photos, sizes M (sold out) and L; the picked S is not offered, so the
  // choice is dropped.
  await page.getByRole("button", { name: colours.second }).click();
  await expect(page.getByRole("button", { name: colours.second })).toHaveAttribute("aria-pressed", "true");
  await expect(thumbs.getByRole("button")).toHaveCount(2);
  await expect(sizes.getByRole("button")).toHaveText(["M (tükendi)", "L"]);
  await expect(sizes.getByRole("button", { name: "S", exact: true })).toHaveCount(0);
  await expect(add).toHaveText("Beden seçin");
  // The sold-out size shows the stock label and the button turns into "Tükendi".
  await sizes.getByRole("button", { name: "M (tükendi)" }).click();
  await expect(page.getByText("Tükendi", { exact: true }).first()).toBeVisible();
  await expect(add).toHaveText("Tükendi");
  await expect(add).toBeDisabled();
  // Back to the first colour: its photo count and sizes return.
  await page.getByRole("button", { name: colours.first }).click();
  await expect(thumbs).toHaveCount(0);
  await expect(sizes.getByRole("button")).toHaveText(["S", "M"]);
});

test("the card's bag button adds a one-size product at once", async ({ page }) => {
  await page.goto("/ara");
  await page.getByRole("button", { name: `${seed.title} sepete ekle` }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
  // The strip never opened (no "Kapat"), and the bag is back.
  await expect(page.getByRole("button", { name: "Kapat" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `${seed.title} sepete ekle` })).toBeVisible();
});

test("the card's bag button opens a size strip and a chip adds that size", async ({ page }) => {
  await page.goto("/ara");
  const bag = page.getByRole("button", { name: `${gallery.title} sepete ekle` });
  await bag.click();
  // The listing has its own "Beden" filter; the strip is the bar around "Kapat".
  const close = page.getByRole("button", { name: "Kapat" });
  const strip = close.locator("..");
  await expect(strip.getByRole("button")).toHaveText(["S", "M", ""]);
  await expect(page.getByText("Ürün sepete eklendi.")).toHaveCount(0);
  // Closing puts the bag back without adding anything.
  await close.click();
  await expect(close).toHaveCount(0);
  await expect(page.getByText("Ürün sepete eklendi.")).toHaveCount(0);
  await bag.click();
  await close.locator("..").getByRole("button", { name: "M", exact: true }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
  await expect(bag).toBeVisible();
});
