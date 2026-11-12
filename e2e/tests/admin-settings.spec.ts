import { expect, type Page, test } from "@playwright/test";
import { tab, useStaffLogin } from "../support/auth";

// Settings is one form over several tabs. The user is Staff with `manage_settings` granted
// directly, because an Owner needs TOTP to log in.
test.describe.configure({ mode: "serial" });

// One login for the file (see support/auth.ts).

useStaffLogin(["manage_settings"]);

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.getByRole("tab", { name: /Kargo ve ücretler/ })).toBeVisible();
}

const patches = (page: Page) => {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/settings")) {
      bodies.push(r.postDataJSON() as Record<string, unknown>);
    }
  });
  return bodies;
};

test("shows the five tabs and the legal versions on their own tab", async ({ page }) => {
  await openSettings(page);
  for (const name of [
    "Kargo ve ücretler",
    "Banka bilgileri",
    "Bildirimler",
    "Ana sayfa afişi",
    "Satıcı bilgileri",
    "Yasal metin sürümleri",
  ]) {
    await expect(tab(page, name)).toBeVisible();
  }
  await tab(page, "Yasal metin sürümleri").click();
  await expect(page.getByRole("tabpanel", { name: /Yasal/ })).toBeVisible();
});

test("edits in two tabs are saved with a single PATCH", async ({ page }) => {
  const sent = patches(page);
  await openSettings(page);

  await page.getByLabel("Kargo ücreti (₺)").fill("41.50");
  await tab(page, "Banka bilgileri").click();
  await page.getByLabel("Banka", { exact: true }).fill("E2E Bank");

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ shipping_fee: "41.50", bank_name: "E2E Bank" });
});

test("an invalid field in a hidden tab marks that tab and blocks the save", async ({ page }) => {
  const sent = patches(page);
  await openSettings(page);

  await tab(page, "Satıcı bilgileri").click();
  await page.getByLabel("E-posta", { exact: true }).fill("not-an-email");
  await tab(page, "Kargo ve ücretler").click();

  await page.getByRole("button", { name: "Kaydet" }).click();

  // The save is blocked, the offending tab is marked and shown, and its field has the error.
  await expect(tab(page, "Satıcı bilgileri").getByText("Geçersiz alan var")).toBeAttached();
  await expect(tab(page, "Satıcı bilgileri")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Geçerli bir e-posta girin.")).toBeVisible();
  expect(sent).toHaveLength(0);

  // Other tabs stay unmarked.
  await expect(tab(page, "Banka bilgileri").getByText("Geçersiz alan var")).toHaveCount(0);
});
