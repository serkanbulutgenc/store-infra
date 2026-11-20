# Store

An online store where customers browse products, pick a colour and size, and buy.

## Language

### Catalog

**Product**:
A thing the store sells, shown on a listing card and a detail page.

**Variant**:
One purchasable combination of a Product's Colour and Size, with its own stock. A customer always adds a Variant to the basket, never a Product.
_Avoid_: SKU, option

**Colour**:
A Product's colour choice. Each Colour has its own Sizes and, optionally, its own Photos.
_Avoid_: Color

**Size**:
A Product's size choice within a Colour (for example "M" or "42").
_Avoid_: Beden (in code and docs; it is only the Turkish UI label)

**One-size Product**:
A Product whose selected Colour has exactly one Variant. The customer has no size to choose, so that Variant is picked automatically. Judged per Colour: a Colour with several Sizes still asks for one.
_Avoid_: single-size, sizeless

**Photo**:
A picture of a Product. It belongs to a Colour, or is shared by all Colours.

**Description**:
The formatted text a Product shows on its detail page, written by Owner or Staff. It can contain headings, lists, links, images and tables. Compact views (quick view, listing cards) show only a plain-text excerpt of it.
_Avoid_: Details, body

**Thumbnail**:
A small Photo shown beside the main Photo so the customer can switch which one is large. Shown only when the selected Colour has more than one Photo.

**Stock alert**:
A Shopper's request, for one sold-out Variant, to be emailed once when it is back in stock. Needs the Shopper's specific consent and a confirmed email address; it ends after the email is sent, is rejected, or lapses after 90 days.
_Avoid_: waitlist, notify me, subscription

**Size guide**:
The formatted measuring reference a Shopper opens from the size picker. Written once per Product class, with an optional override on a single Product. Shown in a dialog; hidden for a One-size Product or when no guide applies.
_Avoid_: size chart, sizing

**Fit note**:
An optional one-line comment on how a Product runs (for example "runs small, size up"), shown under the size picker. Plain text, per Product.
_Avoid_: fit tip

**Similar products**:
The ranked list of other Products shown on a Product's page (label "Benzer ürünler"). Ranked by same leaf Category, then Brand, shared attributes and close price; only published, in-stock Products appear.
_Avoid_: related products

**Recently viewed**:
The list of up to 12 Products a Shopper last opened, kept only in their own browser and cleared on sign-out (label "Son baktıklarınız"). It is never sent to the server as a log.
_Avoid_: history

**Report**:
A read-only, Owner-only summary of orders, returns, Campaigns and Vouchers (label "Raporlar"). It never uses visitor tracking.
_Avoid_: analytics, statistics
