import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginState, tab } from "../support/auth";
import { linkIn, mailTo } from "../support/mail";
import {
  rejectPath,
  type StockAlertSeed,
  seedStaff,
  seedStockAlertShop,
  setStockAlerts,
} from "../support/seed";

// Stock alerts from "Haber ver" to the alert email (GLOSSARY: Stock alert). One sold-out Size, two
// guests, one Staff user. Staff holds `manage_settings` directly because an Owner needs TOTP.
// The Staff session lives in its own browser context: sharing it with the guests would make them
// signed-in Shoppers, and a signed-in Shopper gets no email field.
test.describe.configure({ mode: "serial" });

let shop: StockAlertSeed;
let staffState: Awaited<ReturnType<typeof loginState>>;
const run = Date.now().toString(36);
const guestA = `e2e-alert-a-${run}@example.com`;
const guestB = `e2e-alert-b-${run}@example.com`;

test.beforeAll(async ({ browser, baseURL }) => {
  setStockAlerts(false);
  shop = seedStockAlertShop();
  staffState = await loginState(browser, baseURL, seedStaff(["manage_settings"]));
});

// The setting is shop-wide: leave it off for the specs that run after this one.
test.afterAll(() => setStockAlerts(false));

async function asStaff<T>(browser: Browser, baseURL: string | undefined, work: (page: Page) => Promise<T>) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR", storageState: staffState });
  try {
    return await work(await context.newPage());
  } finally {
    await context.close();
  }
}

/** The product page with the sold-out Size M picked. */
async function pickSoldOutSize(page: Page) {
  await page.goto(`/urun/${shop.slug}`);
  await page.getByRole("button", { name: /^M/ }).click();
  await expect(page.getByRole("button", { name: "Tükendi", exact: true })).toBeDisabled();
}

/** Subscribe as a guest and confirm from the email's link, as a Shopper would. */
async function subscribeAndConfirm(page: Page, email: string) {
  await pickSoldOutSize(page);
  await page.getByRole("button", { name: "Haber ver", exact: true }).click();
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Haber ver", exact: true }).click();
  await expect(page.getByText("onay bağlantısı gönderdik")).toBeVisible();

  let confirm = "";
  await expect
    .poll(async () => {
      const mail = (await mailTo(email)).find((m) => m.subject.includes("onaylayın"));
      if (mail) confirm = linkIn(mail, "/stok-bildirimi/onayla");
      return confirm;
    })
    .not.toBe("");

  await page.goto(confirm);
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("kaydınız tamamlandı")).toBeVisible();
}

/** The "bekliyor" caption of the sold-out Size in the Dashboard stock grid ("" when none shows). */
async function waitingInGrid(page: Page): Promise<string> {
  await page.goto(`/admin/products/${shop.id}`);
  await tab(page, "Varyantlar").click();
  await page.getByRole("button", { name: "Stok tablosu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: / M stok$/ })).toBeVisible();
  return (await dialog.getByText(/\d+ bekliyor/).allTextContents()).join(",");
}

test("with the setting off a sold-out Size has no Haber ver", async ({ page }) => {
  await pickSoldOutSize(page);

  await expect(page.getByRole("button", { name: "Haber ver", exact: true })).toHaveCount(0);
});

test("the Dashboard switch turns Haber ver on", async ({ browser, baseURL, page }) => {
  await asStaff(browser, baseURL, async (staff) => {
    await staff.goto("/admin/settings");
    await tab(staff, "Stok bildirimi").click();
    await expect(staff.getByText(/İYS kaydı tamamlanmış olmalıdır/)).toBeVisible();
    await staff.getByLabel("Stok bildirimini aç (Haber ver)").check();
    await staff.getByRole("button", { name: "Kaydet" }).click();
    await expect(staff.getByText("Ayarlar kaydedildi.")).toBeVisible();
  });

  await pickSoldOutSize(page);
  await expect(page.getByRole("button", { name: "Haber ver", exact: true })).toBeVisible();
});

test("an in-stock Size has no Haber ver", async ({ page }) => {
  await page.goto(`/urun/${shop.slug}`);
  await page.getByRole("button", { name: /^L/ }).click();

  await expect(page.getByRole("button", { name: "Sepete ekle" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Haber ver", exact: true })).toHaveCount(0);
});

test("the consent box must be ticked, and a guest is waiting only after confirming", async ({
  browser,
  baseURL,
  page,
}) => {
  await pickSoldOutSize(page);
  await page.getByRole("button", { name: "Haber ver", exact: true }).click();
  await page.getByLabel("E-posta", { exact: true }).fill(guestA);
  await page.getByRole("button", { name: "Haber ver", exact: true }).click();
  await expect(page.getByText("onay kutusunu işaretleyin")).toBeVisible();

  await subscribeAndConfirm(page, guestA);

  await subscribeAndConfirm(await (await browser.newContext({ baseURL, locale: "tr-TR" })).newPage(), guestB);
  const waiting = await asStaff(browser, baseURL, waitingInGrid);
  expect(waiting).toBe("2 bekliyor");
});

test("a reject link removes the waiting Shopper and the count goes down", async ({
  browser,
  baseURL,
  page,
}) => {
  await page.goto(rejectPath(guestB, shop.soldOutVariantId));
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByText("Bildiriminiz silindi")).toBeVisible();

  const waiting = await asStaff(browser, baseURL, waitingInGrid);
  expect(waiting).toBe("1 bekliyor");
});

test("restocking sends the alert once, to the Shopper still waiting only", async ({
  browser,
  baseURL,
}) => {
  await asStaff(browser, baseURL, async (staff) => {
    await waitingInGrid(staff);
    const dialog = staff.getByRole("dialog");
    await dialog.getByRole("textbox", { name: / M stok$/ }).fill("4");
    await dialog.getByLabel("Gerekçe").fill("E2E restock");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(staff.getByText("1 stok değişikliği kaydedildi.")).toBeVisible();
  });

  const alertFor = async (email: string) =>
    (await mailTo(email)).filter((m) => m.subject.includes("yeniden stokta"));
  await expect.poll(async () => (await alertFor(guestA)).length).toBe(1);

  // The mail to the rejected Shopper would be sent in the same pass; give it time to show up.
  await new Promise((r) => setTimeout(r, 3000));
  expect(await alertFor(guestB)).toHaveLength(0);
  const [mail] = await alertFor(guestA);
  expect(mail?.text).toContain(shop.title);
  expect(mail?.text).toContain(`/urun/${shop.slug}`);
  expect(mail?.text).toContain("/stok-bildirimi/vazgec?token=");
  expect(await alertFor(guestA)).toHaveLength(1);
});

test("the waiting count is gone once the alert is sent", async ({ browser, baseURL }) => {
  const waiting = await asStaff(browser, baseURL, waitingInGrid);

  expect(waiting).toBe("");
});
