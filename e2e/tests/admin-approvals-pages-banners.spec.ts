import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner, seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #121: the approval rule on Campaign pages and Banners. Staff draft and submit, the
// Owner decides from the queue at /admin/approvals, and the Storefront follows the Owner's
// decision only. A Staff edit to a live item waits as a pending change and the live version stays
// on the Storefront until it is approved. A rejection shows its reason to the submitter.
// The Banner is an announcement-bar message: it needs no image, so the spec stays about approval.
const run = Date.now().toString(36);
const page = {
  title: `E2E Kampanya ${run}`,
  slug: `e2e-kampanya-${run}`,
  text: `Bu kampanya sayfasının ilk metni ${run}.`,
  edited: `Bu kampanya sayfasının yeni metni ${run}.`,
  rejectedTitle: `E2E Reddedilen Kampanya ${run}`,
  reason: `Görsel eksik ${run}`,
};
const banner = {
  message: `E2E duyuru ${run}`,
  edited: `E2E yeni duyuru ${run}`,
  rejected: `E2E reddedilen duyuru ${run}`,
  reason: `Mesaj uygun değil ${run}`,
};

type State = Awaited<ReturnType<typeof loginState>>;
let staffState: State;
let ownerState: State;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  staffState = await loginState(browser, baseURL, seedStaff());
  ownerState = await loginState(browser, baseURL, seedOwner());
});

