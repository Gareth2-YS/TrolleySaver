const PRICE_FORMAT = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", currencyDisplay: "narrowSymbol" })

// Every price in the app is written the same way, e.g. "$2.88".
export function formatCents(cents: number) {
  return PRICE_FORMAT.format(cents / 100)
}

// For amounts kept in dollars, such as a submitted price of 3.5.
export function formatDollars(dollars: number) {
  return formatCents(Math.round(dollars * 100))
}

// A dollar amount as it's typed into a price box, with any digits past the cents dropped: "3.639" → "3.63".
// Prices are always dollars and cents, so the box never holds a third decimal place.
export function limitToCents(value: string) {
  const match = /^(\d*\.\d{2})\d+$/.exec(value)
  return match ? match[1] : value
}

// True when a dollar amount has at most two decimal places (e.g. pasted rather than typed).
export function isWholeCents(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}
