# Loading existing shop stock

No bulk importer in phase 1. Choose one with the Owner and record it in [decisions.md](decisions.md).

1. **By hand** in the Dashboard (catalog and stock screens). Fine for a small catalogue.
2. **One-off script** in `store-backend` calling `services.catalog` (create_category, create_colour, create_product, create_variant) and `services.stock.adjust`. Run once, then delete it. Not written yet; its signatures need checking against the code at that point.

Either way, collect the Owner's stock list in the columns of [stock-template.csv](stock-template.csv) first.

After loading: spot-check ten variants against the shop shelf, then confirm prices are KDV-inclusive shelf prices.
