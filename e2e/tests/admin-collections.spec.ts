import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #26: the Collection admin screen. Staff draft and submit; the Owner approves,
// reviews a pending change and changes the cover image. The Owner is a Staff user holding the
// Owner's Collection permissions, since a real Owner needs TOTP.
const run = Date.now().toString(36);
const n = {
  name: `E2E Yönetim ${run}`,
  product: `E2E Koleksiyon Ürünü ${run}`,
  description: `Staff açıklaması ${run}`,
};
const OWNER = ["manage_collections", "delete_catalogue"];

type State = Awaited<ReturnType<typeof loginState>>;
let staffState: State;
let ownerState: State;
let url = "";

test.beforeAll(async ({ browser, baseURL }) => {
  const out = runDjangoScript(`
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Gri ${run}`)}, "#888888")
product = catalog.create_product(
    title=${JSON.stringify(n.product)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=catalog.create_category("E2E Yönetim ${run}"),
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size="M", stock=5)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(out);
  staffState = await loginState(browser, baseURL, seedStaff());
  ownerState = await loginState(browser, baseURL, seedStaff(OWNER));
});

/** A page signed in as the given user. */
async function as(browser: import("@playwright/test").Browser, baseURL: string | undefined, state: State) {
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  return { page: await context.newPage(), close: () => context.close() };
}

/** A solid-colour PNG, built by hand so the spec needs no image library. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const toast = (page: Page, text: string) => expect(page.getByText(text).first()).toBeVisible();

test.describe.configure({ mode: "serial" });

test("Staff create a draft, add a Product and submit it for approval", async ({ browser, baseURL }) => {
  const { page, close } = await as(browser, baseURL, staffState);
  await page.goto("/admin/collections");
  await page.getByRole("button", { name: "Yeni koleksiyon" }).click();
  await page.getByLabel("Ad", { exact: true }).fill(n.name);
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect(page.getByRole("heading", { name: n.name })).toBeVisible();
  url = page.url();
  await expect(page.getByText("Taslak").first()).toBeVisible();

  await page.getByLabel("Ürün ekle").fill(n.product);
  await page.getByRole("button", { name: `${n.product} ekle` }).click();
  await expect(page.getByRole("button", { name: `${n.product} kaldır` })).toBeVisible();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await toast(page, "Koleksiyon kaydedildi.");

  await page.getByRole("button", { name: "Onaya gönder" }).click();
  await toast(page, "Koleksiyon onaya gönderildi.");
  await expect(page.getByText("Onay bekliyor").first()).toBeVisible();
  // Pending approval: the fields are locked until the submitter withdraws it.
  await expect(page.getByText(/önce geri çekin/)).toBeVisible();
  await expect(page.getByLabel("Ad", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Geri çek" })).toBeVisible();
  await close();
});

test("the Owner approves it, and it is on the Storefront", async ({ browser, baseURL }) => {
  const { page, close } = await as(browser, baseURL, ownerState);
  await page.goto("/admin/collections?status=pending_approval");
  await page.getByRole("link", { name: n.name }).first().click();
  await expect(page.getByRole("button", { name: "Reddet" })).toBeVisible();
  await page.getByRole("button", { name: "Onayla" }).click();
  await toast(page, "Onaylandı.");
  await expect(page.getByText("Yayında").first()).toBeVisible();

  const slug = (await page.getByLabel("Adres").inputValue()).trim();
  await page.goto(`/collections/${slug}`);
  await expect(page.getByRole("heading", { name: n.name, level: 1 })).toBeVisible();
  await close();
});

test("a Staff edit of the published Collection waits for the Owner, who approves it", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  await staff.page.goto(url);
  await expect(staff.page.getByText(/onayına gider/)).toBeVisible();
  await staff.page.getByLabel("Açıklama").fill(n.description);
  await staff.page.getByRole("button", { name: "Onaya gönder" }).click();
  await toast(staff.page, "Değişiklik onaya gönderildi.");
  await expect(staff.page.getByText("Bekleyen değişiklik").first()).toBeVisible();
  await staff.close();

  const owner = await as(browser, baseURL, ownerState);
  await owner.page.goto(url);
  const pending = owner.page.getByRole("region", { name: "Bekleyen değişiklik" });
  await expect(pending).toContainText(n.description);
  // The live version is untouched until the Owner decides.
  const slug = await owner.page.getByLabel("Adres").inputValue();
  await owner.page.goto(`/collections/${slug}`);
  await expect(owner.page.getByText(n.description)).toHaveCount(0);

  await owner.page.goto(url);
  await owner.page.getByRole("button", { name: "Değişikliği onayla" }).click();
  await toast(owner.page, "Onaylandı.");
  await owner.page.goto(`/collections/${slug}`);
  await expect(owner.page.getByText(n.description)).toBeVisible();
  await owner.close();
});

test("the cover image is the Owner's on a published Collection", async ({ browser, baseURL }) => {
  const staff = await as(browser, baseURL, staffState);
  await staff.page.goto(url);
  await expect(staff.page.getByText(/kapak görselini yalnızca sahip/i)).toBeVisible();
  await expect(staff.page.getByLabel("Görsel yükle")).toBeDisabled();
  await staff.close();

  const owner = await as(browser, baseURL, ownerState);
  await owner.page.goto(url);
  await owner.page.getByLabel("Alternatif metin").fill("Kapak");
  await owner.page.getByLabel("Görsel yükle").setInputFiles({
    name: "kapak.png",
    mimeType: "image/png",
    buffer: png(900, 600),
  });
  await toast(owner.page, "Görsel yüklendi.");
  await expect(owner.page.getByRole("button", { name: "Görseli kaldır" })).toBeVisible();
  await owner.page.getByRole("button", { name: "Görseli kaldır" }).click();
  await toast(owner.page, "Görsel kaldırıldı.");
  await expect(owner.page.getByRole("button", { name: "Görseli kaldır" })).toHaveCount(0);
  await owner.close();
});

test("the Owner deletes it and it leaves the list", async ({ browser, baseURL }) => {
  const { page, close } = await as(browser, baseURL, ownerState);
  await page.goto(url);
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/collections\/?$/);
  await expect(page.getByRole("link", { name: n.name })).toHaveCount(0);
  await close();
});
