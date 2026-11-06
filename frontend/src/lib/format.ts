const PRICE_FORMAT = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", currencyDisplay: "narrowSymbol" })

// Every price in the app is written the same way, e.g. "$2.88".
export function formatCents(cents: number) {
  return PRICE_FORMAT.format(cents / 100)
}

// For amounts kept in dollars, such as a submitted price of 3.5.
export function formatDollars(dollars: number) {
  return formatCents(Math.round(dollars * 100))
}
