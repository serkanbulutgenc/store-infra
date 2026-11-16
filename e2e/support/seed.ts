import { runDjangoScript } from "./stack";

export interface Seed {
  title: string;
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
category = catalog.create_category("E2E ${run}")
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
