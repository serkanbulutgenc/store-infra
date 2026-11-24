import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginState } from "../support/auth";
import { seedOwner, seedStaff } from "../support/seed";
import { runDjangoScript } from "../support/stack";

// Store-infra #142: the configurable Ana sayfa (#136). The Owner and Staff get different default
// Widgets; a person's own layout (off, order, reset) survives a reload; the Owner approves a Staff
// submission straight from the Approvals Widget and the count drops; Staff never see the
// Owner-only Widgets (Onay bekleyenler, Onay bekleyen yanıtlar, Satış özeti), not even in the
// editor's list. Cards (#144) fold to their header, can be dismissed (with an undo), are dragged
// into a new order, carry an icon, and all of it is remembered across a reload.
const run = Date.now().toString(36);
const banner = { message: `E2E ana sayfa duyurusu ${run}` };

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
from store_backend.catalog.models import Banner

Banner.objects.filter(message__contains=${JSON.stringify(run)}).delete()
print("CLEANED")
`);
});

async function as(browser: Browser, baseURL: string | undefined, state: State) {
  const context = await browser.newContext({ baseURL, storageState: state, locale: "tr-TR" });
  return { context, page: await context.newPage() };
}

/** A Widget is a labelled section; its title carries the count, e.g. "Yeni siparişler (0)". */
const widget = (page: Page, title: string) =>
  page.getByRole("region", { name: new RegExp(`^${title} \\(\\d+\\)$`) });

/** The Widgets on the page, top to bottom, by the id their heading carries. */
const order = (page: Page) =>
  page
    .locator('section[aria-labelledby^="widget-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-labelledby")));

/** The Banner's own state. The Storefront's announcement bar shows one message at a time, so
 * another live announcement on the stack would hide this one; the state does not depend on it. */
const statusOf = (message: string) =>
  /STATUS=(\w+)/.exec(
    runDjangoScript(`
from store_backend.catalog.models import Banner

