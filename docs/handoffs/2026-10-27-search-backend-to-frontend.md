# Search & filter: backend → frontend handoff

**Date:** 27 Oct 2026 · **From:** Nancy (backend) · **To:** frontend developer · **Status:** deployed to `dev`, passing unit tests and checked over real HTTP

The search backend is one public endpoint, `GET /products/search`. Send it the shopper's search words and filters as query parameters. It returns:

- the products that match **every** filter given, sorted by name,
- each product's current price at every store, and its lowest price,
- the filter options for the page (`facets`), the number of results and the catalog size.

With no parameters it returns the whole catalog, priced, so the Search page needs only this one call. Searching and filtering can move from the browser to the backend.

`frontend/src/pages/search-products.tsx` doesn't use it yet. It loads `GET /products`, then prices everything through `POST /basket/compare` in batches of 50, then filters in the browser. Section 4 lists what to change.

- Full parameters, response, rules and TypeScript types: [API reference → `GET /products/search`](../api/README.md#get-productssearch)
- How to test it: [backend/TESTING.md → 9. Search](../../backend/TESTING.md#9-search)

## 1. What the page needs from the backend

most of these functions are implemented. just use this as a checklist

| Page part                                            | Comes from                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Search box                                           | `q`: every word must appear, ignoring case, in the name, brand, category, `searchTerms`, `dietary` tags or pack size. Up to 100 characters. |
| Quick category chips and the "Type" dropdown         | `category` (exact, ignoring case). Options from `facets.categories`.                                                                        |
| Brand dropdown                                       | `brand` (exact, ignoring case). Options from `facets.brands`.                                                                               |
| Dietary dropdown                                     | `dietary` (exact, ignoring case). Options from `facets.dietary`.                                                                            |
| "Healthier Choice" chip                              | `hcs=true`. Leave it out for all products. `hcs=false` gives only products without the symbol.                                              |
| "Lowest price range ($)" From / To                   | `minPriceCents` / `maxPriceCents`, whole cents, inclusive. Matched against the product's **lowest** current price.                          |
| "12 of 24 products"                                  | `total` and `catalogSize`                                                                                                                   |
| Product card price ("$3.56 at FairPrice")            | `items[i].lowestPrice`: `priceCents` and `retailerName`. `null` when no store has a current price.                                          |
| Product details: "Current retailer prices"           | `items[i].prices`, keyed by retailer id: `priceCents`, `priceDate`, `submissionCount`                                                       |
| "Prices updated 25 Oct, 14:53" (not on the page yet) | `pricesUpdated` (ISO time in UTC; `null` before the nightly job has ever run)                                                               |

## 2. Changing the Search page over

What `search-products.tsx` does now, and what replaces it:

| Now                                                                                                                             | Replace with                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchProducts()` (`GET /products`) and `fetchProductPrices()` (`POST /basket/compare`, 50 at a time) on mount                  | One `GET /products/search` call, re-run whenever a filter changes (section 2)                                                                                                                       |
| `filteredProducts` filters `products` in the browser                                                                            | `items` from the response                                                                                                                                                                           |
| `categories`, `brands`, `dietaryOptions` built from `products`                                                                  | `facets.categories`, `facets.brands`, `facets.dietary`. Keep `quickCategories` as is, but build it from `facets.categories`.                                                                        |
| `getLowestPrice(product)` in `ProductCard`                                                                                      | `product.lowestPrice`                                                                                                                                                                               |
| `RETAILER_NAMES[lowestPrice.retailerId]` on the card                                                                            | `lowestPrice.retailerName`, falling back to `RETAILER_NAMES` / `formatLabel` when it's `null`                                                                                                       |
| `${filteredProducts.length} of ${products.length} products`                                                                     | `${total} of ${catalogSize} products`                                                                                                                                                               |
| `products.length === 0` → "No products yet"                                                                                     | `catalogSize === 0`                                                                                                                                                                                 |
| `filteredProducts.length === 0` → "No matching products"                                                                        | `total === 0`                                                                                                                                                                                       |
| Two loading phases: `loading`, then `pricesLoading` / `pricesError` ("Product list loaded, but current prices are unavailable") | One `loading` / `error`. Prices come with the products, so `pricesLoading`, `pricesError` and the `showNoPrice` prop can go; always show "No current price available" when `lowestPrice` is `null`. |

Search behaviour changes slightly, for the better:

- **Words, not phrases.** The page now matches the whole query as one substring (`"milk fresh"` finds nothing). The backend matches each word separately, so it finds Magnolia Fresh Milk.
- **Brand and category ignore case.** The page compares with `===`. The backend doesn't care about case, so this only matters if you build URLs by hand.

Also add:

- **Show `pricesUpdated`** near the "12 of 24 products" count, e.g. "Prices updated 25 Oct, 14:53".
- **Cap the search box at 100 characters** (`maxLength={100}` on the search `Input`). Longer searches get a `400`.
- **Show field errors from a `400`.** The body is `{ code: "VALIDATION_ERROR", fieldErrors: { field: message } }`. The page already checks the price range (`priceRangeError`), so this should be rare, but showing `fieldErrors` beats a bare "HTTP 400".
- **Store names.** `RETAILER_NAMES` is hard-coded, and the details dialog lists those three stores plus any extra id in `prices`. That's fine for now; load names from [`GET /retailers`](../api/README.md#get-retailers) if a store is ever added.

## 3. Trying it without the frontend

PowerShell, no login needed:

```powershell
$api = "<ApiUrl>";
$r = Invoke-RestMethod -Uri "$api/products/search?q=milk&maxPriceCents=500";
"$($r.total) of $($r.catalogSize) products, prices updated $($r.pricesUpdated)";
$r.items | Select-Object name, hcs, @{ n = "lowest"; e = { "$($_.lowestPrice.retailerName) $($_.lowestPrice.priceCents)" } } | Format-Table
```

On 27 Oct this gave `2 of 24 products`: Magnolia Fresh Milk (FairPrice 363) and Marigold HL Milk - Plain (FairPrice 356). More ways to test it, including every validation error, are in [backend/TESTING.md](../../backend/TESTING.md#9-search).
