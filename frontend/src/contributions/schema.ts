import { z } from "zod"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const contributionSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  storeId: z.string().min(1, "Choose a store"),
  price: z.coerce.number({ message: "Enter a valid price" }).positive("Price must be greater than $0").max(10000, "Price is too high"),
  observedDate: z.string().min(1, "Choose the observed date").refine((value) => value <= localDateString(), "Observed date cannot be in the future"),
})

export type ContributionValues = z.infer<typeof contributionSchema>
export type ContributionInput = z.input<typeof contributionSchema>

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) return "Choose a JPG or PNG image"
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller"
  return null
}
