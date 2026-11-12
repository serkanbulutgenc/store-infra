import type { Browser } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Log in once and return the browser storage state. Specs reuse it with `test.use({ storageState })`
 * because the login endpoint is limited to 10 a minute per IP: one login per test would trip it.
 */
export async function loginState(
  browser: Browser,
  baseURL: string | undefined,
  user: { email: string; password: string },
) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("E-posta", { exact: true }).fill(user.email);
  await page.getByLabel("Parola").fill(user.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  const state = await context.storageState();
  await context.close();
  return state;
}
