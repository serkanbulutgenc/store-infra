import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// The Dashboard sidebar groups the Collection actions under a foldable "Koleksiyonlar" entry:
// the entry itself opens the list, its sub-items create a Collection and open the Owner's
// pending-approval list (with the count, which stays visible when the entry is folded).
const run = Date.now().toString(36);
const name = `E2E Menü ${run}`;
const waiting = `E2E Bekleyen Menü ${run}`;

function seedPending() {
  const out = runDjangoScript(`
from store_backend.catalog.models import Collection
Collection.objects.create(name=${JSON.stringify(waiting)}, slug="e2e-bekleyen-menu-${run}", status="pending_approval")
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Yönetim" });
const parent = (page: Page) => nav(page).getByRole("link", { name: "Koleksiyonlar", exact: true });
const fold = (page: Page, what: "aç" | "kapat") =>
  nav(page).getByRole("button", { name: `Koleksiyonlar alt menüsünü ${what}` });
const create = (page: Page) => nav(page).getByRole("link", { name: "Yeni koleksiyon" });
const pending = (page: Page) => nav(page).getByRole("link", { name: /Onay bekleyenler/ });

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("Owner", () => {
  useStaffLogin(["edit_collections", "manage_collections"], seedPending);

  test("the actions sit under Koleksiyonlar, which folds and still shows the pending count", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(parent(page)).toHaveAttribute("href", "/admin/collections");
    await expect(create(page)).toBeVisible();
    await expect(pending(page).getByRole("status")).toBeVisible();

    // Folded: the sub-items go, the parent keeps the count.
    await fold(page, "kapat").click();
    await expect(create(page)).toHaveCount(0);
    await expect(pending(page)).toHaveCount(0);
    await expect(parent(page).locator("xpath=..").getByRole("status")).toBeVisible();
    await fold(page, "aç").click();
    await expect(pending(page)).toBeVisible();

    await pending(page).click();
    await expect(page).toHaveURL(/\/admin\/collections\/pending$/);
    await expect(pending(page)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: waiting, exact: true })).toBeVisible();
  });

  test("Yeni koleksiyon opens a page that creates a draft and goes on to it", async ({ page }) => {
    await page.goto("/admin");
    await create(page).click();
    await expect(page).toHaveURL(/\/admin\/collections\/new$/);
    await expect(page.getByRole("heading", { name: "Yeni koleksiyon" })).toBeVisible();
    await page.getByLabel("Ad", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Oluştur" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/collections\/\d+$/);
  });
});

test.describe("Staff", () => {
  useStaffLogin(["edit_collections"]);

  test("have the list and Yeni koleksiyon, but not the Owner's pending list", async ({ page }) => {
    await page.goto("/admin");
    await expect(parent(page)).toBeVisible();
    await expect(create(page)).toBeVisible();
    await expect(pending(page)).toHaveCount(0);
    await page.goto("/admin/collections/pending");
    await expect(page).toHaveURL(/\/admin\/?$/);
  });
});
