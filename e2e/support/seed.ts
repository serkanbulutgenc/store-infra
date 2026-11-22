import { randomBytes } from "node:crypto";
import { runDjangoScript } from "./stack";

export interface Seed {
  title: string;
  /** The Category the product sits in (one per run, so a Campaign on it touches only this product). */
  category: string;
  size: string;
  staffEmail: string;
  staffPassword: string;
}

/**
 * Create what a fresh stack lacks: one published product with stock, and a Staff user
 * (Staff, not Owner, so the Dashboard login needs no TOTP). Uses the catalog service
 * functions the Dashboard uses; the fees are set on the Store settings row directly.
 * It changes the shop-wide COD and shipping fees, so run it on a throwaway stack only. Names are unique per run.
 * A colour's 3-letter code is taken from the first letters of its name, with a number added when
 * taken, so the colour name starts with letters of its own (not a shared "E2E"): with a shared
 * prefix only about 90 codes exist and a local stack ran out of them after about 90 runs.
 * The variant has plenty of stock (50): the voucher specs place about ten orders for it, and a
 * sold-out product drops off the listing the specs start from.
 */
export function seedShop(): Seed {
  const run = Date.now().toString(36);
  const seed: Seed = {
    title: `E2E Elbise ${run}`,
    category: `E2E ${run}`,
    size: "M",
    staffEmail: `e2e-staff-${run}@example.com`,
    staffPassword: `E2e-${run}-Pass!9x`,
  };
  const script = `
import json
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Group
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog, shop_settings
from store_backend.users.models import User

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Siyah ${run}`)}, "#000000")
category = catalog.create_category(${JSON.stringify(seed.category)})
product = catalog.create_product(
    title=${JSON.stringify(seed.title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size=${JSON.stringify(seed.size)}, stock=50)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)

settings = shop_settings.get()
settings.cod_fee = "15.00"
settings.shipping_fee = "30.00"
settings.save()

user = User(email=${JSON.stringify(seed.staffEmail)}, is_staff=True)
user.set_password(${JSON.stringify(seed.staffPassword)})
user.save()
user.groups.add(Group.objects.get(name="Staff"))
EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
print("SEEDED " + json.dumps({"slug": product.slug}))
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  return seed;
}

/**
 * Only a verified Staff user, for specs that need a Dashboard login and nothing else.
 * `extraPermissions` are granted directly (an Owner needs TOTP, so a Staff user stands in).
 * Unlike `seedShop` it leaves the shop settings and catalogue alone.
 */
export function seedStaff(extraPermissions: string[] = []): { email: string; password: string } {
  const run = Date.now().toString(36);
  const email = `e2e-nav-${run}@example.com`;
  const password = `E2e-${run}-Pass!9x`;
  const script = `
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Group, Permission
from store_backend.users.models import User

user = User(email=${JSON.stringify(email)}, is_staff=True)
user.set_password(${JSON.stringify(password)})
user.save()
user.groups.add(Group.objects.get(name="Staff"))
for codename in ${JSON.stringify(extraPermissions)}:
    user.user_permissions.add(Permission.objects.get(codename=codename))
EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs):\n${out}`);
  return { email, password };
}

/** One draft product with a variant, for specs that edit a product. Leaves shop settings alone. */
export function seedProduct(): { id: number; title: string } {
  const run = Date.now().toString(36);
  const title = `E2E Ürün ${run}`;
  const script = `
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Mavi ${run}`)}, "#0000ff")
category = catalog.create_category("E2E Kat ${run}")
product = catalog.create_product(
    title=${JSON.stringify(title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size="M", stock=3)
print("SEEDED " + json.dumps({"id": product.id}))
`;
  const out = runDjangoScript(script);
  const match = out.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs):\n${out}`);
  return { id: (JSON.parse(match[1]) as { id: number }).id, title };
}

export interface VoucherOptions {
  /** Appended to the run id to make the code unique; letters and digits. */
  suffix: string;
  kind?: "percentage" | "fixed";
  value?: string;
  minimum?: string;
  cap?: number;
  oncePerCustomer?: boolean;
  /** Days from now; negative is in the past. */
  startsInDays?: number;
  /** Days from now; `null` is no expiry. */
  endsInDays?: number | null;
}

