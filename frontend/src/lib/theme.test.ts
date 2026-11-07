import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The theme module keeps the visitor's choice in module state, so each test loads a fresh copy.
async function loadTheme() {
  vi.resetModules()
  return import("./theme")
}

function stubSystem(dark: boolean) {
  const listeners: Array<() => void> = []
  const media = { matches: dark, addEventListener: (_: string, listener: () => void) => listeners.push(listener), removeEventListener: vi.fn() }
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media))
  return { change(next: boolean) { media.matches = next; listeners.forEach((listener) => listener()) } }
}

const html = () => document.documentElement.classList

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("light and dark mode", () => {
  it("follows the system setting until someone chooses", async () => {
    const system = stubSystem(true)
    const theme = await loadTheme()
    theme.startTheme()
    expect(html().contains("dark")).toBe(true)
    system.change(false)
    expect(html().contains("light")).toBe(true)
    expect(html().contains("dark")).toBe(false)
  })

  it("remembers a choice on this device, and stops following the system", async () => {
    const system = stubSystem(false)
    let theme = await loadTheme()
    theme.startTheme()
    theme.toggleTheme()
    expect(html().contains("dark")).toBe(true)
    expect(localStorage.getItem("trolleysaver.theme")).toBe("dark")
    system.change(false)
    expect(html().contains("dark")).toBe(true)

    document.documentElement.className = ""
    theme = await loadTheme() // a reload
    theme.startTheme()
    expect(html().contains("dark")).toBe(true)
  })

  it("still switches when the browser blocks storage", async () => {
    stubSystem(false)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    const theme = await loadTheme()
    theme.startTheme()
    theme.toggleTheme()
    expect(html().contains("dark")).toBe(true)
    theme.toggleTheme()
    expect(html().contains("light")).toBe(true)
  })
})
