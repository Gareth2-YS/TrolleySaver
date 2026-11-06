import { useSyncExternalStore } from "react"

export type Theme = "light" | "dark"

const THEME_KEY = "trolleysaver.theme"
const SYSTEM_DARK = "(prefers-color-scheme: dark)"
const listeners = new Set<() => void>()
// The choice made on this page, for when storage is unavailable (e.g. blocked site data).
let chosenThisVisit: Theme | null = null

/** The theme someone chose with the toggle, if any. Without one, the app follows the system setting. */
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (value === "light" || value === "dark") return value
  } catch { /* storage unavailable */ }
  return chosenThisVisit
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.(SYSTEM_DARK).matches ? "dark" : "light"
}

export function currentTheme(): Theme {
  return savedTheme() ?? systemTheme()
}

/** Puts `light` or `dark` on <html>: styles.css picks the colours, and Tailwind's `dark:` classes follow it. */
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.classList.toggle("light", theme === "light")
}

function changed() {
  applyTheme(currentTheme())
  listeners.forEach((listener) => listener())
}

/** Applies the theme before the first render, and follows the system setting while nobody has chosen. */
export function startTheme() {
  applyTheme(currentTheme())
  window.matchMedia?.(SYSTEM_DARK).addEventListener?.("change", () => { if (!savedTheme()) changed() })
}

/** Switches between light and dark, and remembers the choice on this device. */
export function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark"
  chosenThisVisit = next
  try { localStorage.setItem(THEME_KEY, next) } catch { /* storage unavailable: the choice lasts until the page reloads */ }
  changed()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    currentTheme,
  )
}
