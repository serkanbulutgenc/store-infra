import { expect, type Page, test } from "@playwright/test";
import { runDjangoScript } from "../support/stack";

// The listing shows 24 products per page; 30 products make exactly two pages.
const COUNT = 30;
const PAGE_SIZE = 24;
const run = Date.now().toString(36);
const categoryName = `Kaydırma ${run}`;
const title = (i: number) => `Ürün ${run} ${String(i).padStart(2, "0")}`;
let slug = "";

test.beforeAll(() => {
  const out = runDjangoScript(`
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

category = catalog.create_category(${JSON.stringify(categoryName)})
colour = catalog.create_colour("Kaydırma Siyah ${run}", "#000000")
klass = ProductClass.objects.get(name="Giyim")
for i in range(1, ${COUNT} + 1):
    product = catalog.create_product(
        title="Ürün ${run} %02d" % i,
        product_class=klass,
        category=category,
        shelf_price="%d.00" % (i * 10),
    )
    catalog.create_variant(product, colour=colour, size="M", stock=5)
    ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED " + json.dumps({"slug": category.slug}))
`);
  const match = out.match(/SEEDED (\{.*\})/);
  const seeded = match?.[1];
  if (!seeded) throw new Error(out);
  slug = JSON.parse(seeded).slug;
});

// A hydration mismatch (server HTML vs first client render) surfaces as a page error.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const cards = (page: Page) => page.locator("main li h3");
/** Scrolls until the next page is requested (the layout can still shift while fonts and images load). */
const scrollToEnd = (page: Page) =>
  expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page).toHaveURL(/page=2/, { timeout: 1000 });
  }).toPass();
const showing = (page: Page) => page.getByText(`/ ${COUNT} ürün gösteriliyor`);

test("scrolling to the end loads the next page and ends with a message", async ({ page }) => {
  await page.goto(`/kategori/${slug}`);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
  await expect(page.getByText("Tüm ürünleri gördünüz.")).toBeHidden();

  await scrollToEnd(page);
  await expect(cards(page)).toHaveCount(COUNT);
  await expect(page).toHaveURL(/page=2/);
  await expect(showing(page)).toHaveText(`${COUNT} / ${COUNT} ürün gösteriliyor`);
  await expect(page.getByText("Tüm ürünleri gördünüz.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Daha fazla göster" })).toHaveCount(0);
});

test("the load-more control is a crawlable rel=next link to the next page", async ({ page }) => {
  await page.goto(`/kategori/${slug}`);
  const next = page.getByRole("link", { name: "Daha fazla göster" });
  await expect(next).toHaveAttribute("rel", "next");
  await expect(next).toHaveAttribute("href", /page=2/);
});

test("a deep link renders every page up to it", async ({ page }) => {
  await page.goto(`/kategori/${slug}?page=2`);
  await expect(cards(page)).toHaveCount(COUNT);
});

test("sorting reorders from the first page and resets how far you had scrolled", async ({
  page,
}) => {
  await page.goto(`/kategori/${slug}?page=2`);
  await expect(cards(page)).toHaveCount(COUNT);

  // The page is server-rendered; retry until hydration has attached the select's handler.
  await expect(async () => {
    await page.getByLabel("Sırala").selectOption({ label: "Fiyat: azalan" });
    await expect(page).toHaveURL(/sort=price_desc/, { timeout: 1000 });
  }).toPass();
  await expect(page).not.toHaveURL(/page=/);
  await expect(cards(page).first()).toHaveText(title(COUNT));
  await expect(cards(page)).toHaveCount(PAGE_SIZE);

  await page.getByLabel("Sırala").selectOption({ label: "İsim: A-Z" });
  await expect(cards(page).first()).toHaveText(title(1));
});

