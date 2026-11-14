import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Ticket 73: the shared delete dialog on Brands, Suppliers, Colours, Products and Variants.
const run = Date.now().toString(36);
const n = {
  brandUsed: `Marka Dolu ${run}`,
  brandFree: `Marka Boş ${run}`,
  supplierFree: `Tedarikçi Boş ${run}`,
  colourUsed: `Renk Dolu ${run}`,
  colourFree: `Renk Boş ${run}`,
  product: `Ürün Silinecek ${run}`,
  productKept: `Ürün Kalacak ${run}`,
};

function seed() {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.services import catalog

cls = ProductClass.objects.get(name="Giyim")
category = catalog.create_category("E2E Sil ${run}")
brand = catalog.create_brand(${JSON.stringify(n.brandUsed)})
catalog.create_brand(${JSON.stringify(n.brandFree)})
catalog.create_supplier(${JSON.stringify(n.supplierFree)}, "S${run}")
used = catalog.create_colour(${JSON.stringify(n.colourUsed)}, "#112233")
catalog.create_colour(${JSON.stringify(n.colourFree)}, "#445566")
kept = catalog.create_product(title=${JSON.stringify(n.productKept)}, product_class=cls,
    category=category, shelf_price="100.00", brand=brand)
catalog.create_variant(kept, colour=used, size="M", stock=2)
catalog.create_variant(kept, colour=used, size="L", stock=2)
catalog.create_product(title=${JSON.stringify(n.product)}, product_class=cls,
    category=category, shelf_price="100.00")
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

const OWNER = [
  "delete_catalogue",
  "manage_brands",
  "manage_suppliers",
  "manage_colours",
  "manage_products",
  "archive_products",
];
const dialog = (page: Page) => page.getByRole("dialog");
const confirm = (page: Page) =>
  dialog(page).getByRole("button", { name: "Sil", exact: true }).click();
const del = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name} sil`, exact: true });

test.describe("Owner", () => {
  useStaffLogin(OWNER, seed);

  test("a Brand in use is refused with the reason, a free one is deleted", async ({ page }) => {
    await page.goto("/admin/brands");
    await del(page, n.brandUsed).click();
    await confirm(page);
    await expect(dialog(page).getByRole("alert")).toContainText("ürün");
    await dialog(page).getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText(n.brandUsed)).toBeVisible();

    await del(page, n.brandFree).click();
    await confirm(page);
    await expect(page.getByText("Silindi.")).toBeVisible();
    await expect(page.getByText(n.brandFree)).toHaveCount(0);
  });

  test("a Supplier is deleted", async ({ page }) => {
    await page.goto("/admin/suppliers");
    await del(page, n.supplierFree).click();
    await confirm(page);
    await expect(page.getByText(n.supplierFree)).toHaveCount(0);
  });

  test("a Colour in use offers Pasifleştir; a free one is deleted", async ({ page }) => {
    await page.goto("/admin/colours");
    await del(page, n.colourUsed).click();
    await confirm(page);
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Pasifleştir" }).click();
    await expect(page.getByText("Renk pasifleştirildi.")).toBeVisible();
    await expect(page.locator("tr", { hasText: n.colourUsed })).toContainText("Pasif");

    await del(page, n.colourFree).click();
    await confirm(page);
    await expect(page.getByText(n.colourFree)).toHaveCount(0);
  });

  test("a Product is deleted from the list", async ({ page }) => {
    await page.goto(`/admin/products?q=${encodeURIComponent(n.product)}`);
    await del(page, n.product).click();
    await expect(dialog(page)).toContainText(n.product);
    await confirm(page);
    await expect(page.getByText("Ürün silindi.")).toBeVisible();
    await expect(page.getByText(n.product, { exact: true })).toHaveCount(0);
  });

  test("a Variant is deleted from the editor", async ({ page }) => {
    await page.goto(`/admin/products?q=${encodeURIComponent(n.productKept)}`);
    await page.getByRole("link", { name: n.productKept }).click();
    await page.getByRole("tab", { name: /Varyantlar/ }).click();
    await del(page, `${n.colourUsed} / L`).click();
    await confirm(page);
    await expect(page.getByText("Varyant silindi.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "L", exact: true })).toHaveCount(0);
  });
});

test.describe("Staff", () => {
  useStaffLogin(["manage_brands", "manage_suppliers", "manage_colours", "manage_products"]);

  test("have no delete buttons", async ({ page }) => {
    for (const path of ["/admin/brands", "/admin/suppliers", "/admin/colours", "/admin/products"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: /^.* sil$/ })).toHaveCount(0);
    }
  });
});
