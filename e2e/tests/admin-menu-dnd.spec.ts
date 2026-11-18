import { expect, type Locator, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Store-frontend #4: drag and drop (and the keyboard's one-level-in/out buttons) in the Menu
// builder. The Header allows 3 levels. Items are groups with a label, so no target is needed.
const base = Date.now().toString(36);
const names = (tag: string) => ({
  a: `Sürükle A ${tag}`,
  a1: `Sürükle A1 ${tag}`,
  b: `Sürükle B ${tag}`,
  c: `Sürükle C ${tag}`,
  c1: `Sürükle C1 ${tag}`,
});
let run = base;
let n = names(run);
let seeded = 0;

/** A fresh set of items, with names of its own, for every describe block. */
function seed() {
  run = `${base}${seeded++}`;
  n = names(run);
  const out = runDjangoScript(`
from store_backend.shop.models import Menu, MenuItem

header = Menu.objects.get(key="header")
# Earlier runs' items would push these rows off screen.
MenuItem.objects.filter(menu=header, label__startswith="Sürükle").delete()
def group(label, position, parent=None):
    return MenuItem.objects.create(
        menu=header, parent=parent, position=position, target_type="group", label=label
    )
a = group(${JSON.stringify(n.a)}, 900)
group(${JSON.stringify(n.a1)}, 0, a)
group(${JSON.stringify(n.b)}, 901)
c = group(${JSON.stringify(n.c)}, 902)
group(${JSON.stringify(n.c1)}, 0, c)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

const handle = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name} sürükle`, exact: true });
/** The item's row: the handle sits directly in it. */
const row = (page: Page, name: string) => handle(page, name).locator("xpath=..");
const button = (page: Page, name: string, what: string) =>
  page.getByRole("button", { name: `${name} ${what}`, exact: true });
/** Our items in the order the builder shows them, top to bottom. */
const order = (page: Page) =>
  page
    .locator(".font-medium")
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""))
    .then((all) => all.filter((x) => x.includes(run)));
/** Whether the item is a child of another (it can be taken one level out). */
const nested = (page: Page, name: string) =>
  button(page, name, "bir seviye dışarı al").isEnabled();

/** Drag `name`'s handle onto a row: `at` is how far down the row, 0 (top) to 1 (bottom). */
async function dragTo(page: Page, name: string, onto: Locator, at: number) {
  await handle(page, name).scrollIntoViewIfNeeded();
  const from = await handle(page, name).boundingBox();
  const to = await onto.boundingBox();
  if (!from || !to) throw new Error("rows are not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 60, to.y + to.height * at, { steps: 12 });
  await page.mouse.up();
}

// All the rows must be on screen at once for the mouse to reach them.
test.use({ viewport: { width: 1280, height: 1600 } });

test.describe("Owner", () => {
  useStaffLogin(["manage_menus"], seed);

  test("drops reorder and re-parent, a drop past the depth limit is refused, and Save keeps it", async ({
    page,
  }) => {
    await page.goto("/admin/menus");
    await expect(page.getByText(n.c1, { exact: true })).toBeVisible();
    expect(await order(page)).toEqual([n.a, n.a1, n.b, n.c, n.c1]);

    // Reorder: C (with C1) onto the top edge of A.
    await dragTo(page, n.c, row(page, n.a), 0.05);
    await expect.poll(() => order(page)).toEqual([n.c, n.c1, n.a, n.a1, n.b]);

    // Re-parent: B into the middle of A, as its last child.
    await dragTo(page, n.b, row(page, n.a), 0.5);
    await expect.poll(() => order(page)).toEqual([n.c, n.c1, n.a, n.a1, n.b]);
    expect(await nested(page, n.b)).toBe(true);

    // Refused: C has a child, so inside A1 (level 2) would need four levels.
    await dragTo(page, n.c, row(page, n.a1), 0.5);
    await expect(page.getByText(/en fazla 3 seviye/).first()).toBeVisible();
    expect(await order(page)).toEqual([n.c, n.c1, n.a, n.a1, n.b]);
    expect(await nested(page, n.c)).toBe(false);

    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Menü kaydedildi ve yayında.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(n.c1, { exact: true })).toBeVisible();
    expect(await order(page)).toEqual([n.c, n.c1, n.a, n.a1, n.b]);
    expect(await nested(page, n.b)).toBe(true);
  });

});

test.describe("Owner keyboard", () => {
  useStaffLogin(["manage_menus"], seed);

  test("one level in or out from the buttons", async ({ page }) => {
    await page.goto("/admin/menus");
    await expect(page.getByText(n.c1, { exact: true })).toBeVisible();

    // A top-level item cannot go out, and A1, first in its group, cannot go in.
    await expect(button(page, n.a, "bir seviye dışarı al")).toBeDisabled();
    await expect(button(page, n.a1, "bir seviye içeri al")).toBeDisabled();

    // B into A (last child), then out again (right after A).
    await button(page, n.b, "bir seviye içeri al").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => nested(page, n.b)).toBe(true);
    expect(await order(page)).toEqual([n.a, n.a1, n.b, n.c, n.c1]);
    await button(page, n.b, "bir seviye dışarı al").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => nested(page, n.b)).toBe(false);
  });

  test("an item can be picked up and dropped from the keyboard", async ({ page }) => {
    await page.goto("/admin/menus");
    await expect(page.getByText(n.c1, { exact: true })).toBeVisible();
    await handle(page, n.c).focus();
    await page.keyboard.press("Space");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    // Wherever it landed, it moved, and its child went with it.
    await expect.poll(async () => (await order(page)).indexOf(n.c)).toBeLessThan(3);
    const after = await order(page);
    expect(after.indexOf(n.c1)).toBe(after.indexOf(n.c) + 1);
  });
});
