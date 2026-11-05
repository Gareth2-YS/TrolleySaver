# When a product's prices were last updated (`priceUpdatedAt`): backend → frontend handoff

**Date:** 4 Nov 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** backend deployed to `dev`, and all 24 dev products have it. **Search & filter shows it** (4 Nov, see §2); the Smart Basket is optional and not started.

Every product now has a **`priceUpdatedAt`** field: the time, in UTC, of the nightly price run that last changed any of its store prices. It lets a shopper see how fresh a product's prices are. The details are in the [API reference → Product](../api/README.md#product).

## 1. The field

| Endpoint | Used by | `priceUpdatedAt` |
|---|---|---|
| `GET /products` | Smart Basket, and the product box on Price & image upload | On **every** product: an ISO 8601 UTC string, or `null` if the product has never been priced |
| `GET /products/search` | Search & filter | On every priced product. A product that has never been priced doesn't have the key, so treat a missing value as `null`. |

Example: `"priceUpdatedAt": "2026-11-03T16:05:01.230Z"` is **4 Nov 2026, 12:05 am** in Singapore.

**When it changes:** the price job runs at 00:05 Singapore time and averages the previous day's accepted prices. A product gets the run's time only on nights when at least one of its store prices was recomputed, i.e. a new accepted price came in for it. On a quiet night it keeps its old value. So it means "when this product's prices last changed", not "when the job last ran".

A newly approved product has `null` until the night after approval, when its first price is averaged.

## 2. What to build

**Done on Search & filter (4 Nov):** each product card shows "Prices updated 4 Nov, 12:05 am" under its price. The details dialog shows the same line under "Current retailer prices", or "No prices yet". The code is `getPriceUpdatedLabel` in `frontend/src/pages/search-products.tsx`, tested in `search-products.test.tsx`. The steps below describe that work, and also apply to the Smart Basket if you add it there.

1. Add `priceUpdatedAt?: string | null` to the product types: `Product` in `frontend/src/basket/types.ts` and `SearchProduct` in `frontend/src/pages/search-products.tsx`.
2. Show it where a shopper looks at one product's prices. The natural place is the Search details dialog, under "Current retailer prices", e.g. **"Prices updated 4 Nov, 12:05 am"**. Adding it to the Smart Basket is optional.
3. Show it in **Singapore time**, whatever the browser's time zone:

   ```ts
   const priceUpdatedLabel = (value?: string | null) => value
     ? `Prices updated ${new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value))}`
     : "No prices yet"
   ```

4. When it's `null` or missing, show **"No prices yet"**, or nothing if the card already says "No current price available".

## 3. How it differs from the dates you already have

| Field | Where | Meaning |
|---|---|---|
| `priceUpdatedAt` | Each product | When the nightly job last changed any of **this product's** store prices |
| `prices[].priceDate` | Each store price, in search and the basket comparison | The Singapore day that store's average covers. Search already shows it as "Price date …". |
| `pricesUpdated` | Top level of the search and basket comparison responses | When the nightly job last ran, for all products. The UI doesn't show it yet. |

A product's `priceUpdatedAt` can be older than `pricesUpdated`. That's normal: it means no new prices came in for that product since.

Search and the basket hide a store price more than 30 days old. A product whose `priceUpdatedAt` is older than that may show "No current price available", so show the date there as well, rather than hiding it.

## 4. Test checklist

Against `dev` with `VITE_SMART_BASKET_MODE=api` and `VITE_API_BASE_URL` set:

1. In Search, open a priced product's details. It shows "Prices updated …" in Singapore time. A value ending `T16:05:…Z` shows as the **next** day, 12:05 am.
2. A product with no price (e.g. one approved today) shows "No prices yet".
3. Submit an accepted price for a product. After the next 00:05 run (or ask Gareth to run the job for today), that product's time moves to the run time, and other products keep theirs.
4. If you show it in the Smart Basket, it matches Search for the same product.
5. Change your computer's time zone. The displayed time doesn't change.

The manual UI cases are in [docs/qa/test-cases.md §9](../qa/test-cases.md#9-price-freshness).

**Backend coverage:**
- `backend/tests/test_daily_prices.py` and `test_admin_and_listing.py`
- the smoke test check "GET /products returns priceUpdatedAt on every product"
- [`backend/TESTING.md` → Daily prices](../../backend/TESTING.md#daily-prices-run-the-nightly-job-by-hand)
