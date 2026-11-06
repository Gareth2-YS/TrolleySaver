import { describe, expect, it } from "vitest"
import { hasHiddenCharacters } from "./text"

describe("hasHiddenCharacters", () => {
  it("accepts ordinary text in any script, including the joiners some scripts need", () => {
    for (const value of ["Fresh Milk", "陈伟明", "Siti Nur'aini", "முருகன்", "क्‍ष", "Café  Latte", "Fresh\tMilk\n"]) {
      expect(hasHiddenCharacters(value)).toBe(false)
    }
  })

  it("refuses control and invisible formatting characters", () => {
    for (const value of ["a\u0000b", "a​b", "a‮b", "a⁦b", "﻿ab", "a­b", "a\u007fb"]) {
      expect(hasHiddenCharacters(value)).toBe(true)
    }
  })

  it("lets multi-line text keep line breaks, but nothing else", () => {
    expect(hasHiddenCharacters("Blurry photo.\nPlease retake it.", true)).toBe(false)
    expect(hasHiddenCharacters("Blurry\u001bphoto", true)).toBe(true)
    expect(hasHiddenCharacters("Blurry\u000bphoto", true)).toBe(true)
  })
})