/**
 * One Voucher through the Dashboard's own service (`voucher_admin.create`), for specs that
 * need a code with a given limit without clicking through the dialog. Returns its code.
 */
export function seedVoucher(options: VoucherOptions): string {
  const run = Date.now().toString(36).toUpperCase();
  const code = `E2E${run}${options.suffix.toUpperCase()}`;
  const data = {
    code,
    kind: options.kind ?? "percentage",
    value: options.value ?? "10",
    minimum: options.minimum ?? null,
    cap: options.cap ?? null,
    oncePerCustomer: options.oncePerCustomer ?? false,
    startsInDays: options.startsInDays ?? -1,
    endsInDays: options.endsInDays === undefined ? null : options.endsInDays,
  };
  const script = `
import json
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from store_backend.services import voucher_admin

o = json.loads(${JSON.stringify(JSON.stringify(data))})
now = timezone.now()
voucher_admin.create(
    None,
    code=o["code"],
    kind=o["kind"],
    value=Decimal(o["value"]),
    minimum=Decimal(o["minimum"]) if o["minimum"] else None,
    cap=o["cap"],
    once_per_customer=o["oncePerCustomer"],
    starts_at=now + timedelta(days=o["startsInDays"]),
    ends_at=None if o["endsInDays"] is None else now + timedelta(days=o["endsInDays"]),
)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`voucher seeding failed:\n${out}`);
  return code;
}

/** A verified Customer (not Staff), who can log in at `/hesap/giris` and shop with an account. */
export function seedCustomer(): { email: string; password: string } {
  const run = Date.now().toString(36);
  const email = `e2e-customer-${run}@example.com`;
  const password = `E2e-${run}-Pass!9x`;
  const script = `
from allauth.account.models import EmailAddress
from store_backend.users.models import User

user = User(email=${JSON.stringify(email)})
user.set_password(${JSON.stringify(password)})
user.save()
EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`customer seeding failed:\n${out}`);
  return { email, password };
}

/**
 * Clear the checkout rate-limit counter (10 placements per 10 minutes per address). One run of
 * the voucher specs places more orders than that from the one test address, so a spec that
 * places orders calls this first. It only touches the test stack's counter, not the limit.
 */
export function resetCheckoutRateLimit(): void {
  const out = runDjangoScript(`
from django.core.cache import cache
cache.delete_pattern("ratelimit:checkout:*")
print("RESET")
`);
  if (!out.includes("RESET")) throw new Error(`could not reset the checkout limit:\n${out}`);
}

export interface GallerySeed {
  title: string;
}

/**
 * A published product with two sizes (S, M) in one colour and three photos, for the product page:
 * the size picker, the thumbnail column and the tabs. The photos are generated and processed
 * in the script itself (no worker round trip). Leaves shop settings alone.
 */
