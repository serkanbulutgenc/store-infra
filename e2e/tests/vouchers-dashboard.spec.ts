import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { resetCheckoutRateLimit, type Seed, seedShop, seedStaff } from "../support/seed";

// The Owner's Voucher journey: create a Voucher in the Dashboard, a Guest uses it in the cart
// and at checkout, and the order shows the Voucher and its redemption back in the Dashboard.
// An Owner needs TOTP, so a Staff user with `manage_vouchers` granted directly stands in.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36).toUpperCase();
const CODE = `E2E${run}`;

let seed: Seed;
let ownerState: Awaited<ReturnType<typeof loginState>>;
let orderNumber = "";

test.beforeAll(async ({ browser, baseURL }) => {
  resetCheckoutRateLimit();
  seed = seedShop();
  ownerState = await loginState(browser, baseURL, seedStaff(["manage_vouchers"]));
});

test("the Owner creates a voucher in the Dashboard", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: ownerState });
  const page = await context.newPage();
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/admin");
  await page.getByRole("link", { name: "Kuponlar" }).click();
  await expect(page).toHaveURL(/\/admin\/vouchers/);
  await expect(page.getByRole("heading", { name: "Kuponlar" })).toBeVisible();

  await page.getByRole("button", { name: "Yeni kupon" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kupon kodu").fill(` ${CODE.toLowerCase()} `);
  await dialog.getByLabel("İndirim yüzdesi").fill("10");
  await dialog.getByLabel("Alt sınır (₺)").fill("50");
  await dialog.getByLabel("Toplam kullanım sınırı").fill("5");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  // The code was tidied up to capitals, and the list shows what was set, unused so far.
  const row = page.locator("tr", { hasText: CODE });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").first()).toHaveText(CODE); // exactly, so in capitals
  await expect(row).toContainText("%10 indirim");
  await expect(row).toContainText("₺50,00");
  await expect(row).toContainText("Aktif");
  await expect(row).toContainText("0 / 5");
  expect(pageErrors).toEqual([]);
  await context.close();
});

test("a guest uses the voucher in the cart and at checkout", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/ara");
  await page.getByRole("link", { name: new RegExp(seed.title) }).first().click();
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await expect(page.getByText("Ürün sepete eklendi.")).toBeVisible();

  // A full load of the cart keeps the basket and takes a lowercase code.
  await page.goto("/sepet");
  await page.getByLabel("Kupon kodu").fill(CODE.toLowerCase());
  await page.getByRole("button", { name: "Uygula" }).click();
  await expect(page.getByText(`Kupon (${CODE})`)).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible(); // 10% of the 100,00 item

  await page.getByRole("link", { name: "Ödemeye geç" }).click();
  await expect(page.getByRole("heading", { name: "Ödeme", exact: true })).toBeVisible();
  await expect(page.getByText(`Kupon (${CODE})`)).toBeVisible();
  await page.getByLabel("Ad soyad").fill("E2E Alıcı");
  await page.getByLabel("E-posta", { exact: true }).fill(`e2e.voucher.${run.toLowerCase()}@example.com`);
  await page.getByLabel("Telefon").fill("0532 123 45 67");
  await page.getByLabel("İl", { exact: true }).fill("İstanbul");
  await page.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await page.getByLabel("Mahalle", { exact: true }).fill("Caferağa");
  await page.getByLabel("Cadde, sokak, bina ve daire no").fill("Moda Caddesi No 1 Daire 2");
  await page.getByRole("radio", { name: /Kapıda ödeme/ }).check();
  await page.getByLabel(/Kapıda ödeme bedeli olan/).check();
  await page.getByLabel(/Mesafeli satış sözleşmesini/).check();
  await page.getByRole("button", { name: /Siparişi onayla/ }).click();

  await expect(page).toHaveURL(/\/siparis-onayi/);
  await expect(page.getByRole("heading", { name: "Siparişiniz alındı" })).toBeVisible();
  await expect(page.getByText(`Kupon (${CODE})`)).toBeVisible();
  orderNumber = (await page.getByText(/Sipariş numaranız:/).locator("strong").innerText()).trim();
  expect(orderNumber).not.toBe("");
  expect(pageErrors).toEqual([]);
});

test("the order and the voucher list show the redemption in the Dashboard", async ({
  browser,
  baseURL,
}) => {
  expect(orderNumber, "the previous test places the order").not.toBe("");
  const context = await browser.newContext({ baseURL, storageState: ownerState });
  const page = await context.newPage();

  // The order shows the voucher and what it took off; the line stays as charged.
  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByText(`Kupon (${CODE})`)).toBeVisible();
  await expect(page.getByText("−₺10,00")).toBeVisible();
  await expect(page.getByText(/kupon düşüldükten sonraki/)).toBeVisible();

  // And the voucher counts one use.
  await page.goto("/admin/vouchers");
  await expect(page.locator("tr", { hasText: CODE })).toContainText("1 / 5");
  await context.close();
});

// Staff run the shop day to day but do not manage Vouchers (owner-only `manage_vouchers`).
test.describe("Staff", () => {
  let staffState: Awaited<ReturnType<typeof loginState>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    staffState = await loginState(browser, baseURL, seedStaff());
  });

  test("have no Vouchers area: no menu entry, the page sends them home, the API refuses", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, storageState: staffState });
    const page = await context.newPage();

    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "Siparişler" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Kuponlar" })).toHaveCount(0);

    await page.goto("/admin/vouchers");
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "Kuponlar" })).toHaveCount(0);

    // The same session works for what Staff may do, so a refusal below is about the permission.
    expect((await page.request.get("/api/admin/orders")).status()).toBe(200);
    const refused = await page.request.get("/api/admin/vouchers");
    expect(refused.status()).toBe(403);
    await context.close();
  });

  test("still see the voucher on an order, as charged", async ({ browser, baseURL }) => {
    expect(orderNumber, "the order of the guest journey above").not.toBe("");
    const context = await browser.newContext({ baseURL, storageState: staffState });
    const page = await context.newPage();

    await page.goto(`/admin/orders/${orderNumber}`);
    await expect(page.getByText(`Kupon (${CODE})`)).toBeVisible();
    await expect(page.getByText("−₺10,00")).toBeVisible();
    await context.close();
  });
});
