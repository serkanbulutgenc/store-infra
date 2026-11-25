import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner, seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #164: the Homepage layout. The default layout reproduces today's home page; the
// Owner adds, hides and reorders a section and it goes live at once; a Staff edit waits for the
// Owner, who approves it in the queue; the Owner can restore an earlier version from the history.
// The layout is one row for the whole shop, so the spec puts the default back before and after,
// or it would change every Storefront spec that runs later.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const TITLE = `Vitrin ${run}`;

type State = Awaited<ReturnType<typeof loginState>>;
let ownerState: State;
let staffState: State;

const RESET = `
from store_backend.services import homepage
from store_backend.staff.models import PendingChange

layout = homepage.get()
layout.sections = homepage.default_sections()
layout.rejection_reason = ""
layout.save()
PendingChange.objects.filter(
    object_id=layout.pk, content_type__model="homepagelayout"
).delete()
print("RESET")
`;

function resetLayout() {
  const out = runDjangoScript(RESET);
  if (!out.includes("RESET")) throw new Error(out);
}

test.beforeAll(async ({ browser, baseURL }) => {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour("Vit ${run}", "#445566")
category = catalog.create_category("Vitrin ${run}")
for i in range(5):
    product = catalog.create_product(
        title=f"Vitrin Ürün ${run} {i}",
        product_class=ProductClass.objects.get(name="Giyim"),
        category=category,
        shelf_price="100.00",
    )
    catalog.create_variant(product, colour=colour, size="M", stock=5)
    ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
  resetLayout();
  ownerState = await loginState(browser, baseURL, seedOwner());
  staffState = await loginState(browser, baseURL, seedStaff());
});

test.afterAll(() => {
  resetLayout();
});

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true }).first();

/** The Storefront is cached for a moment, so look again until the change shows (or does not). */
async function homeShows(page: Page, name: string, shown: boolean) {
  await expect(async () => {
    await page.goto("/");
    await expect(heading(page, name)).toHaveCount(shown ? 1 : 0, { timeout: 2000 });
  }).toPass();
}

const rowOf = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name}: ayarlar` }).first();

async function top(page: Page, name: string) {
  const box = await rowOf(page, name).boundingBox();
  if (!box) throw new Error(`${name} is not on screen`);
  return box.y;
}

test("the default layout is today's home page, in the Dashboard and on the Storefront", async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await owner.newPage();

  await page.goto("/admin/homepage");
  await expect(page.getByRole("heading", { name: "Vitrin", exact: true })).toBeVisible();
  for (const name of ["Slayt", "Son baktıklarınız", "Yeni gelenler", "Kategoriler"]) {
    await expect(rowOf(page, name)).toBeVisible();
  }
  // Top to bottom: the new arrivals come before the categories.
  expect(await top(page, "Yeni gelenler")).toBeLessThan(await top(page, "Kategoriler"));

  await page.goto("/");
  await expect(heading(page, "Yeni gelenler")).toBeVisible();
  await owner.close();
});

test("the Owner adds, hides and reorders a section and it goes live", async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await owner.newPage();
  await page.goto("/admin/homepage");

  // Hide the new arrivals first, while that name is still only on one section.
  await page.getByRole("button", { name: "Yeni gelenler: gizle" }).click();
  await expect(page.getByRole("button", { name: "Yeni gelenler: göster" })).toBeVisible();

  // Add a product list and name it.
  await page.getByLabel("Bölüm türü").selectOption({ label: "Ürünler" });
  await page.getByRole("button", { name: "Yeni gelenler: ayarlar" }).last().click();
  await page.getByLabel("Başlık", { exact: true }).fill(TITLE);
  await expect(rowOf(page, TITLE)).toBeVisible();

  // It was added at the bottom, under the categories; move it up one place.
  expect(await top(page, TITLE)).toBeGreaterThan(await top(page, "Kategoriler"));
  await page.getByRole("button", { name: `${TITLE}: yukarı taşı` }).click();
  expect(await top(page, TITLE)).toBeLessThan(await top(page, "Kategoriler"));

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Vitrin kaydedildi ve yayında.").first()).toBeVisible();

  // The Storefront shows the new section and no longer the hidden one.
  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  const home = await shopper.newPage();
  await homeShows(home, TITLE, true);
  await homeShows(home, "Yeni gelenler", false);
  await shopper.close();

  // The order and the hidden state are what was saved.
  await page.reload();
  expect(await top(page, TITLE)).toBeLessThan(await top(page, "Kategoriler"));
  await expect(page.getByRole("button", { name: "Yeni gelenler: göster" })).toBeVisible();
  await owner.close();
});

test("a Staff change waits for the Owner, who approves it in the queue", async ({
  browser,
  baseURL,
}) => {
  const staff = await browser.newContext({ baseURL, storageState: staffState, locale: "tr-TR" });
  const sp = await staff.newPage();
  await sp.goto("/admin/homepage");
  await sp.getByRole("button", { name: `${TITLE}: gizle` }).click();
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(
    sp.getByText("Değişiklik onaya gönderildi. Sahip onaylayınca yayına çıkar.").first(),
  ).toBeVisible();
  await expect(sp.getByText("Gönderdiğiniz değişiklik onay bekliyor.")).toBeVisible();
  await staff.close();

  // Nothing changed for Shoppers while it waits.
  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  const home = await shopper.newPage();
  await home.goto("/");
  await expect(heading(home, TITLE)).toBeVisible();

  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const op = await owner.newPage();
  await op.goto("/admin/approvals");
  await op.getByRole("button", { name: "Vitrin düzeni incele" }).click();
  await op.getByRole("button", { name: "Onayla" }).click();
  await expect(op.getByText("Onaylandı.").first()).toBeVisible();

  await homeShows(home, TITLE, false);
  await shopper.close();

  await op.goto("/admin/homepage");
  await expect(op.getByRole("button", { name: `${TITLE}: göster` })).toBeVisible();
  await owner.close();
});

test("the Owner restores an earlier version from the history", async ({ browser, baseURL }) => {
  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await owner.newPage();
  await page.goto("/admin/homepage");

  await expect(page.getByRole("heading", { name: "Geçmiş" })).toBeVisible();
  await expect(page.getByText(/^· yayında$/)).toBeVisible();

  // The newest version is live; the one before it is the layout where the section was shown.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Geri yükle" }).first().click();
  await expect(page.getByText(/geri yüklendi ve yayında/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: `${TITLE}: gizle` })).toBeVisible();

  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  await homeShows(await shopper.newPage(), TITLE, true);
  await shopper.close();
  await owner.close();
});
