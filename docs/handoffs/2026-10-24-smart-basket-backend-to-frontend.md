# Smart Basket: backend → frontend handoff

**Date:** 24 Oct 2026 · **From:** Yong Hsien (backend) · **To:** frontend developer · **Status:** deployed to `dev`, passing unit, evaluation and end-to-end tests

The Smart Basket backend is one public endpoint, `POST /basket/compare`. Send it the shopper's basket. It returns:
- the cheapest store for that exact basket,
- a **healthier basket** to show beside it, with each product swapped for a Healthier Choice product where the category has one,
- per-store shopping lists, unpriced items and savings for both baskets.

The `/basket` page in `frontend/src/pages/smart-basket.tsx` is still an empty shell. Everything below is frontend work.

- Full request and response, rules and TypeScript types: [API reference → `POST /basket/compare`](../api/README.md#post-basketcompare)
- Clickable mockup of the page with real catalog data: https://claude.ai/artifact/RGZtG8JXCc2Mj63mwd4iPW (ask Yong Hsien for access if it doesn't open)

## 1. What the page needs from the backend

| Page part | Comes from |
|---|---|
| "Add groceries" product picker | [`GET /products`](../api/README.md#get-products), which already exists and is public. 24 products, so search, category chips and a "Healthier Choice only" filter (`hcs`) can all run in the browser. There's no search endpoint. |
| Your basket (products and quantities) | Kept by the frontend, e.g. in `localStorage` (the basket is public, no login). Send it whole as `items: [{ productId, quantity }]` each time it changes. Nothing is saved on the server. |
| Cheapest basket: best store and total | `basket.recommendation` |
| Savings against the other stores | `basket.savings[]`: show `savingsCents`/`savingsPercent`, and use `basis` to label partial comparisons (section 3) |
| Price comparison list (every store) | `basket.stores[]`, already ranked: `totalCents`, `pricedCount`, `missingCount`, `complete` |
| One store's shopping list | `basket.stores[i].lines[]` (`quantity × unitPriceCents = subtotalCents`) and `unpriced[]` |
| "Potential savings: up to $X" | `basket.maxSavingsCents` |
| Healthier basket, beside the cheapest one | `healthierBasket`, the same shape as `basket`, plus `swaps[]` |
| "+$1.84 vs cheapest basket" | `healthierExtra.extraCents` / `extraPercent` (can be negative: the healthier basket is sometimes cheaper) |

## 2. Calling it

```ts
const result = await api<ApiBasketResult>("/basket/compare", {
  method: "POST",
  body: { items: basket.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
})
```

`api()` and `ApiBasketResult` are in the [API reference](../api/README.md#7-example-client-code). No token is needed. If you send one anyway, it's ignored.

Debounce calls while the shopper is pressing + and −. Each call takes a few hundred milliseconds.

## 3. Things to show, not hide

- **Unpriced items.** If a store has no recent price for a product, the product appears in that store's `unpriced[]` and the store is `complete: false`. Show "2 priced · 1 missing" rather than dropping the item. The report requires this.
- **No store has everything.** If `recommendation.complete` is `false`, the "best store" doesn't sell the whole basket. Say so.
- **Partial savings.** A saving with `basis: "common-items"` only compares the `comparedLines` items both stores price. Label it, e.g. "on the 2 items both stores price". `savingsCents` can then be negative, and it can be `null` when the stores share no items.
- **Healthier swaps.** Use `healthierBasket.swaps[].status` for each line:
  - `swapped`: show the original name crossed out and the new product. On the store's lines, `replacesProductId` links them.
  - `already-hcs`: show "already Healthier Choice".
  - `no-hcs-option`: show "kept, no Healthier Choice option".

  `healthierBasket` is `null` when nothing can be swapped. Show a short message instead of an empty panel.
- **Different pack sizes.** A swap matches on category only. MILO cereal is 300 g and Coco Pops 350 g, so show `packQty`/`packUnit` on swapped lines.

## 4. Things to fix elsewhere

- `frontend/src/contributions/catalog.ts` is a hard-coded placeholder: 4 made-up products, and store ids `sheng-siong`, `cold-storage` and `giant`. The backend uses `shengsiong` and `coldstorage`, and has no Giant. Load products from `GET /products` and stores from `GET /retailers` instead.

## 5. Trying it without the frontend

PowerShell, no login needed:

```powershell
$api = "<ApiUrl>";
$products = (Invoke-RestMethod "$api/products").items;
$body = @{ items = @(@{ productId = $products[0].id; quantity = 2 }) } | ConvertTo-Json -Depth 5;
Invoke-RestMethod -Method Post -Uri "$api/basket/compare" -ContentType application/json -Body $body | ConvertTo-Json -Depth 12
```

More ways to test it, and a hand-worked example to check the numbers against, are in [backend/TESTING.md](../../backend/TESTING.md#8-smart-basket).
