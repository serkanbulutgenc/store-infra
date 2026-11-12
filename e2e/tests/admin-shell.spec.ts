import { expect, type Page, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";

// The Dashboard shell as a Staff user (an Owner needs TOTP): grouped sidebar, Owner-only items
// hidden, collapse that survives a reload, keyboard use, breadcrumbs, user menu, mobile menu.
test.describe.configure({ mode: "serial" });

// One login for the file (see support/auth.ts). The sign-out test goes last: it ends the session.

useStaffLogin();

async function openDashboard(page: Page) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/?$/);
}

const sidebar = (page: Page) => page.locator('[data-slot="sidebar"]');
const nav = (page: Page) => page.getByRole("navigation", { name: "Yönetim" });
const toggle = (page: Page) => page.getByRole("button", { name: "Kenar çubuğunu aç veya kapat" });

test("Staff see the grouped sidebar without Owner-only items", async ({ page }) => {
  await openDashboard(page);
  const links = nav(page);

  for (const group of ["Satış", "Katalog", "Yönetim"]) {
    await expect(links.getByRole("button", { name: group })).toBeVisible();
  }
  for (const item of ["Ana sayfa", "Siparişler", "Ürünler", "Stok", "Güvenlik"]) {
    await expect(links.getByRole("link", { name: item, exact: true })).toBeVisible();
  }
  for (const hidden of [
    "Ayarlar",
    "Personel",
    "Muhasebe dışa aktarımı",
    "Denetim günlüğü",
    "Hesap silme talepleri",
    "İçe aktar",
  ]) {
    await expect(links.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
});

test("a group collapses and expands", async ({ page }) => {
  await openDashboard(page);
  const catalogue = nav(page).getByRole("button", { name: "Katalog" });
  const products = nav(page).getByRole("link", { name: "Ürünler", exact: true });

  await catalogue.click();
  await expect(products).toBeHidden();
  await catalogue.click();
  await expect(products).toBeVisible();
});

test("the sidebar folds to a rail and stays folded after a reload", async ({ page }) => {
  await openDashboard(page);
  await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");

  await toggle(page).click();
  await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");

  await page.reload();
  await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");

  await toggle(page).click();
  await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
});

test("the sidebar works from the keyboard and the breadcrumb follows", async ({ page }) => {
  await openDashboard(page);
  const orders = nav(page).getByRole("link", { name: "Siparişler", exact: true });

  await orders.focus();
  await expect(orders).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/orders(\?|$)/);

  const crumbs = page.getByRole("navigation", { name: "Konum" });
  await expect(crumbs).toContainText("Satış");
  await expect(crumbs.getByText("Siparişler")).toHaveAttribute("aria-current", "page");
  await expect(orders).toHaveAttribute("data-active", "true");

  // Ctrl+B is the shadcn shortcut for the sidebar.
  await page.keyboard.press("Control+b");
  await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");
  await page.keyboard.press("Control+b");
  await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
});

test("the user menu opens Security from the keyboard and Esc closes it", async ({ page }) => {
  await openDashboard(page);
  const trigger = page.getByRole("button", { name: "Kullanıcı menüsü" });

  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Çıkış yap" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await trigger.focus();
  await page.keyboard.press("Enter");
  // Opening from the keyboard focuses the first item; the arrow keys move between items.
  const security = page.getByRole("menuitem", { name: "Güvenlik" });
  const signOut = page.getByRole("menuitem", { name: "Çıkış yap" });
  await expect(security).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(security).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/security$/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the menu slides in, navigates and closes", async ({ page }) => {
    await openDashboard(page);
    await expect(nav(page)).toBeHidden();

    await toggle(page).click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Stok", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/stock(\?|$)/);
    await expect(menu).toBeHidden();

    await toggle(page).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
});

test("sign out from the user menu returns to the login page", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});
