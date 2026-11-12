# Returns wording and return-carrier terms: review packet (ticket 59)

For the lawyer or the Owner. Everything below is what the shop shows or sends today, copied from the code on 2026-11-12. Nothing here is approved yet. Approving closes checklist items 1b and 4a (see [checklist.md](checklist.md)).

Rules come from [phase 2 section 5](../../../store-backend/docs/spec/phase-2.md).

## 1. Rules to confirm

| # | Rule as built | Approve / change |
|---|---------------|------------------|
| R1 | Cancel before shipping (order new or preparing), from the tracking page or account area. Stock is released automatically. | |
| R2 | Return request allowed within **14 days of delivery**. | |
| R3 | Hygiene products (opened underwear) cannot be selected for return. | |
| R4 | Shopper picks lines and quantities and one reason: wrong size, changed mind, defective, wrong item sent, other. | |
| R5 | Staff approve, or reject with a mandatory reason. | |
| R6 | Return shipping paid by the shop for "defective" and "wrong item sent"; otherwise by the Shopper. | |
| R7 | Refunds are manual (cash or IBAN transfer), recorded by the Owner. | |
| R8 | Open: do returned items go back on the shelf? Default: Staff choose per line. | |

## 2. Shopper-facing wording (Turkish)

**Reason labels:** Beden uymadı · Vazgeçtim · Ürün kusurlu · Yanlış ürün gönderildi · Diğer

**Status labels:** İnceleniyor · Onaylandı, ürünleri gönderebilirsiniz · Reddedildi · Ürünler bize ulaştı · Ödeme iadesi yapıldı

**Shipping payer note (approval email and pages):**
- Shop pays: "İade kargo ücretini mağazamız öder."
- Shopper pays: "İade kargo ücretini siz ödersiniz."

**Tracking page:**
- "Teslimattan sonra 14 gün içinde iade talep edebilirsiniz (son gün: …)"
- "İade süresi (teslimattan sonra 14 gün) dolduğu için yeni iade talebi yapılamıyor."
- "Bu siparişte iade talep edilebilecek ürün kalmadı."
- "İade edilemez (hijyen ürünü ya da iade talebi zaten var)."
- Cancel: "Siparişiniz kargoya verilmeden önce iptal edebilirsiniz. Ödeme yaptıysanız iade için sizinle …"

**Pre-information form (checkout):**
- "Teslim tarihinden itibaren 14 gün içinde gerekçe göstermeden cayma hakkınızı kullanabilirsiniz. Ayrıntılar iade ve cayma koşulları sayfasındadır."
- "Hijyen ürünü: ambalajı açıldıktan sonra iade edilemez."
- "İade için kargo: <return carrier from Store settings>" (item 4a: the carrier must be named here)

## 3. Emails (Turkish)

| Email | Text |
|-------|------|
| Request received (Shopper) | "İade talebinizi aldık. Ekibimiz inceleyip size e-posta ile dönecek." + reason + lines |
| Approved | "İade talebiniz onaylandı. Ürünleri bize geri gönderebilirsiniz." + lines + shipping payer note |
| Rejected | "İade talebiniz kabul edilemedi. Neden: <reason>" |
| Items received | "İade ettiğiniz ürünler bize ulaştı. Ödeme iadeniz için sizinle iletişime geçeceğiz." |
| Refund sent | "<tutar> tutarındaki iadeniz <yöntem> ile yapıldı. Bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir." |
| Order cancelled | "Siparişiniz iptal edildi. Neden: … Ödeme yaptıysanız iade için sizinle iletişime geçeceğiz." |
| Staff alert | "Yeni iade talebi: <no>" + reason + lines + Dashboard link |

Template files: `store-backend/store_backend/messaging/templates/messaging/return_*.txt`, `refund_issued.txt`, `order_cancelled.txt`.

## 4. Legal page

`İade ve Cayma Koşulları` (`store-frontend/src/features/legal/content/returns-withdrawal.md`) now carries the approved text, version 2 (loaded 2026-11-12; the working draft is [returns-legal-draft.md](returns-legal-draft.md)). The text points to the "Hakkımızda / İletişim" page for the seller's details and to the Ön Bilgilendirme Formu for the return carrier, so the carrier name must be set in Store settings (section 7).

## 5. Return-carrier agreement (item 4a)

Signed; the Owner confirmed it on 2026-11-12.

- Carrier name (goes into Store settings `return_carrier` and the pre-information form): **Aras Kargo**
- Billing route, pickup or drop-off method, parcel limits, contract date and where the signed copy is kept: not recorded here. The Owner holds the agreement.

## 6. Sign-off

| Item | Approved by | Date | Notes |
|------|-------------|------|-------|
| Sections 1 to 3 wording | Owner (Serkan) | 2026-11-12 | Approved as written; R8 still open (default: Staff choose per line) |
| Legal page text (section 4) | Owner (Serkan) | 2026-11-12 | Loaded as version 2 |
| Carrier agreement (section 5) | Owner (Serkan) | 2026-11-12 | Signed; Aras Kargo |

## 7. After sign-off

Done on 2026-11-12 in the repos: approved text loaded into `returns-withdrawal.md`, its `version` set to 2 in `features/legal/pages.ts`, checklist 4a ticked. Aras Kargo is the return carrier.

Still to do **in production** (the local stack was done the same way):

1. Deploy the frontend that carries the new text.
2. Dashboard → Settings: set the return carrier to "Aras Kargo".
3. Set the Legal page version. The Dashboard tab only shows versions, so use the api container's shell as the Owner:

   ```sh
   docker compose -f compose.yaml exec api python manage.py shell -c "from store_backend.users.models import User; from store_backend.services import shop_settings as s; u=User.objects.get(email='OWNER@EMAIL'); print(s.update(u, legal_versions={'returns_withdrawal':'2'}).legal_versions)"
   ```

4. Fill checklist 1b once the pre-information form and privacy notice are also approved and loaded.
