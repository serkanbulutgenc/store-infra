import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";

// Discount Campaigns are the Owner's: plain Staff cannot create or open one and the API refuses
// them. Staff may edit Campaign pages, so the Kampanyalar entry shows them that tab alone (see
// admin-campaigns-hub.spec.ts). (Staff do see which Campaign an Order used: campaign-flow.spec.ts.)
useStaffLogin();

test("Staff see Kampanyalar with the pages only, no Campaign tab or creation", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Siparişler" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Kampanyalar", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Yeni kampanya sayfası" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Yeni kampanya", exact: true })).toHaveCount(0);
});

test("Staff who open a Campaign's own page by its address are sent back to the Dashboard home", async ({
  page,
}) => {
  await page.goto("/admin/campaigns/new");
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/campaigns/1");
  await expect(page).toHaveURL(/\/admin\/?$/);
});

test("the API refuses Staff the Campaign list", async ({ page }) => {
  const response = await page.request.get("/api/admin/campaigns");
  expect(response.status()).toBe(403);
});
