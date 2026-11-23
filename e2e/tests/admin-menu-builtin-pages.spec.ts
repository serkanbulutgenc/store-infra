import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";
import { runDjangoScript } from "../support/stack";

// Store-infra #133: the Owner adds the Contact page (İletişim) and the all-Campaigns list
// (Kampanyalar) to the Header from the Menu builder's built-in pages, and the links work.
const run = Date.now().toString(36);
const pages = [
  { builtin: "İletişim", label: `Bize Yazın ${run}`, path: "/iletisim", heading: /İletişim/ },
  { builtin: "Kampanyalar", label: `Fırsatlar ${run}`, path: "/kampanyalar", heading: /Kampanyalar/ },
];

useStaffLogin(["manage_menus"]);

test.afterAll(() => {
  runDjangoScript(`
from store_backend.shop.models import MenuItem
MenuItem.objects.filter(label__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

test("İletişim and Kampanyalar can be added to the Header and are followed", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/admin/menus");
  for (const p of pages) {
    await page.getByRole("button", { name: "Öğe ekle" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Hedef türü").selectOption({ label: "Hazır sayfa" });
    await dialog.getByLabel("Sayfa").selectOption({ label: p.builtin });
    await dialog.getByLabel(/^Ad/).fill(p.label);
    await dialog.getByRole("button", { name: "Ekle" }).click();
  }
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Menü kaydedildi ve yayında.").first()).toBeVisible();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  for (const p of pages) {
    await vp.goto("/");
    const link = vp
      .getByRole("navigation", { name: "Kategoriler", exact: true })
      .getByRole("link", { name: p.label });
    await expect(link).toHaveAttribute("href", p.path);
    await link.click();
    await expect(vp).toHaveURL(new RegExp(`${p.path}$`));
    await expect(vp.getByRole("heading", { name: p.heading }).first()).toBeVisible();
  }
  await visitor.close();
});
