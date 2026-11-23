import { expect, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { mailTo } from "../support/mail";
import { seedOwner, seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #122: Legal page URLs and the Contact service, from the Dashboard to the Storefront
// and the mailbox. The Owner is a real Owner (the dev stack skips TOTP); Staff are the Staff group.
const run = Date.now().toString(36);
const PAGE = "privacy_notice";
const newSlug = `e2e-gizlilik-${run}`;
const n = {
  category: `E2E Konu ${run}`,
  name: `E2E Müşteri ${run}`,
  email: `e2e-contact-${run}@example.com`,
  message: `Kargom gecikti, e2eaxolotl${run} numaralı paket nerede?`,
  draft: `Merhaba, paketiniz yarın dağıtımda ${run}.`,
  edited: `Merhaba, paketiniz yarın sabah dağıtımda ${run}.`,
};

type State = Awaited<ReturnType<typeof loginState>>;
let owner: { email: string; password: string };
let ownerState: State;
let staffState: State;
let legal: { slug: string; title: string };

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  const out = runDjangoScript(`
import json
from store_backend.services import legal_pages
from store_backend.shop.models import ContactCategory
from django.core.cache import cache

ContactCategory.objects.get_or_create(name=${JSON.stringify(n.category)})
cache.delete_pattern("ratelimit:contact:*")
print("LEGAL " + json.dumps({"slug": legal_pages.slug_of("${PAGE}"), "title": legal_pages.current("${PAGE}").title}))
`);
  const match = out.match(/LEGAL (\{.*\})/);
  if (!match?.[1]) throw new Error(out);
  legal = JSON.parse(match[1]);
  owner = seedOwner();
  ownerState = await loginState(browser, baseURL, owner);
  staffState = await loginState(browser, baseURL, seedStaff());
});

// Put the Legal page back on its own address (an earlier address just becomes current again),
// so later specs and the footer find it where they expect it.
test.afterAll(() => {
  runDjangoScript(`
from store_backend.services import legal_pages
from store_backend.users.models import User

actor = User.objects.get(email=${JSON.stringify(owner.email)})
if legal_pages.slug_of("${PAGE}") != ${JSON.stringify(legal.slug)}:
    legal_pages.change_slug(actor, "${PAGE}", ${JSON.stringify(legal.slug)})
print("RESTORED")
`);
});

test("changing a Legal page's address redirects the old URL and the footer follows", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const op = await context.newPage();
  await op.goto(`/admin/legal-pages/${PAGE}`);
  await op.getByRole("textbox", { name: "Adres", exact: true }).fill(newSlug);
  op.once("dialog", (d) => void d.accept());
  await op.getByRole("button", { name: "Adresi değiştir" }).click();
  await expect(op.getByText("Adres değiştirildi.").first()).toBeVisible();
  await context.close();

  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();

  // The old address answers with a permanent redirect to the new one, not a copy of the page.
  const old = await vp.request.get(`/yasal/${legal.slug}`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers().location).toContain(`/yasal/${newSlug}`);
  await vp.goto(`/yasal/${legal.slug}`);
  await expect(vp).toHaveURL(new RegExp(`/yasal/${newSlug}$`));
  await expect(vp.getByRole("heading", { name: legal.title })).toBeVisible();

  // The Footer menu points at the page, not at an address, so its link now has the new one.
  await vp.goto("/");
  const link = vp
    .getByRole("navigation", { name: "Yasal bilgiler" })
    .getByRole("link", { name: legal.title });
  await expect(link).toHaveAttribute("href", `/yasal/${newSlug}`);
  await visitor.close();
});

