import { describe, expect, it } from "vitest"
import { formatCents, formatDollars } from "./format"

describe("price formatting", () => {
  it("writes every price as dollars and cents with a plain $", () => {
    expect(formatCents(288)).toBe("$2.88")
    expect(formatCents(5)).toBe("$0.05")
    expect(formatCents(123456)).toBe("$1,234.56")
    expect(formatCents(0)).toBe("$0.00")
  })

  it("rounds amounts kept in dollars to the cent", () => {
    expect(formatDollars(3.5)).toBe("$3.50")
    expect(formatDollars(3.456)).toBe("$3.46")
    expect(formatDollars(19.999)).toBe("$20.00")
  })
})
