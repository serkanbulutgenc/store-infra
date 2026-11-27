import { expect, type Page, test } from "@playwright/test";
import {
  type ColourSeed,
  type GallerySeed,
  type Seed,
  seedColourProduct,
  seedGalleryProduct,
  seedShop,
} from "../support/seed";
import { openListing } from "../support/storefront";

// The product page: a one-size product adds with one click, a multi-size one asks for a size,
// the thumbnails stand in a column left of the photo, the details sit in tabs, a colour switch
// follows through to photos, sizes and stock, and the card's bag button adds from the listing,
// through the Variant picker when there is something to choose.
test.describe.configure({ mode: "serial" });

let seed: Seed;
let gallery: GallerySeed;
let colours: ColourSeed;

test.beforeAll(() => {
  seed = seedShop();
  gallery = seedGalleryProduct();
  colours = seedColourProduct();
});

async function open(page: Page, title: string) {
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

test("attributes and description are tabs, with the reviews below them", async ({ page }) => {
  await open(page, gallery.title);
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveText(["Ürün özellikleri", "Açıklama"]);
  await expect(page.getByRole("tab", { name: "Ürün özellikleri" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const empty = page.getByText("Henüz değerlendirme yok.");
  await expect(empty).toBeVisible();
  const [list, reviews] = await Promise.all([tabs.boundingBox(), empty.boundingBox()]);
  expect(list && reviews && reviews.y > list.y + list.height).toBe(true);
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

/** A card's bag button on the listing, and what the basket holds afterwards. */
const bag = (page: Page, title: string) => page.getByRole("button", { name: `${title} sepete ekle` });

async function quantities(page: Page): Promise<number[]> {
  const basket = await (await page.request.get("/api/store/basket")).json();
  return basket.lines.map((line: { quantity: number }) => line.quantity);
}

test("the card's bag button adds a Single-Variant Product at once", async ({ page }) => {
  await openListing(page);
  await expect(page.getByRole("button", { name: "Hızlı bakış" })).toHaveCount(0);
  await bag(page, seed.title).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await quantities(page)).toEqual([1]);
});

test("the picker adds the chosen Size and quantity, and stays open when the add fails", async ({
  page,
}) => {
  await openListing(page);
  await bag(page, gallery.title).click();
  const picker = page.getByRole("dialog", { name: gallery.title });
  await expect(picker.getByRole("button", { name: "Beden seçin" })).toBeDisabled();
  // Tapping a Size selects it and adds nothing.
  await picker.getByRole("button", { name: "M", exact: true }).click();
  await expect(picker.getByRole("button", { name: "M", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await quantities(page)).toEqual([]);
  await picker.getByRole("button", { name: "Adedi artır" }).click();
  await picker.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
  await expect(picker).toHaveCount(0);
  await expect(bag(page, gallery.title)).toBeFocused();
  expect(await quantities(page)).toEqual([2]);

  // M has 10 in stock: 2 in the basket and 10 more is refused.
  await bag(page, gallery.title).click();
  await picker.getByRole("button", { name: "M", exact: true }).click();
  for (let i = 1; i < 10; i++) await picker.getByRole("button", { name: "Adedi artır" }).click();
  const refused = page.waitForResponse(
    (r) => r.url().endsWith("/api/store/basket/lines") && r.request().method() === "POST",
  );
  await picker.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  expect((await refused).ok()).toBe(false);
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  await expect(picker).toBeVisible();
  expect(await quantities(page)).toEqual([2]);
});

test("on a phone the picker is a bottom sheet, with a sold-out Size to select", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openListing(page);
  await bag(page, colours.title).click();
  const picker = page.getByRole("dialog", { name: colours.title });
  await expect(picker.getByText(`Renk: ${colours.first}`)).toBeVisible();
  await picker.getByRole("button", { name: colours.second }).click();
  await expect(picker.getByText(`Renk: ${colours.second}`)).toBeVisible();
  await picker.getByRole("button", { name: "M (tükendi)" }).click();
  await expect(picker.getByRole("button", { name: "Tükendi", exact: true })).toBeDisabled();
  await expect
    .poll(async () => {
      const box = await picker.boundingBox();
      return box && [box.x, box.width, Math.round(box.y + box.height)];
    })
    .toEqual([0, 390, 800]);
  await picker.getByRole("link", { name: "Ürün detayları" }).click();
  await expect(page.getByRole("heading", { level: 1, name: colours.title })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("when the Product cannot be loaded the bag button says so and can be tried again", async ({
  page,
}) => {
  await openListing(page);
  const product = /\/api\/store\/products\/[^/?]+$/;
  await page.route(product, (route) => route.abort());
  await bag(page, seed.title).click();
  await expect(page.getByText("Ürün yüklenemedi.")).toBeVisible();
  expect(await quantities(page)).toEqual([]);
  await page.unroute(product);
  await bag(page, seed.title).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();
});
