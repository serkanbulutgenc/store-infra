import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Store-backend #11 / ADR 0007: a Category, Brand or Product that a Menu item points at
// cannot be deleted. The dialog names the Menu items; the Owner removes the item first.
const run = Date.now().toString(36);
const n = {
  category: `Menü Kategori ${run}`,
  brand: `Menü Marka ${run}`,
  product: `Menü Ürün ${run}`,
  productCategory: `Menü Ürün Kategori ${run}`,
};

const OWNER = [
  "delete_catalogue",
  "restructure_categories",
  "manage_brands",
  "manage_products",
  "archive_products",
];

function seed() {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.services import catalog
from store_backend.shop.models import Menu, MenuItem

header = Menu.objects.get(key="header")
category = catalog.create_category(${JSON.stringify(n.category)})
brand = catalog.create_brand(${JSON.stringify(n.brand)})
product = catalog.create_product(
    title=${JSON.stringify(n.product)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=catalog.create_category(${JSON.stringify(n.productCategory)}),
    shelf_price="100.00",
)
MenuItem.objects.create(menu=header, position=900, target_type="category", category=category)
MenuItem.objects.create(menu=header, position=901, target_type="brand", brand=brand)
MenuItem.objects.create(menu=header, position=902, target_type="product", product=product)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

/** The Owner removes the Menu item from the Menu (there is no Dashboard builder yet). */
function removeMenuItem(kind: "category" | "brand" | "product", title: string) {
  const field = kind === "product" ? "product__title" : `${kind}__name`;
  const out = runDjangoScript(`
from store_backend.shop.models import MenuItem
print("REMOVED", MenuItem.objects.filter(**{"${field}": ${JSON.stringify(title)}}).delete()[0])
`);
  if (!out.includes("REMOVED 1")) throw new Error(out);
}

const dialog = (page: Page) => page.getByRole("dialog");
const del = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name} sil`, exact: true });
/** The Product editor hydrates after it paints: an early click does nothing, and a dialog opened
 * before hydration can be thrown away by it. Retry opening it until it holds `text`. */
const openDelete = (page: Page, name: string, text?: string | RegExp) =>
  expect(async () => {
    await del(page, name).click();
    await expect(dialog(page)).toBeVisible({ timeout: 1500 });
    if (text) await expect(dialog(page)).toContainText(text, { timeout: 1500 });
  }).toPass();
const confirm = (page: Page) =>
  dialog(page).getByRole("button", { name: "Sil", exact: true }).click();

test.describe("Owner", () => {
  useStaffLogin(OWNER, seed);

  test("a Category in a Menu is refused until its Menu item is removed", async ({ page }) => {
    await page.goto("/admin/categories");
    await del(page, n.category).click();
    await expect(dialog(page)).toContainText("1 menü öğesi");
    await confirm(page);
    await expect(dialog(page).getByRole("alert")).toContainText("1 menü öğesi");
    await dialog(page).getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText(n.category, { exact: true })).toBeVisible();

    removeMenuItem("category", n.category);
    await page.reload();
    await del(page, n.category).click();
    await expect(dialog(page)).not.toContainText("menü öğesi");
    await confirm(page);
    await expect(page.getByText("Kategori silindi.")).toBeVisible();
    await expect(page.getByText(n.category, { exact: true })).toHaveCount(0);
  });

  test("a Brand in a Menu is refused until its Menu item is removed", async ({ page }) => {
    await page.goto("/admin/brands");
    await del(page, n.brand).click();
    await expect(dialog(page)).toContainText("1 menü öğesi");
    await confirm(page);
    await expect(dialog(page).getByRole("alert")).toContainText("1 menü öğesi");
    await dialog(page).getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText(n.brand)).toBeVisible();

    removeMenuItem("brand", n.brand);
    await page.reload();
    await del(page, n.brand).click();
    await confirm(page);
    await expect(page.getByText("Silindi.")).toBeVisible();
    await expect(page.getByText(n.brand)).toHaveCount(0);
  });

  test("a Product in a Menu is refused until its Menu item is removed", async ({ page }) => {
    await page.goto(`/admin/products?q=${encodeURIComponent(n.product)}`);
    await page.getByRole("link", { name: n.product }).click();
    await openDelete(page, n.product, "1 menü öğesi");
    await confirm(page);
    await expect(dialog(page).getByRole("alert")).toContainText("1 menü öğesi");
    await dialog(page).getByRole("button", { name: "Vazgeç" }).click();

    removeMenuItem("product", n.product);
    await page.reload();
    await openDelete(page, n.product);
    await expect(dialog(page)).not.toContainText("menü öğesi");
    await confirm(page);
    await expect(page).toHaveURL(/\/admin\/products(\?|$)/);
    await page.goto(`/admin/products?q=${encodeURIComponent(n.product)}`);
    await expect(page.getByText(n.product, { exact: true })).toHaveCount(0);
  });
});