export function seedGalleryProduct(): GallerySeed {
  const run = Date.now().toString(36);
  const title = `E2E Galeri ${run}`;
  const script = `
import io
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from oscar.apps.catalogue.models import ProductClass
from PIL import Image
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog, media
from store_backend.users.models import User

actor = User(email="e2e-gallery-${run}@example.com", is_staff=True)
actor.set_password("E2e-${run}-Pass!9x")
actor.save()
actor.groups.add(Group.objects.get(name="Staff"))

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Lacivert ${run}`)}, "#001f3f")
category = catalog.create_category("E2E Galeri ${run}")
product = catalog.create_product(
    title=${JSON.stringify(title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size="S", stock=10)
catalog.create_variant(product, colour=colour, size="M", stock=10)
for shade in ((200, 30, 30), (30, 200, 30), (30, 30, 200)):
    buf = io.BytesIO()
    Image.new("RGB", (900, 1200), shade).save(buf, "PNG")
    photo = media.upload(actor, product, SimpleUploadedFile("p.png", buf.getvalue(), "image/png"))
    media.process(photo.pk)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  return { title };
}

export interface ColourSeed {
  title: string;
  /** Colour names: `first` is the default pick (S, M in stock); `second` has M (sold out) and L. */
  first: string;
  second: string;
}

/**
 * A published product with two colours for the colour switch: the first has sizes S and M in
 * stock and one photo; the second has M (sold out) and L and two photos, so only it shows
 * thumbnails. Leaves shop settings alone.
 */
export function seedColourProduct(): ColourSeed {
  const run = Date.now().toString(36);
  const title = `E2E Renkli ${run}`;
  const first = `${run.slice(-3).toUpperCase()} Kırmızı ${run}`;
  const second = `${run.slice(-3).toUpperCase()} Turuncu ${run}`;
  const script = `
import io
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from oscar.apps.catalogue.models import ProductClass
from PIL import Image
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog, media
from store_backend.users.models import User

actor = User(email="e2e-colour-${run}@example.com", is_staff=True)
actor.set_unusable_password()
actor.save()
actor.groups.add(Group.objects.get(name="Staff"))

red = catalog.create_colour(${JSON.stringify(first)}, "#cc0000")
orange = catalog.create_colour(${JSON.stringify(second)}, "#ff8800")
category = catalog.create_category("E2E Renkli ${run}")
product = catalog.create_product(
    title=${JSON.stringify(title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=red, size="S", stock=10)
catalog.create_variant(product, colour=red, size="M", stock=10)
catalog.create_variant(product, colour=orange, size="M", stock=0)
catalog.create_variant(product, colour=orange, size="L", stock=10)
for colour, shade in ((red, (200, 30, 30)), (orange, (255, 136, 0)), (orange, (255, 200, 0))):
    buf = io.BytesIO()
    Image.new("RGB", (900, 1200), shade).save(buf, "PNG")
    photo = media.upload(actor, product, SimpleUploadedFile("p.png", buf.getvalue(), "image/png"), colour=colour)
    media.process(photo.pk)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  return { title, first, second };
}

export interface DescriptionSeed {
  id: number;
  title: string;
  slug: string;
}

/**
 * One published product with stock and no description, for the Description editor specs: they
 * write it in the Dashboard and read it on the Storefront. Leaves shop settings alone.
 */
export function seedDescriptionProduct(): DescriptionSeed {
  const run = Date.now().toString(36);
  const title = `E2E Açıklama ${run}`;
  const script = `
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Yeşil ${run}`)}, "#00aa00")
category = catalog.create_category("E2E Açıklama ${run}")
product = catalog.create_product(
    title=${JSON.stringify(title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size="M", stock=10)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED " + json.dumps({"id": product.id, "slug": product.slug}))
`;
  const out = runDjangoScript(script);
  const match = out.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  const { id, slug } = JSON.parse(match[1]) as { id: number; slug: string };
  return { id, title, slug };
}

export interface SizeGuideSeed {
  /** Class guide is written in the test; this product has no override. */
  plain: { id: number; slug: string; title: string };
  /** The same class, for a Product override. */
  overridden: { id: number; slug: string; title: string };
  /** Sits in a One-size class. */
  oneSize: { id: number; slug: string; title: string };
  /** Id of the letters class the first two Products belong to. */
  classId: number;
  className: string;
}

/**
 * Three published Products for the Size guide specs, in Product classes of their own: editing the
 * shared "Giyim" class guide would put a "Beden tablosu" link on every other spec's product.
 * Two Products share a letters class (so a class guide reaches both and one can override it); the
 * third is in a One-size class. Leaves shop settings alone.
 */
export function seedSizeGuideShop(): SizeGuideSeed {
  const run = Date.now().toString(36);
  const className = `E2E Bedenli ${run}`;
  const titles = {
    plain: `E2E Tablolu ${run}`,
    overridden: `E2E Özel Tablolu ${run}`,
    oneSize: `E2E Tek Ebatlı ${run}`,
  };
  const script = `
import json
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog, product_classes
from store_backend.users.models import User

actor = User(email="e2e-guide-${run}@example.com", is_staff=True)
actor.set_unusable_password()  # only the audit actor for creating the classes; never logs in
actor.save()

lettered = product_classes.create(actor, name=${JSON.stringify(className)}, size_scheme="letters", default_kdv_rate="20")
single = product_classes.create(actor, name=${JSON.stringify(`E2E Tek Ebat ${run}`)}, size_scheme="one_size", default_kdv_rate="20")
colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Bordo ${run}`)}, "#800020")
category = catalog.create_category("E2E Tablo ${run}")

