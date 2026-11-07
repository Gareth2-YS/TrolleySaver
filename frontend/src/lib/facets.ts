// Filters that narrow each other: each dropdown offers only the options that still have products
// under every other filter, with a count, so shoppers can start from any filter and never pick a
// combination with nothing in it.

export interface FacetOption {
  value: string
  // How many products this option gives with the other filters kept; unknown when the counts are missing.
  count?: number
}

/**
 * The options for one dropdown, A to Z. The current choice stays listed even when nothing fits it
 * any more (count 0), so changing another filter never silently drops what the shopper picked.
 * Without counts, every value in `fallback` is offered, as before.
 */
export function facetOptions(counts: Record<string, number> | undefined, selected: string, fallback: string[] = []): FacetOption[] {
  const options: FacetOption[] = counts
    ? Object.entries(counts).filter(([, count]) => count > 0).map(([value, count]) => ({ value, count }))
    : fallback.map((value) => ({ value }))
  if (selected && !options.some((option) => option.value === selected)) options.push({ value: selected, count: counts ? 0 : undefined })
  return options.sort((a, b) => a.value.localeCompare(b.value))
}

/** True when the current choice fits nothing under the other filters. */
export function isStale(options: FacetOption[], selected: string) {
  return Boolean(selected) && options.find((option) => option.value === selected)?.count === 0
}

/** How many items have each value, for counting options in the browser. */
export function countBy<T>(items: T[], valueOf: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const value = valueOf(item)
    if (value) counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}
