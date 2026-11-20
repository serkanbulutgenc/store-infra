import { expect, type Locator, type Page, test } from "@playwright/test";
import { type SimilarSeed, seedSimilarShop } from "../support/seed";

// The "Benzer ürünler" rail of the product page (GLOSSARY: Similar products). One Category holds
// the current Product, one of its Brand, two others, a sold-out and a draft Product.
let shop: SimilarSeed;

test.beforeAll(() => {
  shop = seedSimilarShop();
});

const rail = (page: Page) => page.getByRole("region", { name: "Benzer ürünler" });

/** The Product slugs a rail links to, in order. */
async function slugsIn(rail: Locator) {
  const hrefs = await rail.locator('a[href^="/urun/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  return [...new Set(hrefs)].map((h) => h.replace("/urun/", ""));
}

test("the rail ranks the same Brand first and leaves out the page's Product, a sold-out one and a draft", async ({
  page,
}) => {
  await page.goto(`/urun/${shop.current.slug}`);
  await expect(rail(page)).toBeVisible();

  const slugs = await slugsIn(rail(page));
  expect(slugs[0]).toBe(shop.sameBrand.slug);
  expect([...slugs].sort()).toEqual([shop.sameBrand.slug, ...shop.others.map((p) => p.slug)].sort());
  for (const left of [shop.current, shop.soldOut, shop.draft]) expect(slugs).not.toContain(left.slug);
});

test("the rail sits below the tabs", async ({ page }) => {
  await page.goto(`/urun/${shop.current.slug}`);
  const tabs = await page.getByRole("tablist").first().boundingBox();
  const heading = await rail(page).getByRole("heading", { name: "Benzer ürünler" }).boundingBox();

  expect(tabs).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(heading?.y).toBeGreaterThan((tabs?.y ?? 0) + (tabs?.height ?? 0));
});

test("the links are in the server's HTML, so crawlers see them", async ({ page }) => {
  const html = await (await page.request.get(`/urun/${shop.current.slug}`)).text();

  expect(html).toContain("Benzer ürünler");
  expect(html).toContain(`href="/urun/${shop.sameBrand.slug}"`);
  expect(html).not.toContain(`href="/urun/${shop.draft.slug}"`);
});

test("the quick view of a card shows no Similar products", async ({ page }) => {
  await page.goto(`/urun/${shop.current.slug}`);
  const card = rail(page).getByRole("listitem").filter({ hasText: shop.sameBrand.title });
  await card.hover();
  await card.getByRole("button", { name: "Hızlı bakış" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(shop.sameBrand.title).first()).toBeVisible();
  await expect(dialog.getByText("Benzer ürünler")).toHaveCount(0);
});

test("a Product with nothing similar has no block at all", async ({ page }) => {
  await page.goto(`/urun/${shop.lonely.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: shop.lonely.title })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Benzer ürünler" })).toHaveCount(0);
  const html = await (await page.request.get(`/urun/${shop.lonely.slug}`)).text();
  expect(html).not.toContain("Benzer ürünler");
});
