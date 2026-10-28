import { z } from "zod"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const
export const MAX_PRICE = 1000
export const MAX_OBSERVED_AGE_DAYS = 30

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
  price: z.coerce.number({ message: "Enter a valid price" }).positive("Price must be greater than $0").max(MAX_PRICE, "Price must be $1,000 or less"),
  observedDate: z.string().min(1, "Choose the observed date")
    .refine((value) => value <= singaporeDateString(), "Observed date cannot be in the future")
    .refine((value) => value >= earliestObservedDate(), "Observed date must be within the last 30 days"),
})

export type ContributionValues = z.infer<typeof contributionSchema>
export type ContributionInput = z.input<typeof contributionSchema>

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) return "Choose a JPG or PNG image"
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller"
  return null
}
