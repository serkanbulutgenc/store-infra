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

colour = catalog.create_colour("E2E Siyah ${run}", "#000000")
category = catalog.create_category("E2E ${run}")
product = catalog.create_product(
    title=${JSON.stringify(seed.title)},
    product_class=ProductClass.objects.get(name="Giyim"),
    category=category,
    shelf_price="100.00",
)
catalog.create_variant(product, colour=colour, size=${JSON.stringify(seed.size)}, stock=5)
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
 * Unlike `seedShop` it leaves the shop settings and catalogue alone.
 */
export function seedStaff(): { email: string; password: string } {
  const run = Date.now().toString(36);
  const email = `e2e-nav-${run}@example.com`;
  const password = `E2e-${run}-Pass!9x`;
  const script = `
from allauth.account.models import EmailAddress
from django.contrib.auth.models import Group
from store_backend.users.models import User

user = User(email=${JSON.stringify(email)}, is_staff=True)
user.set_password(${JSON.stringify(password)})
user.save()
user.groups.add(Group.objects.get(name="Staff"))
EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
print("SEEDED")
`;
  const out = runDjangoScript(script);
  if (!out.includes("SEEDED")) throw new Error(`seeding failed (see api container logs):\n${out}`);
  return { email, password };
}
