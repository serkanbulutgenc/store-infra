import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { solidPng } from "../support/images";
import { seedOwner, seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #170: images that belong to Homepage sections (#168, #169). The Owner uploads an
// image for an Afiş section and slides for a Slayt section in the Vitrin editor and they show on
// the Storefront; a Staff upload stays off the Storefront until the Owner approves the layout.
// The layout is one row for the whole shop, so the spec puts the default back before and after.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const ALT = {
  afis: `Afiş görseli ${run}`,
  one: `Birinci slayt ${run}`,
  two: `İkinci slayt ${run}`,
  staff: `Personel slaydı ${run}`,
};

type State = Awaited<ReturnType<typeof loginState>>;
let ownerState: State;
let staffState: State;

const RESET = `
from store_backend.services import homepage
from store_backend.staff.models import PendingChange

layout = homepage.get()
layout.sections = homepage.default_sections()
layout.rejection_reason = ""
layout.save()
PendingChange.objects.filter(
    object_id=layout.pk, content_type__model="homepagelayout"
).delete()
print("RESET")
`;

function reset() {
  const out = runDjangoScript(RESET);
  if (!out.includes("RESET")) throw new Error(out);
}

test.beforeAll(async ({ browser, baseURL }) => {
  reset();
  ownerState = await loginState(browser, baseURL, seedOwner());
  staffState = await loginState(browser, baseURL, seedStaff());
});

test.afterAll(() => {
  reset();
  runDjangoScript(`
from store_backend.catalog.models import Banner

Banner.objects.filter(slot="layout", image_alt__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

const picture = (colour: [number, number, number]) => ({
  name: "gorsel.png",
  mimeType: "image/png",
  buffer: solidPng(1200, 600, colour),
});

const img = (page: Page, alt: string) => page.locator(`img[alt="${alt}"]`);

/** The Storefront is cached for a moment and the pictures are made by a worker, so look again. */
async function homeShows(page: Page, alt: string, shown: boolean) {
  await expect(async () => {
    await page.goto("/");
    await expect(img(page, alt)).toHaveCount(shown ? 1 : 0, { timeout: 2000 });
  }).toPass();
}

/** Adds a section of `type` at the bottom of the Vitrin editor and opens its settings. */
async function addAndOpen(page: Page, type: string) {
  await page.getByLabel("Bölüm türü").selectOption({ label: type });
  await page.getByRole("button", { name: `${type}: ayarlar` }).last().click();
}

/** Fills the new-image form of a section (description first) and picks the file. */
async function upload(page: Page, label: string, alt: string, colour: [number, number, number]) {
  await page.getByLabel(`${label}: görsel açıklaması`).fill(alt);
  await page.getByLabel(`${label}: görsel yükle`).setInputFiles(picture(colour));
}

test("the Owner uploads an Afiş image and it shows on the Storefront", async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await owner.newPage();
  await page.goto("/admin/homepage");

  await addAndOpen(page, "Afiş");
  // A description is needed before the file is sent.
  await page.getByLabel("Afiş: görsel yükle").setInputFiles(picture([200, 30, 30]));
  await expect(page.getByText("Önce görselin açıklamasını yazın.")).toBeVisible();

  await upload(page, "Afiş", ALT.afis, [200, 30, 30]);
  await expect(page.getByLabel("Afiş: görseli değiştir")).toBeVisible();
  await expect(page.getByLabel(`Afiş: görsel açıklaması`)).toHaveValue(ALT.afis);

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Vitrin kaydedildi ve yayında.").first()).toBeVisible();

  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  await homeShows(await shopper.newPage(), ALT.afis, true);
  await shopper.close();
  await owner.close();
});

test("the Owner uploads slides for a Slayt, reorders them, and they show in that order", async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const page = await owner.newPage();
  await page.goto("/admin/homepage");

  await addAndOpen(page, "Slayt");
  await page.getByLabel("Slayt nereden gelsin?").selectOption({ label: "Kendi görsellerim" });
  // The section needs a slide before it can be saved.
  await expect(page.getByRole("alert").filter({ hasText: "En az bir slayt yükleyin." })).toBeVisible();

  await upload(page, "Yeni slayt", ALT.one, [30, 30, 200]);
  await expect(page.getByLabel("Slayt 1: görsel açıklaması")).toHaveValue(ALT.one);
  await upload(page, "Yeni slayt", ALT.two, [30, 160, 60]);
  await expect(page.getByLabel("Slayt 2: görsel açıklaması")).toHaveValue(ALT.two);

  await page.getByRole("button", { name: "Slayt 2: yukarı taşı" }).click();
  await expect(page.getByLabel("Slayt 1: görsel açıklaması")).toHaveValue(ALT.two);

  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Vitrin kaydedildi ve yayında.").first()).toBeVisible();

  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  const home = await shopper.newPage();
  await homeShows(home, ALT.two, true);
  await expect(img(home, ALT.one)).toHaveCount(1);
  const secondFirst = await img(home, ALT.two).evaluate(
    (second, first) => !!(first && second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING),
    await img(home, ALT.one).elementHandle(),
  );
  expect(secondFirst).toBe(true);
  await shopper.close();
  await owner.close();
});

test("a Staff upload stays off the Storefront until the Owner approves the layout", async ({
  browser,
  baseURL,
}) => {
  const staff = await browser.newContext({ baseURL, storageState: staffState, locale: "tr-TR" });
  const sp = await staff.newPage();
  await sp.goto("/admin/homepage");
  await addAndOpen(sp, "Slayt");
  await sp.getByLabel("Slayt nereden gelsin?").selectOption({ label: "Kendi görsellerim" });
  await upload(sp, "Yeni slayt", ALT.staff, [120, 60, 160]);
  await expect(sp.getByLabel("Slayt 1: görsel açıklaması")).toHaveValue(ALT.staff);
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(
    sp.getByText("Değişiklik onaya gönderildi. Sahip onaylayınca yayına çıkar.").first(),
  ).toBeVisible();
  await staff.close();

  const shopper = await browser.newContext({ baseURL, locale: "tr-TR" });
  const home = await shopper.newPage();
  await homeShows(home, ALT.staff, false);

  const owner = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const op = await owner.newPage();
  await op.goto("/admin/approvals");
  await op.getByRole("button", { name: "Vitrin düzeni incele" }).click();
  await op.getByRole("button", { name: "Onayla" }).click();
  await expect(op.getByText("Onaylandı.").first()).toBeVisible();

  await homeShows(home, ALT.staff, true);
  await shopper.close();
  await owner.close();
});
