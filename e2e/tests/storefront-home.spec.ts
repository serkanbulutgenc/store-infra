import { expect, type Page, test } from "@playwright/test";
import { runDjangoScript } from "../support/stack";

const run = Date.now().toString(36);
const title = (i: number) => `Ana Sayfa ${run} ${i}`;
const COUNT = 6;
const saleTitle = title(COUNT - 1); // the newest product, so it leads every rail

test.beforeAll(() => {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour("Ana ${run}", "#123456")
category = catalog.create_category("Ana Sayfa ${run}")
for i in range(${COUNT}):
    product = catalog.create_product(
        title=f"Ana Sayfa ${run} {i}",
        product_class=ProductClass.objects.get(name="Giyim"),
        category=category,
        shelf_price="80.00" if i == ${COUNT - 1} else "100.00",
        old_price="100.00" if i == ${COUNT - 1} else None,
    )
    catalog.create_variant(product, colour=colour, size="M", stock=5)
    ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
});

const rail = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const hero = (page: Page) => page.getByRole("region", { name: "Öne çıkan ürünler" });

test.use({ viewport: { width: 1280, height: 800 } });

test("the featured slider shows the newest product and a thumbnail picks another slide", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(hero(page).getByText(saleTitle).first()).toBeVisible();

  const thumbs = hero(page).getByRole("button", { name: /^Ana Sayfa/ });
  await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
  await thumbs.nth(1).click();
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(thumbs.first()).toHaveAttribute("aria-current", "false");
});

test("the slider arrows move between slides", async ({ page }) => {
  await page.goto("/");
  const thumbs = hero(page).getByRole("button", { name: /^Ana Sayfa/ });
  // The slider paints before it hydrates, and a click before that does nothing: click again
  // until the slide moves.
  await expect(async () => {
    await hero(page).getByRole("button", { name: "Sonraki" }).click();
    await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 1500 });
  }).toPass();
  await hero(page).getByRole("button", { name: "Önceki" }).click();
  await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
});

test("the on-sale rail lists the discounted product with its percentage", async ({ page }) => {
  await page.goto("/");
  const sale = rail(page, "İndirimdekiler");
  await expect(sale.getByRole("link", { name: new RegExp(saleTitle) })).toBeVisible();
  const card = sale.getByRole("listitem").filter({ hasText: saleTitle });
  await expect(card.getByText("%20")).toBeVisible();
  // Only discounted products are in it.
  await expect(sale.getByRole("link", { name: new RegExp(title(0)) })).toHaveCount(0);
});

test("a rail pages with its side arrows and has no scrollbar", async ({ page }) => {
  await page.goto("/");
  const latest = rail(page, "Yeni gelenler");
  const prev = latest.getByRole("button", { name: "Önceki" });
  const next = latest.getByRole("button", { name: "Sonraki" });

  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(prev).toBeEnabled();
  await prev.click();
  await expect(prev).toBeDisabled();

  // Embla moves a transform inside a clipped box: nothing for the browser to draw a bar on.
  const viewport = latest.locator("div.overflow-hidden").first();
  await expect(viewport).toHaveCSS("overflow-x", "hidden");
});

test("a rail can be dragged with the mouse", async ({ page }) => {
  await page.goto("/");
  const latest = rail(page, "Yeni gelenler");
  await latest.scrollIntoViewIfNeeded();
  const track = latest.locator("ul");
  const viewport = latest.locator("div.overflow-hidden").first();
  const box = await viewport.boundingBox();
  const before = (await track.boundingBox())?.x ?? 0;
  if (!box) throw new Error("rail has no box");
  const y = box.y + 80;
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await track.boundingBox())?.x ?? before).toBeLessThan(before);
});

test("see all on the on-sale rail opens the search filtered to sale items", async ({ page }) => {
  await page.goto("/");
  await rail(page, "İndirimdekiler").getByRole("link", { name: "Tümünü gör" }).click();
  await expect(page).toHaveURL(/on_sale=true/);
  await expect(page.getByRole("link", { name: new RegExp(saleTitle) }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(title(0)) })).toHaveCount(0);
});

/** The banner is a Store setting; it changes the shop-wide row, so every test puts it back. */
function setBanner(image: string, link: string, alt: string) {
  const out = runDjangoScript(`
from store_backend.shop.models import StoreSettings
StoreSettings.objects.update(
    banner_image_url=${JSON.stringify(image)},
    banner_link=${JSON.stringify(link)},
    banner_alt=${JSON.stringify(alt)},
)
print("BANNER SET")
`);
  if (!out.includes("BANNER SET")) throw new Error(out);
}

test.describe("banner", () => {
  test.afterAll(() => setBanner("", "", ""));

  test("a banner set in the Store settings shows above the slider and links on", async ({
    page,
  }) => {
    setBanner("/e2e-banner.png", "/sepet", `Sonbahar ${run}`);
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Duyuru" });
    await expect(banner.getByRole("img", { name: `Sonbahar ${run}` })).toHaveAttribute(
      "src",
      "/e2e-banner.png",
    );
    // Above the slider.
    const [b, h] = await Promise.all([banner.boundingBox(), hero(page).boundingBox()]);
    expect((b?.y ?? 1e9) < (h?.y ?? 0)).toBe(true);
    await banner.getByRole("link").click();
    await expect(page).toHaveURL(/\/sepet$/);
  });

  test("an external link opens in a new tab", async ({ page }) => {
    setBanner("/e2e-banner.png", "https://example.com/kampanya", `Dış ${run}`);
    await page.goto("/");
    const link = page.getByRole("region", { name: "Duyuru" }).getByRole("link");
    await expect(link).toHaveAttribute("href", "https://example.com/kampanya");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("without a banner image nothing is drawn", async ({ page }) => {
    setBanner("", "/sepet", "unused");
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Duyuru" })).toHaveCount(0);
    await expect(hero(page).getByText(saleTitle).first()).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the page never scrolls sideways and rails still page", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const latest = rail(page, "Yeni gelenler");
    await latest.scrollIntoViewIfNeeded();
    await expect(latest.getByRole("button", { name: "Sonraki" })).toBeEnabled();
  });
});
