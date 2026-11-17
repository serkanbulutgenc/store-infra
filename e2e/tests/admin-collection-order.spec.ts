import { expect, type Locator, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #20: reorder a Collection's Products by dragging (and from the keyboard), and the
// warning before an Owner publishes a version with no visible Product. The Owner is a Staff user
// holding the Owner's Collection permissions, since a real Owner needs TOTP.
const run = Date.now().toString(36);
const title = { a: `Aa Sıra ${run}`, b: `Bb Sıra ${run}`, c: `Cc Sıra ${run}`, draft: `Dd Taslak ${run}` };
const OWNER = ["manage_collections", "delete_catalogue"];

let ids: { a: number; b: number; c: number; draft: number };
let ordered: { id: number; slug: string };
let empty: { id: number };
let stocked: { id: number };

test.beforeAll(async ({ browser, baseURL }) => {
  const out = runDjangoScript(`
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

category = catalog.create_category("E2E Sıra ${run}")
colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Sarı ${run}`)}, "#ffcc00")

def make(name, published):
    product = catalog.create_product(
        title=name,
        product_class=ProductClass.objects.get(name="Giyim"),
        category=category,
        shelf_price="100.00",
    )
    catalog.create_variant(product, colour=colour, size="M", stock=5)
    if published:
        ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
    return product.id

ids = {
    "a": make(${JSON.stringify(title.a)}, True),
    "b": make(${JSON.stringify(title.b)}, True),
    "c": make(${JSON.stringify(title.c)}, True),
    "draft": make(${JSON.stringify(title.draft)}, False),
}
print("SEEDED " + json.dumps(ids))
`);
  const match = out.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(out);
  ids = JSON.parse(match[1]);

  const state = await loginState(browser, baseURL, seedStaff(OWNER));
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();
  const create = async (name: string, product_ids: number[]) => {
    const res = await page.request.post("/api/admin/collections", { data: { name, product_ids } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as { id: number; slug: string };
  };
  ordered = await create(`E2E Sıralı ${run}`, [ids.a, ids.b, ids.c]);
  empty = await create(`E2E Boş ${run}`, [ids.draft]);
  stocked = await create(`E2E Dolu ${run}`, [ids.a]);
  const published = await page.request.post(`/api/admin/collections/${ordered.id}/publish`);
  expect(published.status()).toBe(200);
  ownerState = await context.storageState();
  await context.close();
});

let ownerState: Awaited<ReturnType<typeof loginState>>;

test.use({ locale: "tr-TR" });
test.beforeEach(async ({ context }) => {
  await context.addCookies(ownerState.cookies);
});

const rows = (page: Page) => page.getByRole("list").filter({ has: page.getByRole("button", { name: /sürükle/ }) }).first().getByRole("listitem");
const handle = (page: Page, name: string) => page.getByRole("button", { name: `${name} sürükle` });
const order = async (page: Page) => (await rows(page).locator("span.truncate").allInnerTexts());

async function dragAbove(page: Page, name: string, target: Locator) {
  const from = (await handle(page, name).boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + 4, { steps: 12 });
  await page.mouse.up();
}

test.describe.configure({ mode: "serial" });

test("dragging a Product up changes the order, and saving shows it on the Storefront", async ({ page }) => {
  await page.goto(`/admin/collections/${ordered.id}`);
  await expect.poll(() => order(page)).toEqual([title.a, title.b, title.c]);

  await dragAbove(page, title.c, rows(page).first());
  await expect.poll(() => order(page)).toEqual([title.c, title.a, title.b]);

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Koleksiyon kaydedildi.").first()).toBeVisible();
  await page.reload();
  await expect.poll(() => order(page)).toEqual([title.c, title.a, title.b]);

  await page.goto(`/collections/${ordered.slug}`);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([title.c, title.a, title.b]);
});

test("a Product can be moved from the keyboard too", async ({ page }) => {
  await page.goto(`/admin/collections/${ordered.id}`);
  await expect.poll(() => order(page)).toEqual([title.c, title.a, title.b]);

  // Each key waits for the drag's own announcement: a key sent before the drag has started or
  // before the previous step has moved the item is lost, or lands twice.
  const live = page.getByRole("status").filter({ hasText: title.b });
  await handle(page, title.b).focus();
  await page.keyboard.press("Space");
  await expect(live).toContainText("3. sıraya taşınacak");
  await page.keyboard.press("ArrowUp");
  await expect(live).toContainText("2. sıraya taşınacak");
  await page.keyboard.press("Space");
  await expect(live).toContainText("2. sıraya bırakıldı");
  await expect.poll(() => order(page)).toEqual([title.c, title.b, title.a]);
});

test("the Owner is warned before publishing a Collection with no visible Product", async ({ page }) => {
  await page.goto(`/admin/collections/${empty.id}`);
  await expect(page.getByRole("button", { name: "Yayınla" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "görünen ürün yok" })).toBeVisible();

  // A draft with a published Product can be published without a warning.
  await page.goto(`/admin/collections/${stocked.id}`);
  await expect(page.getByRole("button", { name: "Yayınla" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "görünen ürün yok" })).toHaveCount(0);
});
