import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";

// Campaigns are the Owner's: plain Staff do not see the screen, cannot reach it by URL and the
// API refuses them. (Staff do see which Campaign an Order used: see campaign-flow.spec.ts.)
useStaffLogin();

test("Staff have no Kampanyalar entry in the Dashboard menu", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Siparişler" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Kampanyalar" })).toHaveCount(0);
});

test("Staff who open the Campaign screen by its address are sent back to the Dashboard home", async ({
  page,
}) => {
  await page.goto("/admin/campaigns");
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole("heading", { name: "Kampanyalar" })).toHaveCount(0);
});

test("the API refuses Staff the Campaign list", async ({ page }) => {
  const response = await page.request.get("/api/admin/campaigns");
  expect(response.status()).toBe(403);
});
