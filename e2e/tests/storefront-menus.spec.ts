import { expect, type Page, test } from "@playwright/test";
import { runDjangoScript } from "../support/stack";

// Store-frontend #2 / ADR 0007: the Storefront renders the Header and Footer Menus from the
// API, so the Owner's changes show without a deploy.
const run = Date.now().toString(36);
const n = {
  group: `Grup ${run}`,
  category: `Kategori ${run}`,
  override: `Özel Ad ${run}`,
  external: `Blog ${run}`,
  footerGroup: `Alt Grup ${run}`,
  footerLink: `Alt Bağlantı ${run}`,
  footerExternal: `Dış Alt ${run}`,
  later: `Sonradan ${run}`,
};
const externalUrl = `https://blog.example/${run}`;

test.beforeAll(() => {
  const out = runDjangoScript(`
from store_backend.services import catalog
from store_backend.shop.models import Menu, MenuItem
header = Menu.objects.get(key="header")
footer = Menu.objects.get(key="footer")
category = catalog.create_category(${JSON.stringify(n.category)})
group = MenuItem.objects.create(
    menu=header, position=920, target_type="group", label=${JSON.stringify(n.group)},
)
MenuItem.objects.create(
    menu=header, parent=group, position=0, target_type="category",
    category=category, label=${JSON.stringify(n.override)},
)
MenuItem.objects.create(
    menu=header, parent=group, position=1, target_type="url",
    url=${JSON.stringify(externalUrl)}, label=${JSON.stringify(n.external)},
)
column = MenuItem.objects.create(
    menu=footer, position=920, target_type="group", label=${JSON.stringify(n.footerGroup)},
)
MenuItem.objects.create(
    menu=footer, parent=column, position=0, target_type="url",
    url="/siparis-takip", label=${JSON.stringify(n.footerLink)},
)
MenuItem.objects.create(
    menu=footer, parent=column, position=1, target_type="url",
    url=${JSON.stringify(externalUrl)}, label=${JSON.stringify(n.footerExternal)},
)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
});

const bar = (page: Page) => page.getByRole("navigation", { name: "Kategoriler", exact: true });
const footer = (page: Page) => page.getByRole("navigation", { name: "Yasal bilgiler" });

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a group heading opens a panel without being a link; an external item opens a new tab", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = bar(page).getByRole("button", { name: n.group });
    await trigger.hover();

    // The heading links nowhere, so there is no "see all" link for it.
    await expect(page.getByRole("link", { name: `Tüm ${n.group}` })).toHaveCount(0);
    // The Owner's label override replaces the Category's own name; the link still goes there.
    const category = page.getByRole("link", { name: n.override, exact: true }).filter({ visible: true });
    await expect(category).toHaveAttribute("href", /\/kategori\//);
    const external = page.getByRole("link", { name: n.external, exact: true }).filter({ visible: true });
    await expect(external).toHaveAttribute("href", externalUrl);
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", /noopener/);
  });

  test("a change to the Menu shows on the Storefront without a deploy", async ({ page }) => {
    await page.goto("/");
    await expect(bar(page).getByRole("link", { name: n.later })).toHaveCount(0);

    const out = runDjangoScript(`
from store_backend.shop.models import Menu, MenuItem
MenuItem.objects.create(
    menu=Menu.objects.get(key="header"), position=930, target_type="url",
    url="/sepet", label=${JSON.stringify(n.later)},
)
print("ADDED")
`);
    if (!out.includes("ADDED")) throw new Error(out);

    await page.reload();
    await expect(bar(page).getByRole("link", { name: n.later })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the drawer shows the same tree as the desktop menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Kategoriler" }).click();
    const drawer = page.getByRole("dialog");

    await drawer.getByRole("button", { name: n.group }).click();
    await expect(drawer.getByRole("heading", { name: n.group })).toBeVisible();
    // A group heading has no "see all" link.
    await expect(drawer.getByRole("link", { name: `Tüm ${n.group}` })).toHaveCount(0);
    await expect(drawer.getByRole("link", { name: n.override, exact: true })).toBeVisible();
    const external = drawer.getByRole("link", { name: n.external, exact: true });
    await expect(external).toHaveAttribute("href", externalUrl);
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", /noopener/);
  });
});

test("the Footer shows a group heading as a column of its links", async ({ page }) => {
  await page.goto("/");
  const nav = footer(page);

  await expect(nav.getByRole("heading", { name: n.footerGroup })).toBeVisible();
  await expect(nav.getByRole("link", { name: n.footerLink })).toHaveAttribute("href", "/siparis-takip");
  const external = nav.getByRole("link", { name: n.footerExternal });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  // The seeded Footer still holds the Legal pages and Order tracking.
  await expect(nav.getByRole("link", { name: "Sipariş takibi" })).toBeVisible();
});