def publish(title, product_class, size):
    product = catalog.create_product(title=title, product_class=product_class, category=category, shelf_price="100.00")
    catalog.create_variant(product, colour=colour, size=size, stock=10)
    ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
    return {"id": product.id, "slug": product.slug, "title": title}

out = {
    "plain": publish(${JSON.stringify(titles.plain)}, lettered, "M"),
    "overridden": publish(${JSON.stringify(titles.overridden)}, lettered, "M"),
    "oneSize": publish(${JSON.stringify(titles.oneSize)}, single, "Tek Ebat"),
    "classId": lettered.id,
}
print("SEEDED " + json.dumps(out))
`;
  const result = runDjangoScript(script);
  const match = result.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs for the traceback):\n${result}`);
  return { ...(JSON.parse(match[1]) as Omit<SizeGuideSeed, "className">), className };
}

export interface SimilarSeed {
  /** The Product whose page is opened. */
  current: { slug: string; title: string };
  /** Same Category and same Brand as `current`: it must rank first. */
  sameBrand: { slug: string; title: string };
  /** Two more published, in-stock Products of the Category, of other or no Brand. */
  others: { slug: string; title: string }[];
  soldOut: { slug: string; title: string };
  draft: { slug: string; title: string };
  /** Alone in a Category of its own: nothing is similar to it. */
  lonely: { slug: string; title: string };
}

/**
 * One Category for the Similar products rail: the current Product, a Product of its Brand, two
 * others, a sold-out one and a draft one, plus a Product alone in another Category. Leaves shop
 * settings alone. The Category has no parent, so the rail never widens into other specs' Products.
 */
export function seedSimilarShop(): SimilarSeed {
  const run = Date.now().toString(36);
  const title = (name: string) => `E2E ${name} ${run}`;
  const script = `
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

ours = catalog.create_brand(${JSON.stringify(`E2E Marka ${run}`)})
theirs = catalog.create_brand(${JSON.stringify(`E2E Başka ${run}`)})
colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Gri ${run}`)}, "#808080")
category = catalog.create_category(${JSON.stringify(`E2E Benzer ${run}`)})
alone = catalog.create_category(${JSON.stringify(`E2E Yalnız ${run}`)})
giyim = ProductClass.objects.get(name="Giyim")

def make(title, *, brand=None, stock=10, status=ProductStatus.PUBLISHED, cat=category):
    product = catalog.create_product(title=title, product_class=giyim, category=cat, shelf_price="100.00", brand=brand)
    catalog.create_variant(product, colour=colour, size="M", stock=stock)
    ProductProfile.objects.filter(product=product).update(status=status)
    return {"slug": product.slug, "title": title}

out = {
    "current": make(${JSON.stringify(title("Mevcut"))}, brand=ours),
    "others": [
        make(${JSON.stringify(title("Başka marka"))}, brand=theirs),
        make(${JSON.stringify(title("Markasız"))}),
    ],
    "sameBrand": make(${JSON.stringify(title("Aynı marka"))}, brand=ours),
    "soldOut": make(${JSON.stringify(title("Tükenmiş"))}, brand=ours, stock=0),
    "draft": make(${JSON.stringify(title("Taslak"))}, brand=ours, status=ProductStatus.DRAFT),
    "lonely": make(${JSON.stringify(title("Yalnız"))}, cat=alone),
}
print("SEEDED " + json.dumps(out))
`;
  const result = runDjangoScript(script);
  const match = result.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs for the traceback):\n${result}`);
  return JSON.parse(match[1]) as SimilarSeed;
}