test("a price filter narrows the list, and scrolling continues within it", async ({ page }) => {
  // Prices are 10..300; 100 and up leaves products 10..30 = 21, one page.
  await page.goto(`/kategori/${slug}?price_min=100`);
  await expect(page.getByText("21 ürün", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(21);
  await expect(page.getByRole("link", { name: "Daha fazla göster" })).toHaveCount(0);
});

test("back from a product returns to the loaded list", async ({ page }) => {
  await page.goto(`/kategori/${slug}`);
  await scrollToEnd(page);
  await expect(cards(page)).toHaveCount(COUNT);

  await cards(page).last().click();
  await expect(page).toHaveURL(/\/urun\//);
  await page.goBack();

  await expect(page).toHaveURL(/page=2/);
  await expect(cards(page)).toHaveCount(COUNT);
});

test.describe("filters", () => {
  test("desktop shows the filter sidebar and a price filter narrows the list", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/kategori/${slug}`);
    await expect(page.getByLabel("Sadece stoktakiler")).toBeVisible();

    await expect(async () => {
      await page.getByPlaceholder("En az").fill("100");
      await page.getByRole("button", { name: "Uygula" }).click();
      await expect(page).toHaveURL(/price_min=100/, { timeout: 1000 });
    }).toPass();
    await expect(cards(page)).toHaveCount(21);
  });

  test("phone hides the filters behind the Filtrele toggle", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/kategori/${slug}`);
    await expect(page.getByLabel("Sadece stoktakiler")).toBeHidden();
    await page.getByText("Filtrele", { exact: true }).click();
    await expect(page.getByLabel("Sadece stoktakiler")).toBeVisible();
  });
});

test("while the next page loads, skeleton cards fill the grid instead of a text line", async ({
  page,
}) => {
  await page.route(/\/api\/store\/products\?.*page=2/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto(`/kategori/${slug}`);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);

  await scrollToEnd(page);
  const skeletons = page.locator("main [data-slot=skeleton]");
  await expect(skeletons.first()).toBeVisible();
  await expect(page.getByText("Ürünler yükleniyor…")).toHaveCount(0);
  await page.screenshot({ path: "test-results/skeleton.png" });

  await expect(cards(page)).toHaveCount(COUNT);
  await expect(skeletons).toHaveCount(0);
});

test("applying a sort shows skeleton cards in the listing until the new results arrive", async ({
  page,
}) => {
  await page.goto(`/kategori/${slug}`);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
  await page.route(/\/api\/store\/products\?.*sort=price_desc/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  const skeletons = page.locator("main [data-slot=skeleton]");
  await expect(async () => {
    await page.getByLabel("Sırala").selectOption({ label: "Fiyat: azalan" });
    await expect(page).toHaveURL(/sort=price_desc/, { timeout: 1000 });
  }).toPass();
  await expect(skeletons.first()).toBeVisible();
  // The filter panel stays put while the grid is replaced.
  await expect(page.getByLabel("Sadece stoktakiler")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await expect(cards(page).first()).toHaveText(title(COUNT));
  await expect(skeletons).toHaveCount(0);
});

test("server-rendered listings hydrate cleanly, deep links and filters included", async ({
  page,
}) => {
  for (const url of [
    `/kategori/${slug}`,
    `/kategori/${slug}?page=2`,
    `/kategori/${slug}?sort=price_desc&price_min=100`,
    "/ara",
    "/ara?q=Ürün",
  ]) {
    await page.goto(url);
    await expect(cards(page).first()).toBeVisible();
    await page.waitForTimeout(500); // let hydration run before the afterEach check
  }
});

test("opening a category from the menu shows the listing skeleton, not the generic loading bars", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Kategoriler", exact: true })).toBeVisible();
  await page.route(/\/api\/store\/categories\/[^/?]+/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await expect(async () => {
    await page
      .getByRole("navigation", { name: "Kategoriler", exact: true })
      .getByRole("link", { name: categoryName })
      .click({ timeout: 1000 });
    await expect(page).toHaveURL(/\/kategori\//, { timeout: 1000 });
  }).toPass();
  await expect(page.locator("main [data-slot=skeleton]").first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Yükleniyor" })).toHaveCount(0);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
});
