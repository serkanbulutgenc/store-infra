import { expect, test } from "@playwright/test";
import { getFromApiContainer } from "../support/stack";

test("storefront home loads through Caddy", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Aura Tekstil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yeni gelenler", level: 1 })).toBeVisible();
  await expect(page.locator('[data-theme="storefront"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// Caddy only publishes `/` and `/media/*`, so /health is read from inside the
// Compose network. Once the frontend proxies /api/** (ticket 09) and exposes
// the health check publicly, switch this to `request.get("/api/...")`.
test("api /health is 200 with Postgres and Redis up", () => {
  const { status, body } = getFromApiContainer("http://api:5000/health");

  expect(status).toBe(200);
  expect(JSON.parse(body)).toEqual({
    status: "ok",
    checks: { postgres: "ok", redis: "ok" },
  });
});