export interface ViewedSeed {
  /** Four published, in-stock Products, `a` to `d`. */
  products: { slug: string; title: string }[];
}

/** Four published Products for the Recently viewed rail. Leaves shop settings alone. */
export function seedViewedShop(): ViewedSeed {
  const run = Date.now().toString(36);
  const script = `
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Lacivert ${run}`)}, "#000080")
category = catalog.create_category(${JSON.stringify(`E2E Son baktı ${run}`)})
giyim = ProductClass.objects.get(name="Giyim")
out = []
for name in ["Alfa", "Beta", "Gama", "Delta"]:
    title = f"E2E {name} ${run}"
    product = catalog.create_product(title=title, product_class=giyim, category=category, shelf_price="100.00")
    catalog.create_variant(product, colour=colour, size="M", stock=10)
    ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
    out.append({"slug": product.slug, "title": title})
print("SEEDED " + json.dumps({"products": out}))
`;
  const result = runDjangoScript(script);
  const match = result.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs for the traceback):\n${result}`);
  return JSON.parse(match[1]) as ViewedSeed;
}

/** Sell out a Product: every Variant's stock goes to zero (a sold-out Product drops out of the rails). */
export function sellOut(slug: string): void {
  const out = runDjangoScript(`
from oscar.apps.partner.models import StockRecord
from store_backend.catalog.models import ProductProfile

profile = ProductProfile.objects.get(slug=${JSON.stringify(slug)})
StockRecord.objects.filter(product__parent_id=profile.product_id).update(num_in_stock=0)
print("SOLDOUT")
`);
  if (!out.includes("SOLDOUT")) throw new Error(`could not sell out ${slug}:\n${out}`);
}

export interface StockAlertSeed {
  id: number;
  slug: string;
  title: string;
  /** The sold-out Variant (size M); size L has stock, so the Product is still listed. */
  soldOutVariantId: number;
}