test("a Shopper's message is answered by Staff, approved by the Owner and arrives by email", async ({
  browser,
  baseURL,
}) => {
  // The Shopper sends it from the Storefront and gets the acknowledgement by email.
  const visitor = await browser.newContext({ baseURL, locale: "tr-TR" });
  const vp = await visitor.newPage();
  await vp.goto("/iletisim");
  await vp.waitForLoadState("networkidle"); // the form is server-rendered; wait for it to hydrate
  await expect(vp.getByRole("option", { name: n.category })).toBeAttached();
  await vp.getByLabel("Konu").selectOption({ label: n.category });
  await expect(vp.getByLabel("Konu")).not.toHaveValue("");
  await vp.getByLabel("Adınız").fill(n.name);
  await vp.getByLabel("E-posta", { exact: true }).fill(n.email);
  await vp.getByLabel("Mesajınız").fill(n.message);
  await vp.getByRole("button", { name: "Gönder" }).click();
  await expect(vp.getByRole("heading", { name: "Mesajınız bize ulaştı" })).toBeVisible();
  await visitor.close();
  await expect
    .poll(async () => (await mailTo(n.email)).map((m) => m.subject), { timeout: 30_000 })
    .toContain("Mesajınız bize ulaştı");

  // Staff find it by a word of the message, read it and save a draft, then send it for approval.
  const staff = await browser.newContext({ baseURL, storageState: staffState, locale: "tr-TR" });
  const sp = await staff.newPage();
  await sp.goto("/admin/contact");
  await sp.getByRole("searchbox", { name: "Ara" }).fill(`e2eaxolotl${run}`);
  const row = sp.getByRole("row", { name: new RegExp(n.name) });
  await expect(row).toHaveCount(1);
  await row.getByRole("link").click();
  await expect(sp.getByRole("heading", { name: n.name })).toBeVisible();
  await expect(sp.getByText(n.message)).toBeVisible();
  await sp.getByLabel("Taslak yaz").fill(n.draft);
  await sp.getByRole("button", { name: "Taslağı kaydet" }).click();
  await expect(sp.getByText("Taslak kaydedildi.").first()).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(sp.getByText("Onaya gönderildi.").first()).toBeVisible();
  // Staff cannot send it themselves, and nothing has reached the Shopper yet.
  await expect(sp.getByRole("button", { name: "Onayla ve gönder" })).toHaveCount(0);
  expect((await mailTo(n.email)).map((m) => m.subject)).not.toContain("Mesajınıza yanıt");
  await staff.close();

  // The Owner sees it waiting, edits the text and sends it.
  const own = await browser.newContext({ baseURL, storageState: ownerState, locale: "tr-TR" });
  const op = await own.newPage();
  await op.goto("/admin/contact");
  await op.waitForLoadState("networkidle");
  // The filter lives in the URL, so the box changes a moment after the click.
  await op.getByLabel("Onay bekleyen yanıt").click();
  await expect(op.getByLabel("Onay bekleyen yanıt")).toBeChecked();
  await op.getByRole("searchbox", { name: "Ara" }).fill(`e2eaxolotl${run}`);
  const waiting = op.getByRole("row", { name: new RegExp(n.name) });
  await expect(waiting).toContainText("1 yanıt onay bekliyor");
  await waiting.getByRole("link").click();
  await op.getByRole("button", { name: "Düzenleyip gönder" }).click();
  await op.getByRole("textbox", { name: "Yanıt", exact: true }).fill(n.edited);
  await op.getByRole("article", { name: "Yanıt" }).getByRole("button", { name: "Gönder", exact: true }).click();
  await expect(op.getByText("Yanıt gönderildi.").first()).toBeVisible();
  await expect(op.getByText("Yanıtlandı").first()).toBeVisible();
  await own.close();

  // The email carries the Owner's text, not the Staff draft.
  await expect
    .poll(async () => (await mailTo(n.email)).find((m) => m.subject === "Mesajınıza yanıt")?.text, {
      timeout: 30_000,
    })
    .toContain(n.edited);
  const reply = (await mailTo(n.email)).find((m) => m.subject === "Mesajınıza yanıt");
  expect(reply?.text).not.toContain(n.draft);
});
