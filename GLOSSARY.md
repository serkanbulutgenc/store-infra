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

**Thumbnail**:
A small Photo shown beside the main Photo so the customer can switch which one is large. Shown only when the selected Colour has more than one Photo.
