import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #131: every Markdown field in the Dashboard shows the text or its preview behind a
// Yazı / Önizleme toggle, never both side by side. Checked on the Legal page and Campaign page
// editors (the Product Description and size guide already work this way: admin-product-description).
const run = Date.now().toString(36);
const title = `E2E Önizleme ${run}`;

test.afterAll(() => {
  runDjangoScript(`
from store_backend.catalog.models import CampaignPage

CampaignPage.objects.filter(title__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

test("the Legal page and Campaign page editors preview behind a toggle", async ({
  browser,
  baseURL,
}) => {
  const state = await loginState(browser, baseURL, seedOwner());
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  const page = await context.newPage();

  // Legal page: the text is a box, there is no always-visible preview, and the toggle swaps them.
  await page.goto("/admin/legal-pages/privacy_notice");
  const text = page.getByLabel("Metin (Markdown)");
  await expect(text).toBeVisible();
  await expect(page.getByRole("region", { name: "Önizleme" })).toHaveCount(0);
  await text.fill("# Başlık\n\n**kalın** metin");
  await page.getByRole("button", { name: "Önizleme", exact: true }).click();
  await expect(text).toHaveCount(0);
  const preview = page.getByTestId("markdown-preview");
  await expect(preview.getByRole("heading", { name: "Başlık" })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("kalın");
  await page.getByRole("button", { name: "Yazı", exact: true }).click();
  await expect(text).toHaveValue("# Başlık\n\n**kalın** metin"); // switching back keeps the text

  // Campaign page: same.
  await page.goto("/admin/campaigns?tab=pages");
  await page.getByRole("link", { name: "Yeni kampanya sayfası" }).click();
  await page.getByLabel("Başlık").fill(title);
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("region", { name: "Önizleme" })).toHaveCount(0);
  await page.getByLabel("Metin (Markdown)").fill("- bir\n- iki");
  await page.getByRole("button", { name: "Önizleme", exact: true }).click();
  await expect(page.getByTestId("markdown-preview").getByRole("listitem")).toHaveCount(2);
  await context.close();
});
