import { expect, type Page, test } from "@playwright/test";
import { tab, useStaffLogin } from "../support/auth";
import { type DescriptionSeed, seedDescriptionProduct } from "../support/seed";

// The Product Description: Markdown written in the Dashboard (toolbar, preview, image upload) and
// shown on the Storefront. As a Staff user, who may edit Descriptions and upload their images.
test.describe.configure({ mode: "serial" });

let product: DescriptionSeed;

useStaffLogin([], () => {
  product = seedDescriptionProduct();
});

// A valid 1x1 PNG: the upload endpoint has no minimum size.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const area = (page: Page) => page.getByRole("textbox", { name: "Açıklama" });

async function openDescription(page: Page) {
  await page.goto(`/admin/products/${product.id}`);
  await tab(page, "Açıklama").click();
  await expect(area(page)).toBeVisible();
}

test("the toolbar formats the text, and an uploaded image lands in it", async ({ page }) => {
  await openDescription(page);

  await area(page).fill("ilk satır\niki");
  await area(page).press("Control+a");
  await page.getByRole("button", { name: "Madde listesi" }).click();
  await expect(area(page)).toHaveValue("- ilk satır\n- iki");

  // The list lines stay selected, so Kalın would wrap them: move to the end for a placeholder.
  await area(page).press("Control+End");
  await page.getByRole("button", { name: /^Kalın/ }).click();
  await expect(area(page)).toHaveValue("- ilk satır\n- iki**kalın metin**");

  await page.getByLabel("Görsel dosyası seç").setInputFiles({
    name: "kumas.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(area(page)).toHaveValue(/!\[görsel açıklaması\]\(.*\/media\/description\/.+\.png\)/);
  await expect(page.getByText("1 görselin açıklaması (alt metni) eksik.")).toBeVisible();
});

test("the preview shows what the Storefront will, including the uploaded image", async ({
  page,
}) => {
  await openDescription(page);
  await area(page).fill("**Pamuklu** kumaş\n\n![Kumaş](/media/description/yok.png)");
  await page.getByLabel("Görsel dosyası seç").setInputFiles({
    name: "kumas.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(area(page)).toHaveValue(/\/media\/description\/.+\.png/);

  await page.getByRole("button", { name: "Önizleme" }).click();
  const preview = page.getByTestId("description-preview");
  await expect(preview.locator("strong")).toHaveText("Pamuklu");
  // The uploaded file is served: the browser could decode it.
  const uploaded = preview.locator('img[src*="/media/description/"]').last();
  await expect.poll(() => uploaded.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Yazı" }).click();
  await expect(area(page)).toHaveValue(/Pamuklu/);
});

test("a saved Description shows on the Storefront product page, safely", async ({ page }) => {
  await openDescription(page);
  await area(page).fill(
    [
      "### Bakım",
      "",
      "**Pamuklu** ve *yumuşak*",
      "",
      "- 30 derecede yıkayın",
      "",
      "| Beden | Göğüs |",
      "| --- | --- |",
      "| M | 96 |",
      "",
      "<script>window.__xss = 1</script>",
      "![dış](https://evil.example/x.png)",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  await page.goto(`/urun/${product.slug}`);
  await page.getByRole("tab", { name: "Açıklama" }).click();
  const panel = page.getByRole("tabpanel", { name: "Açıklama" });
  await expect(panel.getByRole("heading", { name: "Bakım", level: 3 })).toBeVisible();
  await expect(panel.locator("strong")).toHaveText("Pamuklu");
  await expect(panel.getByRole("listitem")).toHaveText("30 derecede yıkayın");
  await expect(panel.getByRole("cell", { name: "96" })).toBeVisible();
  await expect(panel.locator("script")).toHaveCount(0);
  await expect(panel.locator('img[src*="evil.example"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test("a Description over 5000 characters is refused before anything is sent", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith(`/products/${product.id}`)) writes.push(r.url());
  });
  await openDescription(page);

  await area(page).fill("a".repeat(5001));
  await expect(page.getByText("5001 / 5000")).toBeVisible();
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByText("Açıklama en fazla 5000 karakter olabilir.")).toBeVisible();
  await expect(tab(page, "Açıklama").getByText("Geçersiz alan var")).toBeAttached();
  expect(writes).toHaveLength(0);
});

test("a file that is not an image is refused and the text is left alone", async ({ page }) => {
  await openDescription(page);
  await area(page).fill("değişmez");

  await page.getByLabel("Görsel dosyası seç").setInputFiles({
    name: "not.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("merhaba"),
  });

  await expect(page.getByText("Yalnızca JPEG, PNG veya WebP dosyaları yüklenebilir.")).toBeVisible();
  await expect(area(page)).toHaveValue("değişmez");
});

test("a wide table scrolls inside its own box on a phone, not the whole page", async ({ page }) => {
  const cells = (cell: string) => `| ${Array.from({ length: 8 }, () => cell).join(" | ")} |`;
  await openDescription(page);
  await area(page).fill(
    [cells("Çok uzun bir sütun başlığı"), cells("---"), cells("Çok uzun bir hücre değeri")].join("\n"),
  );
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ürün kaydedildi.")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/urun/${product.slug}`);
  await page.getByRole("tab", { name: "Açıklama" }).click();
  const box = page.getByRole("tabpanel", { name: "Açıklama" }).locator(".overflow-x-auto");
  await expect(box.getByRole("table")).toBeVisible();

  const sizes = await box.evaluate((el: HTMLElement) => ({
    inner: el.clientWidth,
    content: el.scrollWidth,
    page: document.documentElement.scrollWidth,
    window: window.innerWidth,
  }));
  expect(sizes.content).toBeGreaterThan(sizes.inner); // the table is wider than its box...
  expect(sizes.page).toBeLessThanOrEqual(sizes.window); // ...and the page does not grow with it
});