print("STATUS=" + Banner.objects.get(message=${JSON.stringify(message)}).status)
`),
  )?.[1];

const count = async (page: Page, title: string) => {
  const text = (await page.getByRole("heading", { name: new RegExp(`^${title} \\(`) }).textContent()) ?? "";
  return Number(/\((\d+)\)/.exec(text)?.[1]);
};

const OWNER_ONLY = ["Onay bekleyenler", "Onay bekleyen yanıtlar"];
const EVERYONE = [
  "Yeni siparişler",
  "Süresi dolmak üzere olan havaleler",
  "Bekleyen iade talepleri",
  "Azalan stok",
];

test("the Owner and Staff start with different Widgets", async ({ browser, baseURL }) => {
  const owner = await as(browser, baseURL, ownerState);
  await owner.page.goto("/admin");
  for (const title of [...OWNER_ONLY, ...EVERYONE]) {
    await expect(widget(owner.page, title), title).toBeVisible();
  }
  await expect(owner.page.getByRole("region", { name: "Satış özeti" })).toBeVisible();
  await owner.context.close();

  const staff = await as(browser, baseURL, staffState);
  await staff.page.goto("/admin");
  for (const title of EVERYONE) await expect(widget(staff.page, title), title).toBeVisible();
  for (const title of OWNER_ONLY) await expect(widget(staff.page, title), title).toHaveCount(0);
  await expect(staff.page.getByRole("region", { name: "Satış özeti" })).toHaveCount(0);

  // The editor does not offer them either.
  await staff.page.getByRole("button", { name: "Düzenle" }).click();
  const editor = staff.page.getByRole("region", { name: "Ana sayfayı düzenle" });
  await expect(editor.getByLabel("Yeni siparişler", { exact: true })).toBeChecked();
  for (const title of [...OWNER_ONLY, "Satış özeti"]) {
    await expect(editor.getByText(title, { exact: true })).toHaveCount(0);
  }
  await staff.context.close();
});

test("a person's own layout survives a reload and can be reset", async ({ browser, baseURL }) => {
  const staff = await as(browser, baseURL, staffState);
  const p = staff.page;
  await p.goto("/admin");
  await expect.poll(() => order(p)).toEqual([
    "widget-new-orders",
    "widget-unpaid-transfers",
    "widget-open-returns",
    "widget-low-stock",
  ]);

  await p.getByRole("button", { name: "Düzenle" }).click();
  const editor = p.getByRole("region", { name: "Ana sayfayı düzenle" });
  // The checkbox follows the server's answer, so click it and wait for the result rather than
  // `uncheck()`, which expects the state to flip at once.
  await editor.getByLabel("Azalan stok", { exact: true }).click();
  await expect(widget(p, "Azalan stok")).toHaveCount(0);
  await expect(editor.getByLabel("Azalan stok", { exact: true })).not.toBeChecked();
  await editor.getByRole("button", { name: "Yeni siparişler: aşağı taşı" }).click();
  await expect.poll(() => order(p)).toEqual([
    "widget-unpaid-transfers",
    "widget-new-orders",
    "widget-open-returns",
  ]);

  // Another tab of the same person reads it from the server, not from this page.
  await p.reload();
  await expect.poll(() => order(p)).toEqual([
    "widget-unpaid-transfers",
    "widget-new-orders",
    "widget-open-returns",
  ]);

  await p.getByRole("button", { name: "Düzenle" }).click();
  await p.getByRole("button", { name: "Varsayılana dön" }).click();
  await expect.poll(() => order(p)).toEqual([
    "widget-new-orders",
    "widget-unpaid-transfers",
    "widget-open-returns",
    "widget-low-stock",
  ]);
  await p.reload();
  await expect(widget(p, "Azalan stok")).toBeVisible();
  await staff.context.close();
});

test("the Owner approves a Staff submission from the Approvals Widget", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const sp = staff.page;
  await sp.goto("/admin/banners");
  await sp.getByRole("button", { name: "Yeni banner" }).click();
  await sp.getByLabel("Alan", { exact: true }).selectOption({ label: "Duyuru çubuğu" });
  await sp.getByRole("textbox", { name: "Mesaj", exact: true }).fill(banner.message);
  await sp.getByRole("button", { name: "Oluştur" }).click();
  await expect(sp.getByRole("heading", { name: banner.message })).toBeVisible();
  await sp.getByRole("button", { name: "Onaya gönder" }).first().click();
  await expect(sp.getByText("Banner onaya gönderildi.").first()).toBeVisible();
  await staff.context.close();

  expect(statusOf(banner.message)).toBe("pending_approval");

  const owner = await as(browser, baseURL, ownerState);
  const op = owner.page;
  await op.goto("/admin");
  const before = await count(op, "Onay bekleyenler");
  expect(before).toBeGreaterThanOrEqual(1);

  // Approve opens a confirmation that says what will happen; nothing is published yet.
  await op.getByRole("button", { name: `${banner.message} onayla` }).click();
  const dialog = op.getByRole("dialog");
  await expect(dialog).toContainText("Duyuru çubuğu");
  await expect(dialog).toContainText("mağazada yayınlanır");
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  expect(statusOf(banner.message)).toBe("pending_approval");

  await op.getByRole("button", { name: `${banner.message} onayla` }).click();
  await op.getByRole("dialog").getByRole("button", { name: "Onayla" }).click();
  await expect(op.getByText("Onaylandı.").first()).toBeVisible();
  await expect(op.getByRole("button", { name: `${banner.message} onayla` })).toHaveCount(0);
  await expect.poll(() => count(op, "Onay bekleyenler")).toBe(before - 1);

  expect(statusOf(banner.message)).toBe("published");
  await owner.context.close();
});

/** Back to the role's default, through the API, so a test starts from a known page. */
async function resetLayout(page: Page) {
  const res = await page.request.delete("/api/admin/home/layout");
  expect(res.ok(), await res.text()).toBe(true);
  await page.goto("/admin");
}

const DEFAULT_ORDER = [
  "widget-new-orders",
  "widget-unpaid-transfers",
  "widget-open-returns",
  "widget-low-stock",
];

test("every card has an icon in its header", async ({ browser, baseURL }) => {
  const staff = await as(browser, baseURL, staffState);
  await resetLayout(staff.page);
  for (const title of EVERYONE) {
    await expect(widget(staff.page, title).locator("header svg").first(), title).toBeVisible();
  }
  await staff.context.close();
});

test("a card folds to its header and stays folded after a reload", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const p = staff.page;
  await resetLayout(p);
  const card = widget(p, "Yeni siparişler");
  const body = card.getByText("Bekleyen yeni sipariş yok.");
  await expect(body).toBeVisible();

  await p.getByRole("button", { name: "Yeni siparişler: daralt" }).click();
  await expect(body).toBeHidden();
  await expect(card.getByRole("heading")).toBeVisible(); // the header stays
  await expect(p.getByRole("button", { name: "Yeni siparişler: aç" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // Only that card folded.
  await expect(widget(p, "Azalan stok").getByRole("button", { name: /daralt/ })).toBeVisible();

  await p.reload();
  await expect(widget(p, "Yeni siparişler").getByText("Bekleyen yeni sipariş yok.")).toBeHidden();

  await p.getByRole("button", { name: "Yeni siparişler: aç" }).click();
  await expect(widget(p, "Yeni siparişler").getByText("Bekleyen yeni sipariş yok.")).toBeVisible();
  await p.reload();
  await expect(widget(p, "Yeni siparişler").getByText("Bekleyen yeni sipariş yok.")).toBeVisible();
  await staff.context.close();
});

test("a card can be dismissed, undone, and brought back from the editor", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const p = staff.page;
  await resetLayout(p);

  await p.getByRole("button", { name: "Bekleyen iade talepleri: kaldır" }).click();
  await expect(widget(p, "Bekleyen iade talepleri")).toHaveCount(0);
  await p.getByRole("button", { name: "Geri al" }).click();
  await expect.poll(() => order(p)).toEqual(DEFAULT_ORDER); // back where it was

  await p.getByRole("button", { name: "Bekleyen iade talepleri: kaldır" }).click();
  await expect(widget(p, "Bekleyen iade talepleri")).toHaveCount(0);
  await p.reload();
  await expect(widget(p, "Bekleyen iade talepleri")).toHaveCount(0); // it stays dismissed

  await p.getByRole("button", { name: "Düzenle" }).click();
  await p
    .getByRole("region", { name: "Ana sayfayı düzenle" })
    .getByLabel("Bekleyen iade talepleri", { exact: true })
    .click();
  await expect(widget(p, "Bekleyen iade talepleri")).toBeVisible();
  await expect.poll(() => order(p)).toEqual([
    "widget-new-orders",
    "widget-unpaid-transfers",
    "widget-low-stock",
    "widget-open-returns",
  ]);
  await staff.context.close();
});

test("cards are reordered by dragging and the order is remembered", async ({
  browser,
  baseURL,
}) => {
  const staff = await as(browser, baseURL, staffState);
  const p = staff.page;
  await resetLayout(p);

  // dnd-kit drops on the card whose centre is nearest the dragged card's centre, so move the
  // handle by the distance between the two cards' centres.
  const handle = p.getByRole("button", { name: "Azalan stok: sürükle" });
  const source = (await widget(p, "Azalan stok").boundingBox())!;
  const target = (await widget(p, "Yeni siparişler").boundingBox())!;
  const grip = (await handle.boundingBox())!;
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  await p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await p.mouse.down();
  await p.mouse.move(grip.x + grip.width / 2 + dx / 4, grip.y + grip.height / 2 + dy / 4, { steps: 5 });
  await p.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, { steps: 15 });
  await p.mouse.up();

  await expect.poll(() => order(p)).toEqual([
    "widget-low-stock",
    "widget-new-orders",
    "widget-unpaid-transfers",
    "widget-open-returns",
  ]);
  await p.reload();
  await expect.poll(() => order(p)).toEqual([
    "widget-low-stock",
    "widget-new-orders",
    "widget-unpaid-transfers",
    "widget-open-returns",
  ]);
  await resetLayout(p);
  await staff.context.close();
});

test("a card can be moved from the keyboard too", async ({ browser, baseURL }) => {
  const staff = await as(browser, baseURL, staffState);
  const p = staff.page;
  await resetLayout(p);
  await p.getByRole("button", { name: "Süresi dolmak üzere olan havaleler: sürükle" }).focus();
  // Each key waits for the drag's own announcement: a key sent before the drag has started or
  // moved is lost.
  const status = p.getByRole("status").filter({ hasText: "Süresi dolmak üzere olan havaleler" });
  await p.keyboard.press("Space");
  await expect(status).toContainText("2. sıraya taşınacak");
  await p.keyboard.press("ArrowLeft");
  await expect(status).toContainText("1. sıraya taşınacak");
  await p.keyboard.press("Space");
  await expect(status).toContainText("1. sıraya bırakıldı");
  await expect.poll(() => order(p)).toEqual([
    "widget-unpaid-transfers",
    "widget-new-orders",
    "widget-open-returns",
    "widget-low-stock",
  ]);
  await resetLayout(p);
  await staff.context.close();
});
