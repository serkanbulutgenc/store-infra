import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Store-infra #132: the homepage shows only the Categories the Owner picked, in the Owner's order,
// as a scrollable row of thumbnail tiles (a placeholder when there is no image), not every Category.
const run = Date.now().toString(36);
const n = { a: `Aaa ${run}`, b: `Bbb ${run}`, c: `Ccc ${run}` };

useStaffLogin(["manage_categories"], () => {
  const out = runDjangoScript(`
from store_backend.services import catalog
for name in ${JSON.stringify(Object.values(n))}:
    catalog.create_category(name)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
});

test.afterAll(() => {
  runDjangoScript(`
from oscar.apps.catalogue.models import Category
for c in Category.objects.filter(name__contains=${JSON.stringify(run)}):
    c.delete()
print("CLEANED")
`);
});

test("the homepage row shows only the picked Categories, in the picked order", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/admin/categories");
  for (const [name, order] of [
    [n.a, "2"],
    [n.b, "1"],
  ] as const) {
    await page.getByRole("button", { name: `${name} düzenle` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ana sayfada göster").check();
    await dialog.getByLabel("Ana sayfa sırası").fill(order);
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kategori kaydedildi.").first()).toBeVisible();
  }

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto("/");
  const row = vp.getByRole("region", { name: "Kategoriler" });
  // Other Categories may be picked too (the dev database is shared): look at ours only.
  const ours = row.getByRole("link").filter({ hasText: run });
  await expect(ours).toHaveText([n.b, n.a].map((t) => new RegExp(t)));
  await expect(row.getByRole("link", { name: new RegExp(n.c) })).toHaveCount(0);
  await expect(ours.getByTestId("category-placeholder")).toHaveCount(2);

  await row.getByRole("link", { name: new RegExp(n.b) }).click();
  await expect(vp).toHaveURL(/\/kategori\//);
  await visitor.close();
});
