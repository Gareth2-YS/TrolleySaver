import { describe, expect, it } from "vitest"
import { formatCents, formatDay, formatDollars, formatTimestamp, isWholeCents, limitToCents } from "./format"

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

describe("dollars and cents", () => {
  it("drops digits typed past the cents", () => {
    expect(limitToCents("3.639")).toBe("3.63")
    expect(limitToCents(".125")).toBe(".12")
    for (const value of ["3.63", "3.6", "3.", "3", ""]) expect(limitToCents(value)).toBe(value)
  })

  it("tells whole cents from fractions of a cent", () => {
    expect(isWholeCents(3.63)).toBe(true)
    expect(isWholeCents(0.1 + 0.2)).toBe(true)
    expect(isWholeCents(3.635)).toBe(false)
  })
})

describe("date formatting", () => {
  it("reads a bare date as a Singapore day", () => {
    expect(formatDay("2026-11-05")).toBe("5 Nov 2026")
  })

  it("shows times in Singapore time", () => {
    // 16:30 UTC is 00:30 the next day in Singapore.
    expect(formatDay("2026-11-05T16:30:00.000Z")).toBe("6 Nov 2026")
    expect(formatTimestamp("2026-11-05T16:30:00.000Z")).toMatch(/^6 Nov 2026, 12:30\s?am$/)
  })

  it("leaves unreadable values as they are", () => {
    expect(formatDay("not a date")).toBe("not a date")
  })
})