/** One published Product with a sold-out Size (M) and one in stock (L). Leaves shop settings alone. */
export function seedStockAlertShop(): StockAlertSeed {
  const run = Date.now().toString(36);
  const title = `E2E Bildirimli ${run}`;
  const script = `
import json
from oscar.apps.catalogue.models import ProductClass
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Haki ${run}`)}, "#8a7f4a")
category = catalog.create_category("E2E Bildirim ${run}")
product = catalog.create_product(
    title=${JSON.stringify(title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
sold_out = catalog.create_variant(product, colour=colour, size="M", stock=0)
catalog.create_variant(product, colour=colour, size="L", stock=5)
ProductProfile.objects.filter(product=product).update(status=ProductStatus.PUBLISHED)
print("SEEDED " + json.dumps({"id": product.id, "slug": product.slug, "variant": sold_out.id}))
`;
  const out = runDjangoScript(script);
  const match = out.match(/SEEDED (\{.*\})/);
  if (!match?.[1]) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  const data = JSON.parse(match[1]) as { id: number; slug: string; variant: number };
  return { id: data.id, slug: data.slug, title, soldOutVariantId: data.variant };
}

/** Switch the Store setting for Stock alerts on or off directly (the Dashboard switch is tested separately). */
export function setStockAlerts(enabled: boolean): void {
  const out = runDjangoScript(`
from store_backend.services import shop_settings

row = shop_settings.get()
row.stock_alerts_enabled = ${enabled ? "True" : "False"}
row.save()
print("SET")
`);
  if (!out.includes("SET")) throw new Error(`could not set stock_alerts_enabled:\n${out}`);
}

/**
 * The reject link an alert email carries, as a path. The link is a signed value that needs no
 * live row, so this stands in for the link in an earlier alert email.
 */
export function rejectPath(email: string, variantId: number): string {
  const out = runDjangoScript(`
from store_backend.services import stock_alerts

print("PATH /stok-bildirimi/vazgec?token=" + stock_alerts.reject_token(${JSON.stringify(email)}, ${variantId}))
`);
  const match = out.match(/PATH (\S+)/);
  if (!match?.[1]) throw new Error(`could not build a reject link:\n${out}`);
  return match[1];
}

export interface ReportsSeed {
  /** A 7-day window in the past, `YYYY-MM-DD`, that no other order falls in. */
  from: string;
  to: string;
  owner: { email: string; password: string };
  /** 100.00 shelf price, and 200.00. */
  cheap: string;
  dear: string;
  voucher: string;
  /**
   * The shipping and cash-on-delivery fees the four sold orders were charged, read from the fee rows saved with each
   * order at placement, not from the report. Shipping follows the shop's rate table (by quantity), not one flat fee.
   */
  fees: { shipping: string; cod: string };
}

/**
 * Reports (GLOSSARY: Owner). A known set of orders for an Owner to read figures from, backdated into a 7-day window of
 * its own in the past (2000 to 2019) so the other specs' orders, placed today, and earlier runs of this spec fall
 * outside it. The window is picked at random and the script refuses one that already holds an order; a few tries
 * find a free one.
 *
 * Two products, 100.00 and 200.00, with cash on delivery at 15.00 (shipping comes from the rate table). Window days:
 *   1  COD,      cheap x2                          200.00  a sale
 *   2  transfer, dear x1, paid                     200.00  a sale (the unpaid kind would be "pending")
 *   2  COD,      cheap x1, cancelled                       not a sale
 *   3  COD,      cheap x2, 10% Voucher             180.00  a sale, 20.00 off
 *   4  COD,      dear x5, delivered, 2 returned   1000.00 - 400.00 = 600.00, wrong size, received
 * The Owner is a real Owner (the dev stack has OWNER_MFA_REQUIRED=False, so no TOTP). Names and codes are unique per
 * run. It changes the shop-wide fees, so run it on a throwaway stack only.
 */
export function seedReportsShop(): ReportsSeed {
  const run = Date.now().toString(36);
  for (let attempt = 0; attempt < 5; attempt++) {
    const year = 2000 + Math.floor(Math.random() * 20);
    const month = 1 + Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * 20);
    const from = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const out = runDjangoScript(reportsScript(run, from));
    const match = out.match(/SEEDED (\{.*\})/);
    if (match?.[1]) return JSON.parse(match[1]) as ReportsSeed;
    if (!out.includes("WINDOW_TAKEN")) throw new Error(`seeding reports failed (see api container logs):\n${out}`);
  }
  throw new Error("no free report window after 5 tries");
}

function reportsScript(run: string, from: string): string {
  const owner = { email: `e2e-owner-${run}@example.com`, password: `E2e-${run}-Pass!9x` };
  const voucher = `E2E${run.toUpperCase()}RPT`;
  return `
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth.models import Group
from django.test import Client
from django.utils import timezone
from oscar.apps.catalogue.models import ProductClass
from oscar.apps.order.models import Order
from store_backend.catalog.models import ProductProfile, ProductStatus
from store_backend.services import catalog, order_ops, returns, shop_settings, voucher_admin
from store_backend.shop.models import OrderFeeSnapshot, ReturnRequest
from store_backend.users.models import User

ISTANBUL = ZoneInfo("Europe/Istanbul")
start = date.fromisoformat(${JSON.stringify(from)})
end = start + timedelta(days=6)
lo = datetime.combine(start, datetime.min.time(), ISTANBUL)
hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), ISTANBUL)
if Order.objects.filter(date_placed__gte=lo - timedelta(days=7), date_placed__lt=hi).exists():
    print("WINDOW_TAKEN")
    raise SystemExit

settings.ALLOWED_HOSTS = ["*"]
store = shop_settings.get()
store.cod_fee = "15.00"
store.save()

owner = User(email=${JSON.stringify(owner.email)}, is_staff=True)
owner.set_password(${JSON.stringify(owner.password)})
owner.save()
owner.groups.add(Group.objects.get(name="Owner"))
EmailAddress.objects.create(user=owner, email=owner.email, verified=True, primary=True)

colour = catalog.create_colour(${JSON.stringify(`${run.slice(-3).toUpperCase()} Mavi ${run}`)}, "#0000ff")
category = catalog.create_category(${JSON.stringify(`Rapor ${run}`)})
product_class = ProductClass.objects.get(name="Giyim")

def product(title, price):
    made = catalog.create_product(title=title, product_class=product_class, category=category, shelf_price=price)
    variant = catalog.create_variant(made, colour=colour, size="M", stock=50)
    ProductProfile.objects.filter(product=made).update(status=ProductStatus.PUBLISHED)
    return variant

cheap = product(${JSON.stringify(`Rapor Elbise ${run}`)}, "100.00")
dear = product(${JSON.stringify(`Rapor Gömlek ${run}`)}, "200.00")
now = timezone.now()
voucher_admin.create(
    None, code=${JSON.stringify(voucher)}, kind="percentage", value=Decimal("10"), minimum=None, cap=None,
    once_per_customer=False, starts_at=now - timedelta(days=1), ends_at=None,
)

counter = [0]

def place(variant, quantity, cod, code=None):
    counter[0] += 1
    client = Client(enforce_csrf_checks=False, REMOTE_ADDR=f"198.51.100.{counter[0]}", HTTP_HOST="localhost")
    csrf = client.get("/api/store/csrf").json()["csrf_token"]
    headers = {"X-CSRFToken": csrf}
    added = client.post("/api/store/basket/lines", {"variant_id": variant.pk, "quantity": quantity}, content_type="application/json", headers=headers)
    assert added.status_code == 200, added.content
    if code:
        applied = client.post("/api/store/basket/voucher", {"code": code}, content_type="application/json", headers=headers)
        assert applied.status_code == 200, applied.content
    body = {
        "full_name": "Ayşe Yılmaz", "email": f"rapor{counter[0]}-${run}@example.com", "phone": "0532 123 45 67",
        "shipping_address": {"il": "Mersin", "ilce": "Yenişehir", "mahalle": "Çiftlikköy Mah.", "street": "Gül Sok. No:5 D:3", "postal_code": "33110"},
        "payment_method": "cod" if cod else "bank_transfer", "contract_acknowledged": True,
    }
    if cod:
        body["cod_fee_consent"] = True
    placed = client.post("/api/store/checkout", body, content_type="application/json", headers=headers)
    assert placed.status_code == 201, placed.content
    return placed.json()

def on_day(number, day):
    at = datetime.combine(start + timedelta(days=day - 1), datetime.min.time(), ISTANBUL).replace(hour=12)
    Order.objects.filter(number=number).update(date_placed=at)

one = place(cheap, 2, cod=True)
two = place(dear, 1, cod=False)
order_ops.mark_paid(owner, two["number"], amount=Order.objects.get(number=two["number"]).total_incl_tax, paid_at=timezone.now())
cancelled = place(cheap, 1, cod=True)
order_ops.cancel(owner, cancelled["number"], reason="E2E: vazgeçti")
three = place(cheap, 2, cod=True, code=${JSON.stringify(voucher)})
four = place(dear, 5, cod=True)
order_ops.ship(owner, four["number"], carrier="Aras", tracking_number="1")
order_ops.deliver(owner, four["number"])
line = Order.objects.get(number=four["number"]).lines.get()
asked = Client(enforce_csrf_checks=False, REMOTE_ADDR="198.51.100.99", HTTP_HOST="localhost")
csrf = asked.get("/api/store/csrf").json()["csrf_token"]
filed = asked.post(
    "/api/store/tracking/link/" + four["tracking_token"] + "/returns",
    {"lines": [{"line_id": line.pk, "quantity": 2}], "reason": "wrong_size"},
    content_type="application/json", headers={"X-CSRFToken": csrf},
)
assert filed.status_code == 201, filed.content
request = ReturnRequest.objects.filter(order__number=four["number"]).latest("pk")
returns.approve(owner, four["number"], request.pk)
returns.mark_received(owner, four["number"], request.pk, restock={line.pk: True})

for number, day in ((one["number"], 1), (two["number"], 2), (cancelled["number"], 2), (three["number"], 3), (four["number"], 4)):
    on_day(number, day)

sold = [one, two, three, four]  # the cancelled order brings no fees
def fee_total(kind):
    rows = OrderFeeSnapshot.objects.filter(order__number__in=[o["number"] for o in sold], kind=kind)
    return str(sum((row.total_incl for row in rows), Decimal("0.00")))

print("SEEDED " + json.dumps({
    "from": start.isoformat(), "to": end.isoformat(),
    "fees": {"shipping": fee_total("shipping"), "cod": fee_total("cod")},
    "owner": {"email": owner.email, "password": ${JSON.stringify(owner.password)}},
    "cheap": ${JSON.stringify(`Rapor Elbise ${run}`)}, "dear": ${JSON.stringify(`Rapor Gömlek ${run}`)}, "voucher": ${JSON.stringify(voucher)},
}))
`;
}

export interface ImportSeed {
  owner: { email: string; password: string };
  /** A colour the CSV can name (the import does not create colours). */
  colour: string;
  /** Unique per run, so the imported Product and its Category are new each time. */
  run: string;
}

/** A real Owner (the dev stack has OWNER_MFA_REQUIRED=False) and one Colour, for the catalogue import. */
export function seedImportShop(): ImportSeed {
  const run = Date.now().toString(36);
  const owner = {
    email: `e2e-import-owner-${run}@example.com`,
    password: `${randomBytes(12).toString("hex")}-Aa1!`,
  };
  const colour = `${run.slice(-3).toUpperCase()} Ithal ${run}`;
  const script = `
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Group
from store_backend.services import catalog
from store_backend.users.models import User

owner = User(email=${JSON.stringify(owner.email)}, is_staff=True)
owner.set_password(${JSON.stringify(owner.password)})
owner.save()
owner.groups.add(Group.objects.get(name="Owner"))
EmailAddress.objects.create(user=owner, email=owner.email, verified=True, primary=True)
catalog.create_colour(${JSON.stringify(colour)}, "#336699")
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs for the traceback):\n${out}`);
  return { owner, colour, run };
}

/** The stored Description (Markdown) of the Product with this title, read from the database. */
export function descriptionOf(title: string): string {
  const out = runDjangoScript(`
