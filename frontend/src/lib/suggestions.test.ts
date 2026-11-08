import { describe, expect, it } from "vitest"
import { fold, isSuggested, matchRange, matchSuggestions, titleCase, toSuggestions } from "./suggestions"

const labels = (items: { label: string }[]) => items.map((item) => item.label)

describe("suggestions", () => {
  it("shows categories with a capital on each word, as Search does", () => {
    expect(titleCase("soft drinks")).toBe("Soft Drinks")
    expect(titleCase("toilet-rolls")).toBe("Toilet Rolls")
    expect(titleCase("milk")).toBe("Milk")
  })

  it("ignores case and accents when matching", () => {
    expect(fold("Nestlé")).toBe("nestle")
    expect(labels(matchSuggestions([{ label: "Nestlé" }, { label: "Mondelēz International" }], "mondelez"))).toEqual(["Mondelēz International"])
  })

  it("lists every suggestion A to Z when nothing is typed", () => {
    expect(labels(matchSuggestions([{ label: "Tea" }, { label: "bread" }, { label: "Milk" }], "  "))).toEqual(["bread", "Milk", "Tea"])
  })

  it("puts suggestions that start with what was typed first", () => {
    const found = matchSuggestions([{ label: "Toilet Rolls" }, { label: "Coffee" }, { label: "Cookies" }, { label: "Chocolate" }], "co")
    expect(labels(found)).toEqual(["Coffee", "Cookies", "Chocolate"])
  })

  it("keeps one suggestion per value, ignoring case, with the more common spelling and the counts added", () => {
    const found = toSuggestions(["Marigold", "marigold", "Owl"], { Marigold: 2, marigold: 1, Owl: 2 })
    expect(found).toEqual([{ label: "Marigold", count: 3 }, { label: "Owl", count: 2 }])
  })

  it("formats categories and leaves the count out when it's unknown", () => {
    expect(toSuggestions(["soft drinks", "milk", " "], undefined, titleCase)).toEqual([{ label: "Milk", count: undefined }, { label: "Soft Drinks", count: undefined }])
  })

  it("knows when what was typed is already listed, ignoring case and extra spaces", () => {
    const suggestions = [{ label: "Soft Drinks" }]
    expect(isSuggested(suggestions, "  soft   drinks ")).toBe(true)
    expect(isSuggested(suggestions, "soft")).toBe(false)
  })

  it("finds the matching part to show in bold", () => {
    expect(matchRange("Coca-Cola", "cola")).toEqual([5, 9])
    expect(matchRange("Nestlé", "stle")).toEqual([2, 6])
    expect(matchRange("Milk", "tea")).toBeNull()
    expect(matchRange("Milk", "")).toBeNull()
  })
})
