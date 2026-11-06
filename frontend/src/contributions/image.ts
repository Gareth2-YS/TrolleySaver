import { validateImage } from "./schema"

/** The longest side, in pixels, of a photo once it's prepared for upload. */
export const MAX_IMAGE_DIMENSION = 2560
export const UNREADABLE_IMAGE = "This file isn't a readable JPG or PNG image"

export type PreparedImage = { file: File; error?: undefined } | { file?: undefined; error: string }

/**
 * A chosen photo as it will be uploaded: decoded and redrawn, so only its pixels survive.
 * - That drops its metadata, including the GPS location phones record. Product pictures are public.
 * - It proves the file really is an image.
 * - It scales photos larger than MAX_IMAGE_DIMENSION down, so uploads stay quick.
 *
 * Returns the prepared file (same name and type), or a message for the form. A browser that can't
 * decode images this way (no createImageBitmap) gets the original back.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const invalid = validateImage(file)
  if (invalid) return { error: invalid }
  if (typeof createImageBitmap !== "function") return { file }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    return { error: UNREADABLE_IMAGE }
  }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return { file }
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9))
  if (!blob) return { error: UNREADABLE_IMAGE }
  const prepared = new File([blob], file.name, { type: file.type, lastModified: Date.now() })
  const tooBig = validateImage(prepared)
  return tooBig ? { error: tooBig } : { file: prepared }
}