import json
from oscar.apps.catalogue.models import Product
print("DESCRIPTION " + json.dumps(Product.objects.get(title=${JSON.stringify(title)}).description))
`);
  const match = out.match(/DESCRIPTION (".*")/);
  if (!match?.[1]) throw new Error(`could not read the description:\n${out}`);
  return JSON.parse(match[1]) as string;
}

/** A real Owner (the dev stack has OWNER_MFA_REQUIRED=False, so no TOTP step). Leaves the catalogue alone. */
export function seedOwner(): { email: string; password: string } {
  const run = Date.now().toString(36);
  const email = `e2e-owner-${run}@example.com`;
  const password = `${randomBytes(12).toString("hex")}-Aa1!`;
  const out = runDjangoScript(`
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Group
from store_backend.users.models import User

owner = User(email=${JSON.stringify(email)}, is_staff=True)
owner.set_password(${JSON.stringify(password)})
owner.save()
owner.groups.add(Group.objects.get(name="Owner"))
EmailAddress.objects.create(user=owner, email=owner.email, verified=True, primary=True)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs):\n${out}`);
  return { email, password };
}

/**
 * A Dashboard user in no group, holding only `permissions` (granted directly). The Staff group
 * includes `manage_product_photos`, so a user without it has to be built this way.
 */
export function seedUserWith(permissions: string[]): { email: string; password: string } {
  const run = Date.now().toString(36);
  const email = `e2e-limited-${run}@example.com`;
  const password = `${randomBytes(12).toString("hex")}-Aa1!`;
  const out = runDjangoScript(`
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Permission
from store_backend.users.models import User

user = User(email=${JSON.stringify(email)}, is_staff=True)
user.set_password(${JSON.stringify(password)})
user.save()
for codename in ${JSON.stringify(permissions)}:
    user.user_permissions.add(Permission.objects.get(codename=codename))
EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
print("SEEDED")
`);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs):\n${out}`);
  return { email, password };
}