// An announcement left live would show on every Storefront page the other specs open.
test.afterAll(() => {
  runDjangoScript(`
from store_backend.catalog.models import Banner, CampaignPage

Banner.objects.filter(message__contains=${JSON.stringify(run)}).delete()
CampaignPage.objects.filter(slug__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

async function as(
  browser: Browser,
  baseURL: string | undefined,
  state: State,
) {
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  return { context, page: await context.newPage() };
}

/** Open one waiting item from the Owner's queue; `title` is the row's title. */
async function review(owner: Page, title: string) {
  await owner.goto("/admin/approvals");
  await owner.getByRole("button", { name: `${title} incele` }).click();
  return owner.getByRole("dialog");
}

test("a Staff Campaign page goes live only once the Owner approves it", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/campaign-pages"); // redirects to the Kampanyalar screen
  await expect(sp).toHaveURL(/\/admin\/campaigns\?tab=pages/);
  await sp.getByRole("link", { name: "Yeni kampanya sayfası" }).click();
  await expect(sp).toHaveURL(/\/admin\/campaign-pages\/new$/);
  await sp.getByLabel("Başlık").fill(page.title);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: page.title })).toBeVisible();

  await sp.getByLabel("Adres").fill(page.slug);
  await sp.getByLabel("Metin (Markdown)").fill(page.text);
  await sp.getByRole("button", { name: "Kaydet" }).click();
  await expect(sp.getByText("Sayfa kaydedildi.").first()).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).first().click();
  await expect(sp.getByText("Sayfa onaya gönderildi.").first()).toBeVisible();
  await expect(sp.getByText("Onay bekliyor").first()).toBeVisible();
  // Staff have no way to publish it themselves.
  await expect(sp.getByRole("button", { name: "Yayınla" })).toHaveCount(0);
  await staff.context.close();

  // Waiting for approval, the page is not on the Storefront.
  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  expect((await vp.goto(`/kampanyalar/${page.slug}`))?.status()).toBe(404);

  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, page.title);
  await expect(dialog).toContainText("Kampanya sayfası");
  await expect(dialog).toContainText(page.text);
  await dialog.getByRole("button", { name: "Onayla" }).click();
  await expect(owner.page.getByText("Onaylandı.").first()).toBeVisible();
  await expect(owner.page.getByRole("button", { name: `${page.title} incele` })).toHaveCount(0);
  await owner.context.close();

  await vp.goto(`/kampanyalar/${page.slug}`);
  await expect(vp.getByRole("heading", { name: page.title })).toBeVisible();
  await expect(vp.getByText(page.text)).toBeVisible();
  await vp.goto("/kampanyalar");
  await expect(vp.getByRole("heading", { name: page.title })).toBeVisible();
  await visitor.close();
});

test("a Staff edit of a live Campaign page stays hidden until the Owner approves it", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/campaign-pages");
  await sp.getByRole("link", { name: page.title, exact: true }).click();
  await expect(sp.getByText("sahibin onayına gider").first()).toBeVisible();
  await sp.getByLabel("Metin (Markdown)").fill(page.edited);
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(sp.getByText("Değişiklik onaya gönderildi.").first()).toBeVisible();
  await expect(sp.getByRole("heading", { name: "Bekleyen değişiklik" })).toBeVisible();
  await staff.context.close();

  // The live version is still what the Storefront shows.
  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto(`/kampanyalar/${page.slug}`);
  await expect(vp.getByText(page.text)).toBeVisible();
  await expect(vp.getByText(page.edited)).toHaveCount(0);

  // The Owner sees live and waiting side by side, with the changed field marked.
  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, page.title);
  await expect(dialog).toContainText("Yayındaki sürümde değişiklik");
  const changed = dialog.locator('tr[data-changed="true"]');
  await expect(changed).toHaveCount(1);
  await expect(changed).toContainText(page.text);
  await expect(changed).toContainText(page.edited);
  await dialog.getByRole("button", { name: "Onayla" }).click();
  await expect(owner.page.getByText("Onaylandı.").first()).toBeVisible();
  await owner.context.close();

  await vp.reload();
  await expect(vp.getByText(page.edited)).toBeVisible();
  await expect(vp.getByText(page.text)).toHaveCount(0);
  await visitor.close();
});

test("a rejected edit of a live Campaign page shows its reason to Staff and the live text stays", async ({
  browser,
  baseURL,
}) => {
  const rejectedEdit = `Reddedilecek metin ${run}.`;
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/campaign-pages");
  await sp.getByRole("link", { name: page.title, exact: true }).click();
  await sp.getByLabel("Metin (Markdown)").fill(rejectedEdit);
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(sp.getByText("Değişiklik onaya gönderildi.").first()).toBeVisible();
  // Nothing was rejected yet, so no reason is shown.
  await expect(sp.getByText(/^Reddedildi:/)).toHaveCount(0);

  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, page.title);
  await dialog.getByLabel(/Gerekçe/).fill(page.reason);
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(owner.page.getByText("Reddedildi.").first()).toBeVisible();
  await owner.context.close();

  // The page is still live, with no pending change, and Staff are told why the edit went.
  await sp.reload();
  await expect(sp.getByText("Yayında").first()).toBeVisible();
  await expect(sp.getByRole("heading", { name: "Bekleyen değişiklik" })).toHaveCount(0);
  await expect(sp.getByText(`Reddedildi: ${page.reason}`)).toBeVisible();
  await staff.context.close();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto(`/kampanyalar/${page.slug}`);
  await expect(vp.getByText(page.edited)).toBeVisible();
  await expect(vp.getByText(rejectedEdit)).toHaveCount(0);
  await visitor.close();
});

test("a rejected Campaign page shows its reason to Staff and stays off the Storefront", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/campaign-pages"); // redirects to the Kampanyalar screen
  await expect(sp).toHaveURL(/\/admin\/campaigns\?tab=pages/);
  await sp.getByRole("link", { name: "Yeni kampanya sayfası" }).click();
  await expect(sp).toHaveURL(/\/admin\/campaign-pages\/new$/);
  await sp.getByLabel("Başlık").fill(page.rejectedTitle);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: page.rejectedTitle })).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).first().click();
  await expect(sp.getByText("Sayfa onaya gönderildi.").first()).toBeVisible();

  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, page.rejectedTitle);
  await dialog.getByLabel(/Gerekçe/).fill(page.reason);
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(owner.page.getByText("Reddedildi.").first()).toBeVisible();
  await owner.context.close();

  await sp.reload();
  await expect(sp.getByText(`Reddedildi: ${page.reason}`)).toBeVisible();
  await expect(sp.getByText("Taslak").first()).toBeVisible();
  await staff.context.close();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto("/kampanyalar");
  await expect(vp.getByRole("heading", { name: page.rejectedTitle })).toHaveCount(0);
  await visitor.close();
});

test("a Staff Banner is shown on the Storefront only after approval, and its edit waits", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/banners");
  await sp.getByRole("button", { name: "Yeni banner" }).click();
  await sp.getByLabel("Alan", { exact: true }).selectOption({ label: "Duyuru çubuğu" });
  await sp.getByLabel("Mesaj").fill(banner.message);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: banner.message })).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).first().click();
  await expect(sp.getByText("Banner onaya gönderildi.").first()).toBeVisible();
  await staff.context.close();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto("/");
  await expect(vp.getByRole("region", { name: "Duyurular" })).toHaveCount(0);

  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, banner.message);
  await expect(dialog).toContainText("Duyuru çubuğu");
  await dialog.getByRole("button", { name: "Onayla" }).click();
  await expect(owner.page.getByText("Onaylandı.").first()).toBeVisible();

  await vp.reload();
  await expect(vp.getByRole("region", { name: "Duyurular" })).toContainText(banner.message);

  // Staff edit the live Banner: the new message waits, the old one stays.
  const staff2 = await as(browser, baseURL, staffState);
  const sp2 = staff2.page;
  await sp2.goto("/admin/banners");
  await sp2.getByRole("link", { name: banner.message, exact: true }).click();
  await sp2.getByLabel("Mesaj").fill(banner.edited);
  await sp2.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(sp2.getByText("Değişiklik onaya gönderildi.").first()).toBeVisible();
  await staff2.context.close();

  await vp.reload();
  await expect(vp.getByRole("region", { name: "Duyurular" })).toContainText(banner.message);
  await expect(vp.getByText(banner.edited)).toHaveCount(0);

  const edit = await review(owner.page, banner.message);
  await expect(edit).toContainText("Yayındaki sürümde değişiklik");
  await expect(edit).toContainText(banner.edited);
  await edit.getByRole("button", { name: "Onayla" }).click();
  await expect(owner.page.getByText("Onaylandı.").first()).toBeVisible();
  await owner.context.close();

  await vp.reload();
  await expect(vp.getByRole("region", { name: "Duyurular" })).toContainText(banner.edited);
  await visitor.close();
});

test("a rejected Banner shows its reason to Staff and never reaches the Storefront", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/banners");
  await sp.getByRole("button", { name: "Yeni banner" }).click();
  await sp.getByLabel("Alan", { exact: true }).selectOption({ label: "Duyuru çubuğu" });
  await sp.getByLabel("Mesaj").fill(banner.rejected);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: banner.rejected })).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).first().click();
  await expect(sp.getByText("Banner onaya gönderildi.").first()).toBeVisible();

  const owner = await as(browser, baseURL, ownerState);
  const dialog = await review(owner.page, banner.rejected);
  await dialog.getByLabel(/Gerekçe/).fill(banner.reason);
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(owner.page.getByText("Reddedildi.").first()).toBeVisible();
  await owner.context.close();

  await sp.reload();
  await expect(sp.getByText(`Reddedildi: ${banner.reason}`)).toBeVisible();
  await staff.context.close();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto("/");
  await expect(vp.getByText(banner.rejected)).toHaveCount(0);
  await visitor.close();
});
