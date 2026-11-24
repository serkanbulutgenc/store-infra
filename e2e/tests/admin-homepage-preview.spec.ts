import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner } from "../support/seed";

// Store-infra #161: the Vitrin preview. A signed-in Dashboard user opens the real Storefront
// at `/?preview=layout` and sees a banner that says so; a Shopper who asks for the same address
// gets the live page with no banner, and the preview endpoint is closed to them. The preview
// shows the saved layout until the Approval rule (#160) lands.
test.describe.configure({ mode: "serial" });

type State = Awaited<ReturnType<typeof loginState>>;
let ownerState: State;

test.beforeAll(async ({ browser, baseURL }) => {
  ownerState = await loginState(browser, baseURL, seedOwner());
});

const banner = (page: import("@playwright/test").Page) =>
  page.getByRole("status").filter({ hasText: "Önizleme" });

test("a Dashboard user sees the banner on the preview and not on the live page", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await context.newPage();

  await page.goto("/?preview=layout");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).getByRole("link", { name: "Vitrin'e dön" })).toHaveAttribute(
    "href",
    "/admin/homepage",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Yeni gelenler" })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await context.close();
});

test("Önizle on the Vitrin screen opens the preview in a new tab", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("/admin/homepage");

  const [preview] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Önizle" }).click(),
  ]);

  await expect(preview).toHaveURL(/\/\?preview=layout$/);
  await expect(banner(preview)).toBeVisible();
  await context.close();
});

test("a Shopper gets the live page with no banner, and no preview endpoint", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, locale: "tr-TR" });
  const page = await context.newPage();

  await page.goto("/?preview=layout");
  await expect(page.getByRole("heading", { name: "Yeni gelenler" })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);

  const refused = await page.request.get("/api/admin/homepage/preview");
  expect([401, 403]).toContain(refused.status());

  const live = await (await page.request.get("/api/store/homepage")).json();
  const asked = await (await page.request.get("/api/store/homepage?preview=1")).json();
  expect(asked).toEqual(live);
  await context.close();
});
