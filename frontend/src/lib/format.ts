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

// A product's pack, e.g. "956 ml" or "6 × 180 mL"; empty when the size isn't known.
export function packLabel(item: { packQty?: number | null; packUnit?: string | null; packCount?: number | null }) {
  if (item.packQty == null || !item.packUnit) return ""
  const size = `${item.packQty} ${item.packUnit}`
  return item.packCount && item.packCount > 1 ? `${item.packCount} × ${size}` : size
}

// Dates and times are shown in Singapore time, whatever the browser's time zone.
const DAY_FORMAT = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" })
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" })

function parseDate(value: string) {
  // A bare date such as "2026-11-05" is a Singapore calendar day, not UTC midnight.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value)
}

// "5 Nov 2026"
export function formatDay(value: string) {
  const date = parseDate(value)
  return Number.isNaN(date.getTime()) ? value : DAY_FORMAT.format(date)
}

// "5 Nov 2026, 11:41 pm"
export function formatTimestamp(value: string) {
  const date = parseDate(value)
  return Number.isNaN(date.getTime()) ? value : TIMESTAMP_FORMAT.format(date)
}
