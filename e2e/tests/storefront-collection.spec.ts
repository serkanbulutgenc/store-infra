import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Store-infra #25 (follow-up to #19): the Collection page and its Menu target through the real
// stack. The Owner (a Staff user holding the Owner's Collection and Menu permissions, since a
// real Owner needs TOTP) works through the Dashboard API; the Storefront is read as a visitor.
const run = Date.now().toString(36);
const n = {
  name: `E2E Koleksiyon ${run}`,
  description: `Yaz seçkisi ${run}`,
  first: `Zeta Elbise ${run}`,
  soldOut: `Alfa Elbise ${run}`,
  draft: `Taslak Elbise ${run}`,
};

const OWNER = ["edit_collections", "manage_collections", "manage_menus", "delete_catalogue"];

interface Seeded {
  ids: { first: number; soldOut: number; draft: number };
}
let products: Seeded["ids"];
let collection: { id: number; slug: string };

/** Two published Products (one sold out) and one draft, as the Dashboard would leave them. */
function seedProducts(): Seeded["ids"] {
  const out = runDjangoScript(`
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

category = catalog.create_category("E2E Koleksiyon ${run}")
colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Bordo ${run}`)}, "#800020")

def make(title, stock, published):
    product = catalog.create_product(
        title=title,
        product_class=ProductClass.objects.get(name="Giyim"),
        category=category,
        shelf_price="100.00",
    )
    catalog.create_variant(product, colour=colour, size="M", stock=stock)
    if published:
        ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
    return product.id

ids = {
    "first": make(${JSON.stringify(n.first)}, 5, True),
    "soldOut": make(${JSON.stringify(n.soldOut)}, 0, True),
    "draft": make(${JSON.stringify(n.draft)}, 5, False),
}
print("SEEDED " + json.dumps(ids))
`);
  const match = out.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed:\n${out}`);
  return JSON.parse(match[1]) as Seeded["ids"];
}

type MenuNode = { collection_id: number | null; children: MenuNode[] } & Record<string, unknown>;
const OUTPUT_ONLY = ["target_label", "link", "not_shown_reason"];

/** The saved Header tree as the save endpoint takes it back (output-only fields dropped). */
function asInput(node: MenuNode): Record<string, unknown> {
  const input = Object.fromEntries(Object.entries(node).filter(([k]) => !OUTPUT_ONLY.includes(k)));
  return { ...input, children: node.children.map(asInput) };
}

/** Read the Header, change its top level and save it back, leaving the other specs' items alone. */
async function editHeader(page: Page, change: (items: Record<string, unknown>[]) => Record<string, unknown>[]) {
  const current = await page.request.get("/api/admin/menus/header");
  expect(current.status()).toBe(200);
  const tree = (await current.json()) as { items: MenuNode[] };
  const saved = await page.request.put("/api/admin/menus/header", {
    data: { items: change(tree.items.map(asInput)) },
  });
  expect(saved.status(), await saved.text()).toBe(200);
}

const bar = (page: Page) => page.getByRole("navigation", { name: "Kategoriler", exact: true });

test.describe("Collection", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1280, height: 800 } });
  useStaffLogin(OWNER, () => {
    products = seedProducts();
  });

  test("the Owner publishes it; the page shows the visible Products in the Owner's order", async ({
    page,
  }) => {
    // The draft Product is in the list on purpose: it is saved, but the page leaves it out.
    const created = await page.request.post("/api/admin/collections", {
      data: {
        name: n.name,
        description: n.description,
        product_ids: [products.first, products.draft, products.soldOut],
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    collection = (await created.json()) as typeof collection;
    const published = await page.request.post(`/api/admin/collections/${collection.id}/publish`);
    expect(published.status(), await published.text()).toBe(200);

    await page.goto(`/collections/${collection.slug}`);
    await expect(page.getByRole("heading", { name: n.name, level: 1 })).toBeVisible();
    await expect(page.getByText(n.description)).toBeVisible();

    // Zeta sorts after Alfa, so only the Owner's order puts it first.
    const titles = page.getByRole("heading", { level: 3 });
    await expect(titles).toHaveText([n.first, n.soldOut]);
    await expect(page.getByText(n.draft)).toHaveCount(0);
    const cards = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(n.soldOut) }) });
    await expect(cards.getByText("Tükendi")).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(n.first) }) }).getByText("Tükendi"),
    ).toHaveCount(0);
  });

  test("a Menu item for it links to the page and the link opens it", async ({ page }) => {
    await editHeader(page, (items) => [
      ...items,
      { target_type: "collection", collection_id: collection.id, label: "", children: [] },
    ]);

    await page.goto("/");
    const link = bar(page).getByRole("link", { name: n.name, exact: true });
    await expect(link).toHaveAttribute("href", `/collections/${collection.slug}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/collections/${collection.slug}$`));
    await expect(page.getByRole("heading", { name: n.name, level: 1 })).toBeVisible();
  });

  test("unpublished, the page is 404 and the Menu item disappears", async ({ page }) => {
    const res = await page.request.post(`/api/admin/collections/${collection.id}/unpublish`);
    expect(res.status(), await res.text()).toBe(200);

    const gone = await page.goto(`/collections/${collection.slug}`);
    expect(gone?.status()).toBe(404);
    await page.goto("/");
    await expect(bar(page).getByRole("link", { name: n.name })).toHaveCount(0);
  });

  test("it cannot be deleted while a Menu item points at it; after removing the item it can", async ({
    page,
  }) => {
    const refused = await page.request.delete(`/api/admin/collections/${collection.id}`);
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { code: string }).code).toBe("collection_in_menu");

    await editHeader(page, (items) => items.filter((i) => i.collection_id !== collection.id));
    const deleted = await page.request.delete(`/api/admin/collections/${collection.id}`);
    expect(deleted.status()).toBe(204);
    expect((await page.request.get(`/api/admin/collections/${collection.id}`)).status()).toBe(404);
  });
});
