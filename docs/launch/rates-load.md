# Loading real carrier prices and desi (ticket 53)

Owner only. The seeded rate table is a **dummy sheet** (placeholder numbers). Go-live is blocked until it is replaced.

## What the Owner supplies

- Contract price sheets for Yurtiçi Kargo, Aras Kargo and PTT Kargo: per zone, the price for 0 to 2, 3 to 5 and 6 to 10 desi, and the price per extra desi above 10. KDV-inclusive TRY.
- The desi value per Product class (and any Product that differs).
- Confirmation of the zone mapping of the 81 provinces (Mersin = zone 1).

## Steps

1. Dashboard, **Kargo fiyatları**: enter every carrier and zone price from the sheets. Overwrite all dummy values; none may remain.
2. Same screen: set the desi per Product class; set per-Product desi where it differs (Product editor, Fiyat tab).
3. Check the zone mapping against the Owner's list.
4. Quote one test basket per zone (basket, then checkout with a province from that zone, stop before placing). Compare shipping fee with the carriers' sheets for the basket's total desi. The cheapest of the three carriers is what checkout shows.
5. Record the four quotes below, then tick item 4c in [checklist.md](checklist.md).

## Quote log

| Date | Zone | Province | Basket desi | Expected (sheet) | Shown at checkout | Match |
|------|------|----------|-------------|------------------|-------------------|-------|
| | 1 | | | | | |
| | 2 | | | | | |
| | 3 | | | | | |
| | 4 | | | | | |
