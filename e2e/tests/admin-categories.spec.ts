import { expect, test, type Page } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

const run = Date.now().toString(36);
const n = {
  root: `Kök ${run}`,
  l2: `Giyim ${run}`,
  l3: `Elbise ${run}`,
  l4: `Midi ${run}`,
  l5: `Yazlık ${run}`,
  shoes: `Ayakkabı ${run}`,
  boot: `Bot ${run}`,
  empty: `Boş ${run}`,
};

function seedTree() {
  const out = runDjangoScript(`
from store_backend.services import catalog
root = catalog.create_category(${JSON.stringify(n.root)})
l2 = catalog.create_category(${JSON.stringify(n.l2)}, root)
l3 = catalog.create_category(${JSON.stringify(n.l3)}, l2)
l4 = catalog.create_category(${JSON.stringify(n.l4)}, l3)
catalog.create_category(${JSON.stringify(n.l5)}, l4)
shoes = catalog.create_category(${JSON.stringify(n.shoes)})
catalog.create_category(${JSON.stringify(n.boot)}, shoes)
catalog.create_category(${JSON.stringify(n.empty)})
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

const row = (page: Page, name: string) => page.locator("li", { hasText: name }).last();
const btn = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const names = (page: Page) =>
  page.locator("ul > li").evaluateAll((els) =>
    els.map((e) => e.querySelector(".font-medium")?.textContent ?? ""),
  );

test.describe("Owner-level actions", () => {
  useStaffLogin(["restructure_categories"], seedTree);

  test("tree, limits, reorder, hide, move and delete", async ({ page }, info) => {
    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "Kategoriler" })).toBeVisible();

    // Collapsed: only the top level.
    await expect(page.getByText(n.root, { exact: true })).toBeVisible();
    await expect(page.getByText(n.l2, { exact: true })).toHaveCount(0);

    // Expand all: all five levels; add child is off at depth 5 and on above it.
    await page.getByRole("button", { name: "Tümünü aç" }).click();
    await expect(page.getByText(n.l5, { exact: true })).toBeVisible();
    await expect(btn(page, `${n.l5} alt kategori ekle`)).toBeDisabled();
    await expect(btn(page, `${n.l4} alt kategori ekle`)).toBeEnabled();
    await page.screenshot({ path: `${info.outputDir}/tree-expanded.png`, fullPage: true });

    // Collapse all.
    await page.getByRole("button", { name: "Tümünü kapat" }).click();
    await expect(page.getByText(n.l2, { exact: true })).toHaveCount(0);

    // Reorder by keyboard: focus the button and press Enter.
    const before = (await names(page)).filter((x) => x.includes(run));
    const first = before[0] as string;
    const down = btn(page, `${first} aşağı taşı`);
    await down.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await names(page)).filter((x) => x.includes(run))[0]).not.toBe(first);

    // Hide a depth-2 Category: the badge shows on it and on everything under it.
    await page.getByRole("button", { name: "Tümünü aç" }).click();
    await btn(page, `${n.l2} gizle`).click();
    await expect(row(page, n.l2).getByText("Gizli")).toBeVisible();
    await expect(row(page, n.l5).getByText("Gizli")).toBeVisible();
    await expect(btn(page, `${n.l2} göster`)).toBeVisible();
    await btn(page, `${n.l2} göster`).click();
    await expect(row(page, n.l5).getByText("Gizli")).toHaveCount(0);

    // Move picker: self and descendants are blocked, and so are parents that pass depth 5.
    await btn(page, `${n.l2} taşı`).click();
    const dialog = page.getByRole("dialog");
    const radio = (name: string) => dialog.getByRole("radio", { name: new RegExp(`^${name}`) });
    await expect(radio(n.l2)).toBeDisabled();
    await expect(radio(n.l4)).toBeDisabled(); // a descendant
    await expect(radio(n.boot)).toBeDisabled(); // depth 2 + a 4-level subtree = 6
    await expect(dialog.getByText("en fazla beş seviye aşılır").first()).toBeVisible();
    await expect(radio(n.shoes)).toBeEnabled(); // depth 1 + 4 = 5
    await page.screenshot({ path: `${info.outputDir}/move-picker.png` });
    await dialog.getByRole("button", { name: "Vazgeç" }).click();

    // A valid move carries the subtree.
    await btn(page, `${n.l5} taşı`).click();
    await radio(n.shoes).check();
    await dialog.getByRole("button", { name: "Taşı", exact: true }).click();
    await expect(page.getByText("Kategori taşındı.")).toBeVisible();
    await expect(row(page, n.shoes)).toContainText("2 alt kategori");
    await expect(row(page, n.l4)).toContainText("0 alt kategori");

    // Delete: a Category with children is refused with the blocking count.
    await btn(page, `${n.root} sil`).click();
    await dialog.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("alt kategori");
    await page.screenshot({ path: `${info.outputDir}/delete-refused.png` });
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText(n.root, { exact: true })).toBeVisible();

    // An empty Category is deleted.
    await btn(page, `${n.empty} sil`).click();
    await dialog.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(page.getByText("Kategori silindi.")).toBeVisible();
    await expect(page.getByText(n.empty, { exact: true })).toHaveCount(0);
  });
});

test.describe("Staff", () => {
  useStaffLogin([]);

  test("see edit, hide and reorder but not move or delete", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: "Tümünü aç" }).click();
    await expect(page.getByText(n.root, { exact: true })).toBeVisible();
    const some = n.l2;
    await expect(btn(page, `${some} düzenle`)).toBeVisible();
    await expect(btn(page, `${some} gizle`)).toBeVisible();
    await expect(page.getByRole("button", { name: /taşı…|Taşı…/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^.* sil$/ })).toHaveCount(0);
  });
});
