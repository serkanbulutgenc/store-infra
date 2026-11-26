import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner, seedStaff } from "../support/seed";

// Store-infra #172-#174: the home page has no Banner Slots of its own. Its images are managed in
// the Vitrin, so the Banner'lar screen offers only the announcement bar and the Category page top,
// and a Slayt section can no longer pick Banners. #176: Banner'lar left the menu, and its two
// lists are tabs under Vitrin, for the Owner and Staff alike. Nothing here changes data.
type State = Awaited<ReturnType<typeof loginState>>;
let ownerState: State;
let staffState: State;

test.beforeAll(async ({ browser, baseURL }) => {
  ownerState = await loginState(browser, baseURL, seedOwner());
  staffState = await loginState(browser, baseURL, seedStaff());
});

test("the Banner'lar screen offers only the announcement bar and the Category page top", async ({
  context,
  page,
}) => {
  await context.addCookies(ownerState.cookies);
  await page.goto("/admin/banners");

  await page.getByRole("button", { name: "Yeni banner" }).click();
  const slots = page.getByLabel("Alan", { exact: true });
  await expect(slots.locator("option")).toHaveText(["Duyuru çubuğu", "Kategori sayfası üstü"]);
  // New Banners start on the Category page top, the Slot that takes pictures.
  await expect(slots).toHaveValue("category_top");

  // An old link to a retired Slot just shows the list.
  await page.goto("/admin/banners?slot=home_hero");
  await expect(page.getByRole("heading", { name: "Banner'lar" }).first()).toBeVisible();
});

test("a Slayt section offers its own images, not Banners", async ({ context, page }) => {
  await context.addCookies(ownerState.cookies);
  await page.goto("/admin/homepage");

  await page.getByRole("button", { name: "Slayt: ayarlar" }).first().click();
  const source = page.getByLabel("Slayt nereden gelsin?");
  await expect(source.locator("option")).toHaveText([
    "Öne çıkan ürünler (ana sayfa koleksiyonu ya da yeni ürünler)",
    "Bir koleksiyon",
    "Kendi görsellerim",
  ]);
});

for (const role of ["Owner", "Staff"] as const) {
  test(`${role}: Banner'lar is not in the menu, its two lists are tabs under Vitrin`, async ({
    context,
    page,
  }) => {
    await context.addCookies((role === "Owner" ? ownerState : staffState).cookies);
    await page.goto("/admin/homepage");

    const menu = page.getByRole("navigation", { name: "Yönetim" });
    await expect(menu.getByRole("link", { name: "Vitrin" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Banner'lar" })).toHaveCount(0);

    const tabs = page.getByRole("navigation", { name: "Vitrin bölümleri" });
    await expect(tabs.getByRole("link")).toHaveText([
      "Düzen",
      "Duyuru çubuğu",
      "Kategori sayfası üstü",
    ]);
    await expect(tabs.getByRole("link", { name: "Düzen" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Duyuru çubuğu" }).click();

    await expect(page).toHaveURL(/\/admin\/banners\?slot=announcement/);
    await expect(page.getByRole("heading", { name: "Vitrin", exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Duyuru çubuğu" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The menu keeps Vitrin highlighted on the banner pages, and the breadcrumbs show it.
    await expect(menu.getByRole("link", { name: "Vitrin" })).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("navigation", { name: "Konum" }).getByRole("listitem"),
    ).toHaveText(["Yönetim", "Vitrin"]);

    await tabs.getByRole("link", { name: "Kategori sayfası üstü" }).click();
    await expect(page).toHaveURL(/slot=category_top/);
  });
}
