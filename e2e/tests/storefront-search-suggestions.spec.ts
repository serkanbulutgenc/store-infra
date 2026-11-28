import { expect, type Page, test } from "@playwright/test";
import {
  rebuildSuggestions,
  startElasticsearch,
  stopElasticsearch,
} from "../support/search";
import {
  archiveProduct,
  type SearchExtrasSeed,
  type SearchSeed,
  seedSearchExtras,
  seedSearchShop,
} from "../support/seed";

// Search suggestions (GLOSSARY) from the header search box, through Caddy, the web app and the
// API to a real Elasticsearch. The index is rebuilt after seeding.
test.describe.configure({ mode: "serial" });

let shop: SearchSeed;
let extras: SearchExtrasSeed;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  shop = seedSearchShop();
  extras = seedSearchExtras();
  await rebuildSuggestions();
});

const searchBox = (page: Page) => page.getByRole("combobox", { name: "Ürün ara" });
const panel = (page: Page) => page.getByRole("listbox", { name: "Öneriler" });
const suggestion = (page: Page, name: string) =>
  panel(page).getByRole("option", { name: new RegExp(name) });

/** Resolves with the API's answer for exactly `query`. */
const answerTo = (page: Page, query: string) =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/store/suggestions" && url.searchParams.get("q") === query;
  });

/** The results page for `query`. */
const resultsFor = (query: string) => (url: URL) =>
  url.pathname === "/ara" && url.searchParams.get("q") === query;

/** The homepage with `query` typed into the box. */
async function typeQuery(page: Page, query: string) {
  // Text typed before the page has hydrated is lost.
  await page.goto("/", { waitUntil: "networkidle" });
  await searchBox(page).pressSequentially(query);
}

const TYPES = [
  { key: "category", heading: "Kategoriler" },
  { key: "brand", heading: "Markalar" },
  { key: "collection", heading: "Koleksiyonlar" },
  { key: "campaignPage", heading: "Kampanya sayfaları" },
  { key: "product", heading: "Ürünler" },
] as const;

test("typing shows one group per type, in order, each row with its picture", async ({ page }) => {
  await typeQuery(page, shop.token);

  const groups = panel(page).getByRole("group");
  await expect(groups).toHaveCount(TYPES.length);
  for (const [index, { key, heading }] of TYPES.entries()) {
    await expect(groups.nth(index)).toHaveAccessibleName(heading);
    const row = groups.nth(index).getByRole("option");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(shop[key].name);
    // Loaded, not only present: a picture the proxy does not serve has no width.
    await expect
      .poll(() => row.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth), {
        message: `${key} picture`,
      })
      .toBeGreaterThan(0);
  }
});

for (const { key } of TYPES) {
  test(`choosing the ${key} suggestion opens its page`, async ({ page }) => {
    const { name, path } = shop[key];
    await typeQuery(page, shop.token);
    await suggestion(page, name).click();

    if (key === "brand") {
      // A Brand has no page of its own: the results, filtered to it. The router rewrites
      // `?brand=7` into its list form, `?brand=[7]`.
      const id = new URL(path, page.url()).searchParams.get("brand");
      await expect(page).toHaveURL(
        (url) => url.pathname === "/ara" && url.searchParams.get("brand") === `[${id}]`,
      );
      // Only the Brand's own Product is listed.
      const listed = page.getByRole("main").locator('a[href^="/urun/"]');
      await expect
        .poll(async () => [
          ...new Set(await listed.evaluateAll((links) => links.map((a) => a.getAttribute("href")))),
        ])
        .toEqual([shop.product.path]);
    } else {
      await expect(page).toHaveURL((url) => url.pathname === path && url.search === "");
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    }
  });
}

test("words typed without Turkish letters find a name that has them", async ({ page }) => {
  await typeQuery(page, extras.turkish.query);
  await expect(suggestion(page, extras.turkish.name)).toBeVisible();
});

test("Enter opens the results page with the box prefilled", async ({ page }) => {
  await typeQuery(page, shop.token);
  await expect(panel(page)).toBeVisible();
  await searchBox(page).press("Enter");

  await expect(page).toHaveURL(resultsFor(shop.token));
  await expect(searchBox(page)).toHaveValue(shop.token);
  await expect(panel(page)).toHaveCount(0);

  // Also on a full load of that address, where the server renders the box.
  await page.reload({ waitUntil: "networkidle" });
  await expect(searchBox(page)).toHaveValue(shop.token);
});

test("an archived Product is no longer suggested after a rebuild", async ({ page }) => {
  const { query, kept, archived } = extras.pair;
  await typeQuery(page, query);
  await expect(suggestion(page, kept)).toBeVisible();
  await expect(suggestion(page, archived.title)).toBeVisible();

  archiveProduct(archived.slug);
  await rebuildSuggestions();

  // A new page load: the browser keeps an answer for a while.
  await typeQuery(page, query);
  await expect(suggestion(page, kept)).toBeVisible();
  await expect(suggestion(page, archived.title)).toHaveCount(0);
});

// Last: it takes the service away from the whole stack.
test.describe("with Elasticsearch stopped", () => {
  // Also after a failure, so the stack is left whole.
  test.afterAll(async () => {
    test.setTimeout(240_000);
    startElasticsearch();
  });

  test("no panel shows, submitting still works, and suggestions come back", async ({ page }) => {
    test.setTimeout(300_000);
    await typeQuery(page, shop.token);
    await expect(panel(page)).toBeVisible();

    stopElasticsearch();
    await page.goto("/", { waitUntil: "networkidle" });
    const answer = answerTo(page, shop.token);
    await searchBox(page).fill(shop.token);
    const response = await answer;
    expect(response.status()).toBe(503);
    await response.finished();
    // Nothing on the page says the answer was handled: give a panel time to appear.
    await page.waitForTimeout(1_000);
    await expect(panel(page)).toHaveCount(0);
    await expect(searchBox(page)).toHaveAttribute("aria-expanded", "false");

    await searchBox(page).press("Enter");
    await expect(page).toHaveURL(resultsFor(shop.token));
    await expect(
      page.getByRole("main").locator(`a[href="${shop.product.path}"]`).first(),
    ).toBeVisible();

    startElasticsearch();
    // Healthy comes a moment before the index can answer; a reload asks again.
    await expect(async () => {
      await typeQuery(page, shop.token);
      await expect(suggestion(page, shop.product.name)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
  });
});
