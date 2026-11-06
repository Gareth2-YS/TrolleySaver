import { describe, expect, it } from "vitest"
import { contributionSchema, earliestObservedDate, reasonError, singaporeDateString } from "./schema"

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

describe("hardening rules", () => {
  const base = { productId: "product", storeId: "retailer", observedDate: singaporeDateString() }

  it("takes prices in whole cents only, so nothing is rounded silently", () => {
    for (const price of [3.63, 0.01, 999.99, 3.6, 1000]) expect(contributionSchema.safeParse({ ...base, price }).success).toBe(true)
    const result = contributionSchema.safeParse({ ...base, price: 3.635 })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Enter the price in dollars and cents, e.g. 3.63"])
  })

  it("checks rejection reasons like the server", () => {
    expect(reasonError("Blurry photo.\nPlease retake it.")).toBeNull()
    expect(reasonError("Blurry ‮photo")).toBe("The reason can't contain hidden or control characters")
    expect(reasonError("x".repeat(501))).toBe("Keep the reason under 500 characters")
  })
})
