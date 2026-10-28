import { describe, expect, it } from "vitest"
import { compareBasket, type PriceTable } from "./compare"
import type { Product, Retailer } from "./types"

const product = (id: string): Product => ({ id, name: id, brand: "Brand", category: "misc", packQty: 1, packUnit: "kg", hcs: false })
const products = [product("rice"), product("milk"), product("bread")]
const retailers: Retailer[] = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }]
const at = (priceCents: number) => ({ priceCents, observedAt: "2026-10-24T08:00:00.000Z" })

describe("compareBasket", () => {
  it("recommends the cheapest complete store and measures savings against each other store", () => {
    const prices: PriceTable = {
      rice: { a: at(1880), b: at(1860), c: at(1980) },
      milk: { a: at(370), b: at(360), c: at(400) },
    }
    const result = compareBasket([{ productId: "rice", quantity: 1 }, { productId: "milk", quantity: 2 }], products, retailers, prices)

    expect(result.stores.map((store) => [store.retailerId, store.totalCents])).toEqual([["b", 2580], ["a", 2620], ["c", 2780]])
    expect(result.recommendation).toEqual({ retailerId: "b", retailerName: "Beta", totalCents: 2580, complete: true })
    expect(result.savings).toEqual([
      { retailerId: "a", retailerName: "Alpha", basis: "full-basket", comparedLines: 2, otherTotalCents: 2620, recommendedTotalCents: 2580, savingsCents: 40, savingsPercent: 1.5 },
      { retailerId: "c", retailerName: "Gamma", basis: "full-basket", comparedLines: 2, otherTotalCents: 2780, recommendedTotalCents: 2580, savingsCents: 200, savingsPercent: 7.2 },
    ])
    expect(result.maxSavingsCents).toBe(200)
  })

  it("ranks complete stores first and compares incomplete ones on common items only", () => {
    const prices: PriceTable = {
      rice: { a: at(2000), b: at(1500) },
      bread: { a: at(250) },
    }
    const result = compareBasket([{ productId: "rice", quantity: 1 }, { productId: "bread", quantity: 1 }], products, retailers, prices)

    expect(result.stores.map((store) => store.retailerId)).toEqual(["a", "b", "c"])
    expect(result.stores[1]).toMatchObject({ complete: false, pricedCount: 1, missingCount: 1, totalCents: 1500, unpriced: [{ productId: "bread" }] })
    expect(result.savings[0]).toMatchObject({ retailerId: "b", basis: "common-items", comparedLines: 1, savingsCents: -500 })
    expect(result.savings[1]).toMatchObject({ retailerId: "c", comparedLines: 0, savingsCents: null })
    expect(result.maxSavingsCents).toBeNull()
  })

  it("makes no recommendation when nothing is priced anywhere", () => {
    const result = compareBasket([{ productId: "milk", quantity: 1 }], products, retailers, {})
    expect(result.recommendation).toBeNull()
    expect(result.savings).toEqual([])
  })
})
