import { describe, expect, it } from "vitest"
import { contributionSchema, earliestObservedDate, singaporeDateString } from "./schema"

describe("contributionSchema", () => {
  it("accepts the backend price ceiling and rejects prices above it", () => {
    const base = { productId: "product", storeId: "retailer", observedDate: singaporeDateString() }
    expect(contributionSchema.safeParse({ ...base, price: 1000 }).success).toBe(true)
    expect(contributionSchema.safeParse({ ...base, price: 1000.01 }).success).toBe(false)
  })

  it("accepts the 30-day boundary and rejects older observed dates", () => {
    const now = new Date()
    const base = { productId: "product", storeId: "retailer", price: 2.8 }
    expect(contributionSchema.safeParse({ ...base, observedDate: earliestObservedDate(now) }).success).toBe(true)
    expect(contributionSchema.safeParse({ ...base, observedDate: "2020-01-01" }).success).toBe(false)
  })
})
