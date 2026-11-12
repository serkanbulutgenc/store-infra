import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { seedStaff } from "./seed";

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

/**
 * Register the login every Dashboard spec needs: seed a Staff user (with `extraPermissions`
 * granted directly, because an Owner needs TOTP), log in once, and put that session on every
 * test's context. Call it at the top of the spec file; `before` runs after the login for extra
 * seeding.
 */
export function useStaffLogin(extraPermissions: string[] = [], before?: () => void) {
  let storageState: Awaited<ReturnType<typeof loginState>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    before?.();
    storageState = await loginState(browser, baseURL, seedStaff(extraPermissions));
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies(storageState.cookies);
  });
}

/** A Dashboard tab by (part of) its name. */
export const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(name) });
