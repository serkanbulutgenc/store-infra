# Loading existing shop stock

Use the Dashboard bulk import (Owner only): **Dashboard, Katalog, İçe aktar**. The Owner's stock list goes into the columns of [stock-template.csv](stock-template.csv). The same screen corrects the catalogue later: upload a corrected file and prices and stock are updated, never duplicated.

## Columns

Required: `product_name`, `category`, `product_class`, `colour`, `size`, `shelf_price_try`, `quantity`. Optional: `brand`, `supplier`, `sku`, `kdv_class`, `description`, `notes`. The file is UTF-8 CSV (comma, semicolon or tab separated); an Excel "CSV UTF-8" export works. Prices may be `199.90` or `199,90`.

| Column | Meaning |
|---|---|
| `product_name` | Rows with the same name and category become variants of one Product. |
| `category` | `Kadın`, `Kadın > Elbise` or a longer path (up to five levels). Missing categories, including every missing ancestor, are created on confirm. |
| `product_class` | `Giyim`, `Ayakkabı` or `İç Giyim` (and any other class in the Dashboard). Fixes the size list and default KDV. |
| `colour` | Must already exist under Renkler (a colour needs a swatch). |
| `size` | Must be in the class's size list, for example `S`, `M`, `38`, `75B`, `Tek Ebat`. |
| `shelf_price_try` | KDV-inclusive TRY. The first row of a product sets the product price; a row with another price becomes that variant's own price. |
| `quantity` | On-hand count to end up with. The difference is recorded as an audited stock adjustment. |
| `brand`, `supplier` | Created on confirm if missing. |
| `sku` | Optional. Matches an existing variant by SKU; empty means match by product name, colour and size, and a new variant gets a generated SKU. |
| `kdv_class` | Empty uses the class default. A percentage (`20`) overrides it for the product (accessories). |
| `description` | The product's Açıklama, in Markdown (bold, lists, links, tables), at most 5000 characters. Rows of one product may repeat it; the first non-empty one is used. Without this column, existing descriptions are left alone; with it, a product whose rows are all empty gets its description cleared. Put cells that contain line breaks in quotes. |
| `notes` | Ignored. |

## Steps

1. Upload the file: the preview lists rows to create and update, brands, suppliers and categories that would be created, and every row error with its row number and column. Nothing is written.
2. Fix the file until there are no errors, then confirm. The run is all rows or none. Products are created as drafts; add photos and publish them from the product screens.
3. Spot-check ten variants against the shop shelf, then confirm prices are KDV-inclusive shelf prices.
