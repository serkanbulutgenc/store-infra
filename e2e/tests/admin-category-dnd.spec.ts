import { expect, type Locator, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

const run = Date.now().toString(36);
const names = (tag: string) => ({
  a: `Aa ${tag}`,
  b: `Bb ${tag}`,
  c: `Cc ${tag}`,
  kid: `Alt ${tag}`,
  deep: `Derin ${tag}`,
});
let n = names(run);
let seeded = 0;

/** A fresh tree with names of its own for every describe block. */
function seed() {
  n = names(`${run}${seeded++}`);
  const out = runDjangoScript(`
from store_backend.services import catalog
a = catalog.create_category(${JSON.stringify(n.a)})
catalog.create_category(${JSON.stringify(n.b)})
catalog.create_category(${JSON.stringify(n.c)})
kid = catalog.create_category(${JSON.stringify(n.kid)}, a)
catalog.create_category(${JSON.stringify(n.deep)}, kid)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

const row = (page: Page, name: string) => page.locator("li", { hasText: name }).last();
const handle = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name} sürükle`, exact: true });
const mine = (page: Page) =>
  page
    .locator("ul > li")
    .evaluateAll((els) => els.map((e) => e.querySelector(".font-medium")?.textContent ?? ""))
    .then((all) => all.filter((x) => x.includes(n.a.slice(3))));

/** Press the mouse on `name`'s handle and move a little, so the drag has started. */
async function pickUp(page: Page, name: string, dy: number) {
  await handle(page, name).scrollIntoViewIfNeeded();
  const box = await handle(page, name).boundingBox();
  if (!box) throw new Error("no handle");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2 + dy, { steps: 8 });
}

/** Drag `name`'s handle onto a row: `at` is how far down the row, 0 (top) to 1 (bottom). */
async function dragTo(page: Page, name: string, onto: Locator, at: number) {
  await handle(page, name).scrollIntoViewIfNeeded();
  const from = await handle(page, name).boundingBox();
  const to = await onto.boundingBox();
  if (!from || !to) throw new Error("rows are not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height * at, { steps: 12 });
  await page.mouse.up();
}

test.describe("Owner drag and drop", () => {
  useStaffLogin(["restructure_categories"], seed);

  test("drops reorder and re-parent like the buttons, and invalid drops are refused", async ({
    page,
  }) => {
    await page.goto("/admin/categories");
    await expect(page.getByText(n.a, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tümünü aç" }).click();
    await expect(page.getByText(n.deep, { exact: true })).toBeVisible();

    // Not droppable: a Category's own subtree is dimmed while it is held.
    await pickUp(page, n.a, 60);
    await expect(row(page, n.kid)).toHaveAttribute("data-droppable", "false");
    await expect(row(page, n.deep)).toHaveAttribute("data-droppable", "false");
    await expect(row(page, n.b)).not.toHaveAttribute("data-droppable", "false");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(row(page, n.b)).not.toHaveAttribute("data-droppable", "false");

    // Reorder: drop C on the top edge of A (before A).
    await dragTo(page, n.c, row(page, n.a), 0.05);
    await expect
      .poll(async () => {
        const order = await mine(page);
        return order.indexOf(n.c) < order.indexOf(n.a);
      })
      .toBe(true);

    // Re-parent: drop B in the middle of A (inside A, as its last child).
    await dragTo(page, n.b, row(page, n.a), 0.5);
    await expect(row(page, n.a)).toContainText("2 alt kategori");
    const order = await mine(page);
    expect(order.indexOf(n.b)).toBeGreaterThan(order.indexOf(n.kid));
  });
});

test.describe("Owner keyboard drag", () => {
  useStaffLogin(["restructure_categories"], seed);

  test("works from the keyboard", async ({ page }) => {
    await page.goto("/admin/categories");
    await expect(page.getByText(n.c, { exact: true })).toBeVisible();
    expect(await mine(page)).toEqual([n.a, n.b, n.c]);

    // Pick C up with Space, step up through the drop positions (after B, inside B,
    // before B), drop with Space.
    await handle(page, n.c).focus();
    await page.keyboard.press("Space");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect.poll(() => mine(page)).toEqual([n.a, n.c, n.b]);
  });
});

test.describe("Staff drag and drop", () => {
  useStaffLogin([], seed);

  test("can reorder but a drop that changes the parent is refused", async ({ page }) => {
    await page.goto("/admin/categories");
    await expect(page.getByText(n.a, { exact: true })).toBeVisible();

    // C inside A would change its parent: nothing happens.
    await dragTo(page, n.c, row(page, n.a), 0.5);
    await expect(row(page, n.a)).toContainText("1 alt kategori");

    // C before A is a plain reorder: allowed.
    await dragTo(page, n.c, row(page, n.a), 0.05);
    await expect
      .poll(async () => {
        const order = await mine(page);
        return order.indexOf(n.c) < order.indexOf(n.a);
      })
      .toBe(true);
  });
});
