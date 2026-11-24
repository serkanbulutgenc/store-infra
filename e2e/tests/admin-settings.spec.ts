import { expect, type Page, test } from "@playwright/test";
import { tab, useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Settings is one form over several tabs. The user is Staff with `manage_settings` granted
// directly, because an Owner needs TOTP to log in.
test.describe.configure({ mode: "serial" });

// One login for the file (see support/auth.ts).

useStaffLogin(["manage_settings"]);

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.getByRole("tab", { name: /Kargo ve ücretler/ })).toBeVisible();
}

const IBAN_1 = "TR330006100519786457841326";
const IBAN_2 = "TR320010009999901234567890";

/** The Owner's bank accounts are shop-wide rows; put back what was there before this file. */
let accountsBefore = "[]";
test.beforeAll(() => {
  const out = runDjangoScript(`
import json
from store_backend.shop.models import BankAccount
print("ACCOUNTS " + json.dumps(list(BankAccount.objects.values("name", "account_holder", "iban"))))
`);
  accountsBefore = /ACCOUNTS (.*)/.exec(out)?.[1] ?? "[]";
  // Every test below starts from no account, whatever the shop had.
  runDjangoScript(`
from store_backend.shop.models import BankAccount

BankAccount.objects.all().delete()
print("CLEARED")
`);
});
test.afterAll(() => {
  runDjangoScript(`
import json
from store_backend.shop.models import BankAccount

BankAccount.objects.all().delete()
for i, row in enumerate(json.loads(${JSON.stringify(accountsBefore)})):
    BankAccount.objects.create(position=i, **row)
print("RESTORED")
`);
});

/** Press "Hesap ekle" and fill the n-th account (1-based). */
async function addAccount(
  page: Page,
  n: number,
  a: { bank: string; holder: string; iban: string },
) {
  await page.getByRole("button", { name: "Hesap ekle" }).click();
  await page.locator(`[id="bank_accounts-${n - 1}-name"]`).fill(a.bank);
  await page.locator(`[id="bank_accounts-${n - 1}-holder"]`).fill(a.holder);
  await page.locator(`[id="bank_accounts-${n - 1}-iban"]`).fill(a.iban);
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

test("shows the tabs and the legal versions on their own tab", async ({ page }) => {
  await openSettings(page);
  for (const name of [
    "Kargo ve ücretler",
    "Banka bilgileri",
    "Bildirimler",
    "Satıcı bilgileri",
    "Yasal metin sürümleri",
  ]) {
    await expect(tab(page, name)).toBeVisible();
  }
  // The home page banner is managed in Banner'lar, not here.
  await expect(tab(page, "Ana sayfa afişi")).toHaveCount(0);
  // Free shipping is not a Settings field (it will be a Campaign); only the fallback fee is.
  await expect(page.getByLabel("Ücretsiz kargo eşiği (₺)")).toHaveCount(0);
  await tab(page, "Yasal metin sürümleri").click();
  await expect(page.getByRole("tabpanel", { name: /Yasal/ })).toBeVisible();
});

test("edits in two tabs are saved with a single PATCH", async ({ page }) => {
  const sent = patches(page);
  await openSettings(page);

  await page.getByLabel("Yedek kargo ücreti (₺)").fill("41.50");
  await tab(page, "Banka bilgileri").click();
  await addAccount(page, 1, { bank: "E2E Bank", holder: "E2E Hesap", iban: IBAN_1 });

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    shipping_fee: "41.50",
    bank_accounts: [{ name: "E2E Bank", account_holder: "E2E Hesap", iban: IBAN_1 }],
  });
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

test("the Owner keeps several bank accounts, in order, and they survive a reload", async ({
  page,
}) => {
  await openSettings(page);
  await tab(page, "Banka bilgileri").click();
  // Start from none so the test does not depend on the one before it.
  const remove = page.getByRole("button", { name: /hesabı sil$/ });
  while ((await remove.count()) > 0) await remove.first().click();

  await addAccount(page, 1, { bank: "Ziraat", holder: "Aura Tekstil", iban: IBAN_1 });
  await addAccount(page, 2, {
    bank: "İş Bankası",
    holder: "Aura Tekstil",
    iban: "tr32 0010 0099 9990 1234 5678 90", // typed with spaces and lower case
  });
  await page.getByRole("button", { name: "2. hesabı yukarı taşı" }).click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();

  await page.reload();
  await tab(page, "Banka bilgileri").click();
  await expect(page.locator('[id="bank_accounts-0-name"]')).toHaveValue("İş Bankası");
  await expect(page.locator('[id="bank_accounts-0-iban"]')).toHaveValue(IBAN_2); // stored clean
  await expect(page.locator('[id="bank_accounts-1-name"]')).toHaveValue("Ziraat");

  await page.getByRole("button", { name: "1. hesabı sil" }).click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();
  await page.reload();
  await tab(page, "Banka bilgileri").click();
  await expect(page.locator('[id="bank_accounts-0-name"]')).toHaveValue("Ziraat");
  await expect(page.locator('[id="bank_accounts-1-name"]')).toHaveCount(0);
});

test("a wrong IBAN names its row, marks the tab and blocks the save", async ({ page }) => {
  const sent = patches(page);
  await openSettings(page);
  await tab(page, "Banka bilgileri").click();
  const remove = page.getByRole("button", { name: /hesabı sil$/ });
  while ((await remove.count()) > 0) await remove.first().click();
  await addAccount(page, 1, { bank: "Ziraat", holder: "Aura Tekstil", iban: "DE123" });
  await tab(page, "Kargo ve ücretler").click();

  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(tab(page, "Banka bilgileri")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1. hesap: Geçerli bir IBAN girin")).toBeVisible();
  expect(sent).toHaveLength(0);
});
