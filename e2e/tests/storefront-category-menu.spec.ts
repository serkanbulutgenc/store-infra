import { expect, type Page, test } from "@playwright/test";
import { runDjangoScript } from "../support/stack";

const run = Date.now().toString(36);
const n = {
  root: `Menü ${run}`,
  plain: `Düz ${run}`,
  withImage: `Resimli ${run}`,
  noImage: `Resimsiz ${run}`,
  leaf: `Yaprak ${run}`,
  hidden: `Gizli ${run}`,
};
const thumbName = `categories/e2e-${run}-400.webp`;

test.beforeAll(() => {
  const out = runDjangoScript(`
from store_backend.catalog.models import CategoryProfile
from store_backend.services import catalog
root = catalog.create_category(${JSON.stringify(n.root)})
catalog.create_category(${JSON.stringify(n.plain)})
with_image = catalog.create_category(${JSON.stringify(n.withImage)}, root)
catalog.create_category(${JSON.stringify(n.noImage)}, root)
catalog.create_category(${JSON.stringify(n.leaf)}, with_image)
CategoryProfile.objects.filter(category=with_image).update(
    image_status=CategoryProfile.ImageStatus.READY,
    image_derivatives=[{"name": ${JSON.stringify(thumbName)}, "width": 400}],
)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
});

const bar = (page: Page) => page.getByRole("navigation", { name: "Kategoriler", exact: true });
const card = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true }).filter({ visible: true });

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hover opens a panel of sub-category cards with thumbnails and children", async ({
    page,
  }) => {
    await page.goto("/");
    await bar(page).getByRole("button", { name: n.root }).hover();

    await expect(page.getByRole("link", { name: `Tüm ${n.root}` })).toBeVisible();
    // A ready image shows its 400 px thumbnail; the image is decorative (empty alt).
    const withImage = card(page, n.withImage);
    await expect(withImage).toBeVisible();
    await expect(withImage.locator("img")).toHaveAttribute("src", new RegExp(thumbName));
    await expect(withImage.locator("img")).toHaveAttribute("alt", "");
    // A category without an image keeps its card, with a tile instead of a picture.
    const noImage = card(page, n.noImage);
    await expect(noImage).toBeVisible();
    await expect(noImage.locator("img")).toHaveCount(0);
    // The third level is a plain link under its card.
    await expect(card(page, n.leaf)).toBeVisible();
  });

  test("a card goes to its category page and closes the panel", async ({ page }) => {
    await page.goto("/");
    await bar(page).getByRole("button", { name: n.root }).hover();
    await card(page, n.withImage).click();

    await expect(page).toHaveURL(/\/kategori\//);
    await expect(page.getByRole("heading", { name: n.withImage, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: `Tüm ${n.root}` })).toBeHidden();
  });

  test("works from the keyboard: Enter opens, Escape closes", async ({ page }) => {
    await page.goto("/");
    const trigger = bar(page).getByRole("button", { name: n.root });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(card(page, n.withImage)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(card(page, n.withImage)).toBeHidden();
  });

  test("a category without children is a plain link", async ({ page }) => {
    await page.goto("/");
    const link = bar(page).getByRole("link", { name: n.plain });
    await expect(link).toBeVisible();
    await expect(bar(page).getByRole("button", { name: n.plain })).toHaveCount(0);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the hamburger opens a drawer that drills down and back", async ({ page }) => {
    await page.goto("/");
    // The desktop bar is hidden below lg.
    await expect(bar(page)).toBeHidden();

    await page.getByRole("button", { name: "Kategoriler" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: n.plain })).toBeVisible();

    await drawer.getByRole("button", { name: n.root }).click();
    await expect(drawer.getByRole("heading", { name: n.root })).toBeVisible();
    await expect(drawer.getByRole("link", { name: `Tüm ${n.root}` })).toBeVisible();
    await expect(drawer.getByRole("button", { name: n.withImage })).toBeVisible();
    await expect(drawer.getByRole("link", { name: n.noImage })).toBeVisible();

    await drawer.getByRole("button", { name: "Geri" }).click();
    await expect(drawer.getByRole("button", { name: n.root })).toBeVisible();

    await drawer.getByRole("link", { name: n.plain }).click();
    await expect(page).toHaveURL(/\/kategori\//);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
