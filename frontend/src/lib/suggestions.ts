// Suggestions for a free-text field, such as Category and Brand on the new-product form: the values
// already in the catalogue, offered as the contributor types, while still allowing a new one.

export interface Suggestion {
  /** What's shown, and what the field is set to when it's picked. */
  label: string
  /** How many catalogue products have it, when known. */
  count?: number
}

/** Lower case and without accents, so "nestle" finds "Nestlé". */
export function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase()
}

/** A capital at the start of each word, as Search shows categories: "soft drinks" → "Soft Drinks". */
export function titleCase(text: string) {
  return text.replace(/[-_]/g, " ").replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toLocaleUpperCase())
}

/** Trimmed, with runs of spaces made one, as the server saves text. */
export const tidy = (text: string) => text.trim().replace(/\s+/g, " ")

const byLabel = (a: Suggestion, b: Suggestion) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })

/**
 * One suggestion per value, ignoring case. When the catalogue spells a value two ways, the spelling
 * with more products is shown and the counts are added together. `format` changes how values are
 * shown, such as `titleCase` for categories, which are saved in lower case.
 */
export function toSuggestions(values: string[], counts?: Record<string, number>, format: (value: string) => string = (value) => value): Suggestion[] {
  const merged = new Map<string, Suggestion & { most: number }>()
  for (const value of values) {
    const label = format(tidy(value))
    if (!label) continue
    const count = counts?.[value]
    const seen = merged.get(label.toLocaleLowerCase())
    if (!seen) {
      merged.set(label.toLocaleLowerCase(), { label, count, most: count ?? 0 })
      continue
    }
    if (count === undefined) continue
    if (count > seen.most) { seen.label = label; seen.most = count }
    seen.count = (seen.count ?? 0) + count
  }
  return [...merged.values()].map(({ label, count }) => ({ label, count })).sort(byLabel)
}

/** The suggestions containing what was typed, those starting with it first, then A to Z. All of them when nothing is typed. */
export function matchSuggestions(suggestions: Suggestion[], typed: string) {
  const query = fold(tidy(typed))
  if (!query) return [...suggestions].sort(byLabel)
  const startsWith = (suggestion: Suggestion) => fold(suggestion.label).startsWith(query)
  return suggestions
    .filter((suggestion) => fold(suggestion.label).includes(query))
    .sort((a, b) => Number(startsWith(b)) - Number(startsWith(a)) || byLabel(a, b))
}

/** True when what was typed is already a suggestion, ignoring case and extra spaces. */
export function isSuggested(suggestions: Suggestion[], typed: string) {
  const value = tidy(typed).toLocaleLowerCase()
  return suggestions.some((suggestion) => suggestion.label.toLocaleLowerCase() === value)
}

/** Where what was typed appears in `label`, as [start, end), to show it in bold; null when it doesn't. */
export function matchRange(label: string, typed: string): [number, number] | null {
  const query = fold(tidy(typed))
  const folded = fold(label)
  // Folding can change the length of some letters; then the positions wouldn't line up, so skip the bold.
  if (!query || folded.length !== label.length) return null
  const start = folded.indexOf(query)
  return start < 0 ? null : [start, start + query.length]
}
