import type { BasketComparison, BasketItem, BasketSaving, BasketStore, Product, Retailer } from "./types"

// productId -> retailerId -> price. A missing entry means the store has no usable price.
export type PriceTable = Record<string, Record<string, { priceCents: number; observedAt: string }>>

function percent(part: number, whole: number) {
  return whole ? Math.round((part * 1000) / whole) / 10 : null
}

type RankedStore = BasketStore & { subtotals: (number | null)[] }

function priceStore(retailer: Retailer, items: BasketItem[], products: Map<string, Product>, prices: PriceTable): Omit<RankedStore, "rank"> {
  const store: Omit<RankedStore, "rank"> = {
    retailerId: retailer.id, retailerName: retailer.name, complete: true, pricedCount: 0, missingCount: 0,
    coveragePercent: null, totalCents: 0, lines: [], unpriced: [], subtotals: [],
  }
  for (const item of items) {
    const product = products.get(item.productId)!
    const price = prices[item.productId]?.[retailer.id]
    if (!price) {
      store.unpriced.push({ productId: product.id, productName: product.name, category: product.category })
      store.subtotals.push(null)
      continue
    }
    const subtotalCents = price.priceCents * item.quantity
    store.lines.push({
      productId: product.id, productName: product.name, brand: product.brand, packQty: product.packQty,
      packUnit: product.packUnit, packCount: product.packCount ?? 1, hcs: product.hcs, category: product.category,
      quantity: item.quantity, unitPriceCents: price.priceCents, subtotalCents, observedAt: price.observedAt,
    })
    store.subtotals.push(subtotalCents)
    store.totalCents += subtotalCents
  }
  store.pricedCount = store.lines.length
  store.missingCount = store.unpriced.length
  store.complete = store.missingCount === 0
  store.coveragePercent = percent(store.pricedCount, items.length)
  return store
}

// Complete stores first by total; incomplete ones by coverage, then total; name breaks ties.
function byRank(a: Omit<RankedStore, "rank">, b: Omit<RankedStore, "rank">) {
  return Number(!a.complete) - Number(!b.complete)
    || b.pricedCount - a.pricedCount
    || a.totalCents - b.totalCents
    || (a.retailerName ?? "").localeCompare(b.retailerName ?? "")
}

function saving(best: RankedStore, other: RankedStore): BasketSaving {
  const entry = { retailerId: other.retailerId, retailerName: other.retailerName }
  let basis: BasketSaving["basis"] = "full-basket"
  let common = best.subtotals.map((_, index) => index)
  if (!best.complete || !other.complete) {
    basis = "common-items"
    common = common.filter((index) => best.subtotals[index] !== null && other.subtotals[index] !== null)
  }
  if (!common.length) {
    return { ...entry, basis, comparedLines: 0, otherTotalCents: null, recommendedTotalCents: null, savingsCents: null, savingsPercent: null }
  }
  const recommendedTotalCents = common.reduce((sum, index) => sum + best.subtotals[index]!, 0)
  const otherTotalCents = common.reduce((sum, index) => sum + other.subtotals[index]!, 0)
  const savingsCents = otherTotalCents - recommendedTotalCents
  return { ...entry, basis, comparedLines: common.length, otherTotalCents, recommendedTotalCents, savingsCents, savingsPercent: percent(savingsCents, otherTotalCents) }
}

/** Mirrors the backend's POST /basket/compare rules: rank every store and compare the best with the rest. */
export function compareBasket(items: BasketItem[], products: Product[], retailers: Retailer[], prices: PriceTable): BasketComparison {
  const catalog = new Map(products.map((product) => [product.id, product]))
  const stores: RankedStore[] = retailers
    .map((retailer) => priceStore(retailer, items, catalog, prices))
    .sort(byRank)
    .map((store, index) => ({ ...store, rank: index + 1 }))

  const best = stores[0]?.pricedCount ? stores[0] : null
  const savings = best ? stores.slice(1).map((other) => saving(best, other)) : []
  const fullSavings = savings.filter((item) => item.basis === "full-basket").map((item) => item.savingsCents!)

  return {
    stores: stores.map(({ subtotals: _subtotals, ...store }) => { void _subtotals; return store }),
    recommendation: best ? { retailerId: best.retailerId, retailerName: best.retailerName, totalCents: best.totalCents, complete: best.complete } : null,
    savings,
    maxSavingsCents: fullSavings.length ? Math.max(...fullSavings) : null,
  }
}
