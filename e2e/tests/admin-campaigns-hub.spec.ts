import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";

// Store-infra #134: Campaigns and Campaign pages share one Satış entry, "Kampanyalar", as two tabs;
// creating either happens on its own admin page, never in a dialog. Staff, who may edit pages but
// not Campaigns, see the pages alone.
test.describe("with both permissions", () => {
  useStaffLogin(["manage_campaigns", "edit_campaign_pages"]);

  test("one sidebar entry, two tabs, and no dialogs", async ({ page }) => {
    await page.goto("/admin");
    const sidebar = page.getByRole("navigation").filter({ hasText: "Satış" }).first();
    await expect(sidebar.getByRole("link", { name: "Kampanyalar", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Kampanya sayfaları" })).toHaveCount(0);

    await page.getByRole("link", { name: "Kampanyalar", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/campaigns(\?|$)/);
    const tabs = page.getByRole("tablist", { name: "Kampanya türleri" });
    await expect(tabs.getByRole("tab", { name: "Kampanyalar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await tabs.getByRole("tab", { name: "Kampanya sayfaları" }).click();
    await expect(page).toHaveURL(/tab=pages/);
    await page.getByRole("link", { name: "Yeni kampanya sayfası" }).click();
    await expect(page).toHaveURL(/\/admin\/campaign-pages\/new$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Yeni kampanya sayfası" })).toBeVisible();
    await page.getByRole("link", { name: "Vazgeç" }).click();
    await expect(page).toHaveURL(/\/admin\/campaigns\?tab=pages/);

    await tabs.getByRole("tab", { name: "Kampanyalar" }).click();
    await page.getByRole("link", { name: "Yeni kampanya", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Yeni kampanya" })).toBeVisible();
  });

  test("the old Campaign pages address lands on the pages tab", async ({ page }) => {
    await page.goto("/admin/campaign-pages");
    await expect(page).toHaveURL(/\/admin\/campaigns\?tab=pages/);
    await expect(page.getByRole("tab", { name: "Kampanya sayfaları" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("Staff who only edit pages", () => {
  useStaffLogin(["edit_campaign_pages"]);

  test("see the pages alone, with no tabs and no Campaign creation", async ({ page }) => {
    await page.goto("/admin/campaigns");
    await expect(page.getByRole("link", { name: "Yeni kampanya sayfası" })).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Yeni kampanya", exact: true })).toHaveCount(0);
    await page.goto("/admin/campaigns/new");
    await expect(page).toHaveURL(/\/admin\/?$/); // not allowed: sent back
  });
});
