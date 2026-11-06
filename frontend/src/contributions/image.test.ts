import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_IMAGE_DIMENSION, prepareImage, UNREADABLE_IMAGE } from "./image"

// jsdom can't decode or draw images, so the browser's decoder and canvas are stubbed: the decoder
// reports a size, and the canvas "encodes" whatever was drawn as the bytes "redrawn".
function stubBrowser({ width = 1200, height = 900, encoded = "redrawn" } = {}) {
  const close = vi.fn()
  const decode = vi.fn().mockResolvedValue({ width, height, close })
  vi.stubGlobal("createImageBitmap", decode)
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback, type) {
    callback(new Blob([encoded], { type }))
  })
  return { decode, drawImage, toBlob, close }
}

// A JPEG whose bytes include EXIF with a GPS position, as phones write them.
const photo = () => new File(["\xff\xd8\xff\xe1Exif GPSLatitude 1.3521 GPSLongitude 103.8198"], "shelf.jpg", { type: "image/jpeg" })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("prepareImage", () => {
  it("uploads a redrawn copy, so the original file's metadata (e.g. its GPS location) is left behind", async () => {
    const { decode, drawImage, toBlob, close } = stubBrowser()
    const original = photo()
    const prepared = await prepareImage(original)
    expect(prepared.error).toBeUndefined()
    expect(prepared.file).not.toBe(original)
    expect(prepared.file).toMatchObject({ name: "shelf.jpg", type: "image/jpeg", size: "redrawn".length })
    expect(decode).toHaveBeenCalledWith(original, { imageOrientation: "from-image" })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 900)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9)
    expect(close).toHaveBeenCalled()
  })

  it("scales a large photo down to the longest-side limit, keeping its shape", async () => {
    const { drawImage } = stubBrowser({ width: 8000, height: 6000 })
    await prepareImage(photo())
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, MAX_IMAGE_DIMENSION, 1920)
  })

  it("keeps PNGs as PNGs", async () => {
    const { toBlob } = stubBrowser()
    const prepared = await prepareImage(new File(["\x89PNG"], "pack.png", { type: "image/png" }))
    expect(prepared.file?.type).toBe("image/png")
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", 0.9)
  })

  it("refuses a file the browser can't decode as an image, whatever its name says", async () => {
    stubBrowser()
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new DOMException("The source image could not be decoded.")))
    expect(await prepareImage(new File(["<html>"], "shelf.png", { type: "image/png" }))).toEqual({ error: UNREADABLE_IMAGE })
  })

  it("checks the type before decoding, and the size after redrawing", async () => {
    const { decode } = stubBrowser({ encoded: "x".repeat(5 * 1024 * 1024 + 1) })
    expect(await prepareImage(new File(["GIF89a"], "a.gif", { type: "image/gif" }))).toEqual({ error: "Choose a JPG or PNG image" })
    expect(decode).not.toHaveBeenCalled()
    expect(await prepareImage(photo())).toEqual({ error: "Image must be 5 MB or smaller" })
  })

  it("uses the original file in a browser that can't decode images this way", async () => {
    vi.stubGlobal("createImageBitmap", undefined)
    const original = photo()
    expect(await prepareImage(original)).toEqual({ file: original })
  })
})
