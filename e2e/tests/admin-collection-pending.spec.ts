import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #21: the count of Collections waiting for the Owner, as a badge on the Koleksiyonlar
// item of the Dashboard nav. The Owner finds them with the list's status filter.
// The Owner is a Staff user holding the Owner's Collection permissions, since a real Owner
// needs TOTP.
const run = Date.now().toString(36);
const n = { name: `E2E Bekleyen ${run}`, product: `E2E Bekleyen Ürün ${run}` };
const OWNER = ["manage_collections", "delete_catalogue"];

type State = Awaited<ReturnType<typeof loginState>>;
let staffState: State;
let ownerState: State;

test.beforeAll(async ({ browser, baseURL }) => {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Mavi ${run}`)}, "#3355aa")
product = catalog.create_product(
    title=${JSON.stringify(n.product)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=catalog.create_category("E2E Bekleyen ${run}"),
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size="M", stock=5)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
  staffState = await loginState(browser, baseURL, seedStaff());
  ownerState = await loginState(browser, baseURL, seedStaff(OWNER));
});

test("a submission counts on the Koleksiyonlar badge until it is approved", async ({
  browser,
  baseURL,
}) => {
  const staff = await browser.newContext({ baseURL, storageState: staffState, locale: "tr-TR" });
  const sp = await staff.newPage();
  await sp.goto("/admin/collections");
  await sp.getByRole("button", { name: "Yeni koleksiyon" }).click();
  await sp.getByLabel("Ad", { exact: true }).fill(n.name);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: n.name })).toBeVisible();
  await sp.getByLabel("Ürün ekle").fill(n.product);
  await sp.getByRole("button", { name: `${n.product} ekle` }).click();
  await sp.getByRole("button", { name: "Kaydet" }).click();
  await expect(sp.getByText("Koleksiyon kaydedildi.").first()).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(sp.getByText("Onay bekliyor").first()).toBeVisible();

  // Staff see the Koleksiyonlar item but no number on it.
  await sp.goto("/admin");
  await expect(sp.getByRole("link", { name: /Koleksiyonlar/ })).toBeVisible();
  await expect(sp.getByRole("link", { name: /Koleksiyonlar/ }).getByRole("status")).toHaveCount(0);
  await staff.close();

  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const op = await owner.newPage();
  await op.goto("/admin");
  const entry = op.getByRole("link", { name: /Koleksiyonlar/ });
  await expect(entry.getByRole("status")).toBeVisible();
  const before = Number((await entry.getByRole("status").textContent())?.trim());

  await op.goto("/admin/collections?status=pending_approval");
  const row = op.getByRole("row", { name: new RegExp(n.name) });
  await expect(row).toContainText("Onay bekliyor");
  await row.getByRole("link", { name: n.name, exact: true }).click();
  await op.getByRole("button", { name: "Onayla" }).click();
  await expect(op.getByText("Onaylandı.").first()).toBeVisible();

  await op.goto("/admin/collections?status=pending_approval");
  await expect(op.getByRole("row", { name: new RegExp(n.name) })).toHaveCount(0);
  // Other specs may leave submissions behind, so compare the count to what it was.
  const after = op.getByRole("link", { name: /Koleksiyonlar/ }).getByRole("status");
  if (before === 1) await expect(after).toHaveCount(0);
  else await expect(after).toHaveText(String(before - 1));
  await owner.close();
});
