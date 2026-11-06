import { z } from "zod"
import { isWholeCents } from "../lib/format"
import { hasHiddenCharacters, hiddenCharactersMessage } from "../lib/text"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const
export const MAX_PRICE = 1000
export const MAX_OBSERVED_AGE_DAYS = 30
export const MAX_REASON_LENGTH = 500

export const packUnits = ["ml", "L", "g", "kg", "pcs", "rolls"] as const
const between = (label: string, low: number, high: number) => `${label} must be ${low}–${high} characters`
const wholeCents = (label: string) => `${label} must be a whole number of cents from 1 to 100000`
const visible = (label: string) => [(value: string) => !hasHiddenCharacters(value), hiddenCharactersMessage(label)] as const
export const productFieldsSchema = z.object({
  name: z.string().trim().min(2, between("Product name", 2, 120)).max(120, between("Product name", 2, 120)).refine(...visible("Product name")),
  brand: z.string().trim().min(1, between("Brand", 1, 60)).max(60, between("Brand", 1, 60)).refine(...visible("Brand")),
  category: z.string().trim().min(1, between("Category", 1, 40)).max(40, between("Category", 1, 40)).refine(...visible("Category")).transform((value) => value.toLowerCase()),
  packQty: z.coerce.number({ message: "Enter the pack quantity as a number" })
    .positive("Pack quantity must be more than 0 and at most 100000")
    .max(100000, "Pack quantity must be more than 0 and at most 100000"),
  packUnit: z.enum(packUnits, { message: "Choose a pack unit" }),
  packCount: z.coerce.number({ message: "Enter the units per pack as a number" })
    .int("Units per pack must be a whole number from 1 to 100")
    .min(1, "Units per pack must be a whole number from 1 to 100")
    .max(100, "Units per pack must be a whole number from 1 to 100"),
  hcs: z.boolean({ message: "Choose whether it has the Healthier Choice Symbol" }),
  dietary: z.array(z.string().trim().min(1, "Each dietary tag must be 1–30 characters").max(30, "Each dietary tag must be 1–30 characters").refine(...visible("Dietary tags")))
    .max(5, "Choose up to five dietary tags"),
})
export const productCorrectionsSchema = productFieldsSchema.extend({
  minCents: z.coerce.number({ message: "Enter the minimum cents as a number" }).int(wholeCents("Minimum cents")).min(1, wholeCents("Minimum cents")).max(100000, wholeCents("Minimum cents")),
  maxCents: z.coerce.number({ message: "Enter the maximum cents as a number" }).int(wholeCents("Maximum cents")).min(1, wholeCents("Maximum cents")).max(100000, wholeCents("Maximum cents")),
  searchTerms: z.array(z.string().trim().min(1, "Each search term must be 1–30 characters (check for a stray comma)").max(30, "Each search term must be 1–30 characters").refine(...visible("Search terms")))
    .max(10, "Use up to 10 search terms"),
}).refine((value) => value.minCents <= value.maxCents, { path: ["maxCents"], message: "Maximum cents must not be less than minimum cents" })

/** An admin's reason for rejecting something, as the server checks it, or null if it's fine. */
export function reasonError(reason: string) {
  if (!reason.trim()) return null
  if (reason.trim().length > MAX_REASON_LENGTH) return `Keep the reason under ${MAX_REASON_LENGTH} characters`
  return hasHiddenCharacters(reason, true) ? hiddenCharactersMessage("The reason") : null
}

/** A failed schema's messages, for one alert: each message once, in order. */
export function validationMessages(issues: readonly { message: string }[]) {
  return [...new Set(issues.map((issue) => issue.message))].join("; ")
}

export function singaporeDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

export function earliestObservedDate(date = new Date()) {
  return singaporeDateString(new Date(date.getTime() - MAX_OBSERVED_AGE_DAYS * 24 * 60 * 60 * 1000))
}

export const contributionSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  storeId: z.string().min(1, "Choose a store"),
  price: z.coerce.number({ message: "Enter a valid price" }).min(0.01, "Price must be greater than $0").max(MAX_PRICE, "Price must be $1,000 or less")
    // Whole cents only, so 3.635 isn't silently sent as 3.64.
    .refine(isWholeCents, "Enter the price in dollars and cents, e.g. 3.63"),
  observedDate: z.string().min(1, "Choose the observed date")
    .refine((value) => value <= singaporeDateString(), "Observed date cannot be in the future")
    .refine((value) => value >= earliestObservedDate(), "Observed date must be within the last 30 days"),
})

export type ContributionValues = z.infer<typeof contributionSchema>
export type ContributionInput = z.input<typeof contributionSchema>

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) return "Choose a JPG or PNG image"
  if (file.size === 0) return "Choose a non-empty image"
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller"
  return null
}
