import { expect, type Page, test } from "@playwright/test";
import { seedColourProduct, seedShop } from "../support/seed";

// Product cards side by side are equally tall, whatever each one has to show: here one card has
// Colour swatches and its neighbour has none.
let swatches: string;
let plain: string;

test.beforeAll(() => {
  plain = seedShop().title;
  swatches = seedColourProduct().title;
});

/** The heights of the bordered cards, one entry per list (grid or rail) that holds them. */
const heightsByList = (page: Page) =>
  page.evaluate(() => {
    const lists = new Map<Element, number[]>();
    for (const card of document.querySelectorAll('li > div:has(> a[href^="/urun/"])')) {
      const list = card.closest("ul") as Element;
      lists.set(list, [...(lists.get(list) ?? []), Math.round(card.getBoundingClientRect().height)]);
    }
    return [...lists.values()];
  });

for (const [screen, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["phone", { width: 390, height: 800 }],
] as const) {
  for (const [place, path] of [
    ["listing grid", "/ara"],
    ["homepage rails", "/"],
  ] as const) {
    test(`on a ${screen} the cards of the ${place} are equally tall`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path, { waitUntil: "networkidle" });
      for (const title of [plain, swatches]) {
        await expect(page.getByRole("button", { name: `${title} sepete ekle` }).first()).toBeAttached();
      }
      const lists = await heightsByList(page);
      expect(lists.some((heights) => heights.length > 1)).toBe(true);
      for (const heights of lists) expect([...new Set(heights)]).toHaveLength(1);
    });
  }
}
