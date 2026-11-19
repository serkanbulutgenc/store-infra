import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { solidPng } from "../support/images";
import { runDjangoScript } from "../support/stack";

// A Brand's optional logo: uploaded in the Brand dialog, shown on the Storefront beside the
// Brand name (product page, filter panel) once it is ready, and gone again when removed.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const seeded = { brand: `E2E Marka ${run}`, product: `E2E Logolu ${run}` };
const created = `E2E Yeni Marka ${run}`;
const createdWithLogo = `E2E Logolu Marka ${run}`;

function seed() {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

brand = catalog.create_brand(${JSON.stringify(seeded.brand)})
colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Gri ${run}`)}, "#888888")
product = catalog.create_product(
    title=${JSON.stringify(seeded.product)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=catalog.create_category("E2E Logo ${run}"),
    shelf_price="100.00",
    brand=brand,
)
catalog.create_variant(product, colour=colour, size="M", stock=5)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

useStaffLogin(["manage_brands", "manage_products"], seed);

const logo = (colour: [number, number, number] = [200, 30, 30]) => ({
  name: "logo.png",
  mimeType: "image/png",
  buffer: solidPng(300, 200, colour),
});
const dialog = (page: Page) => page.getByRole("dialog");
const row = (page: Page, name: string) => page.locator("tr", { hasText: name });
const pick = (page: Page, file: ReturnType<typeof logo> | object) =>
  dialog(page).getByLabel("Logo dosyası seç").setInputFiles(file as never);
const save = (page: Page) => dialog(page).getByRole("button", { name: "Kaydet" }).click();

async function openProduct(page: Page) {
  await page.goto("/ara");
  await page.getByRole("link", { name: new RegExp(seeded.product) }).first().click();
  await expect(page.getByRole("heading", { name: seeded.product })).toBeVisible();
}

test("a Brand has no logo until one is uploaded: the storefront looks as before", async ({
  page,
}) => {
  await openProduct(page);
  await expect(page.getByText(seeded.brand, { exact: true })).toBeVisible();
  await expect(page.locator("p", { hasText: seeded.brand }).locator("img")).toHaveCount(0);
});

test("a logo is uploaded in the dialog, processed, and shown in the list", async ({ page }) => {
  await page.goto("/admin/brands");
  await row(page, seeded.brand).getByRole("button", { name: "Düzenle" }).click();
  await pick(page, logo());
  await save(page);
  await expect(page.getByText("Kaydedildi.")).toBeVisible();
  // The list refreshes while the logo is processing, then shows it.
  await expect(row(page, seeded.brand).locator("img")).toHaveAttribute("src", /\/media\/brands\//, {
    timeout: 30_000,
  });
});

test("the storefront shows the logo beside the Brand name, on the product page and in the filter", async ({
  page,
}) => {
  await openProduct(page);
  const mark = page.locator("p", { hasText: seeded.brand }).locator("img");
  await expect(mark).toHaveAttribute("src", /\/media\/brands\/.+\.webp/);
  await expect
    .poll(() => mark.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await page.goto("/ara");
  const facet = page.locator("label", { hasText: seeded.brand });
  await expect(facet.locator("img")).toHaveAttribute("src", /\/media\/brands\//);
});

test("a wrong file is refused in the dialog and nothing changes", async ({ page }) => {
  await page.goto("/admin/brands");
  await row(page, seeded.brand).getByRole("button", { name: "Düzenle" }).click();
  await pick(page, {
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>'),
  });
  await expect(dialog(page).getByRole("alert")).toContainText("PNG, JPEG veya WebP");
  await pick(page, { name: "buyuk.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(dialog(page).getByRole("alert")).toContainText("2 MB");
  await dialog(page).getByRole("button", { name: "Vazgeç" }).click();
  await expect(row(page, seeded.brand).locator("img")).toHaveAttribute("src", /\/media\/brands\//);
});

test("a too-small logo is refused by the server; the Brand stays saved", async ({ page }) => {
  await page.goto("/admin/brands");
  await page.getByRole("button", { name: "Yeni marka" }).click();
  await dialog(page).getByLabel("Ad").fill(created);
  await pick(page, { name: "kucuk.png", mimeType: "image/png", buffer: solidPng(100, 100, [0, 0, 0]) });
  await save(page);
  await expect(page.getByText(/Kaydedildi, ancak logo güncellenemedi/)).toBeVisible();
  await expect(row(page, created)).toBeVisible();
  await expect(row(page, created).locator("img")).toHaveCount(0);
});

test("a logo can be added later to a Brand whose first upload failed", async ({ page }) => {
  await page.goto("/admin/brands");
  await row(page, created).getByRole("button", { name: "Düzenle" }).click();
  await pick(page, logo([30, 30, 200]));
  await save(page);
  await expect(row(page, created).locator("img")).toHaveAttribute("src", /\/media\/brands\//, {
    timeout: 30_000,
  });
});

test("a new Brand is created with its logo in one Save", async ({ page }) => {
  await page.goto("/admin/brands");
  await page.getByRole("button", { name: "Yeni marka" }).click();
  await dialog(page).getByLabel("Ad").fill(createdWithLogo);
  await pick(page, logo());
  await save(page);
  await expect(page.getByText("Kaydedildi.")).toBeVisible();
  await expect(row(page, createdWithLogo).locator("img")).toHaveAttribute(
    "src",
    /\/media\/brands\//,
    { timeout: 30_000 },
  );
});

test("removing the logo brings the storefront back to the plain name", async ({ page }) => {
  await page.goto("/admin/brands");
  await row(page, seeded.brand).getByRole("button", { name: "Düzenle" }).click();
  await dialog(page).getByRole("button", { name: "Kaldır" }).click();
  await save(page);
  await expect(page.getByText("Kaydedildi.")).toBeVisible();
  await expect(row(page, seeded.brand).locator("img")).toHaveCount(0);

  await openProduct(page);
  await expect(page.locator("p", { hasText: seeded.brand }).locator("img")).toHaveCount(0);
  await expect(page.getByText(seeded.brand, { exact: true })).toBeVisible();
});
