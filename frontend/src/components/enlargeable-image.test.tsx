import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EnlargeableImage } from "./enlargeable-image"

afterEach(cleanup)

describe("enlargeable image", () => {
  it("reports an expired link once, though the thumbnail and the enlarged copy both fail", () => {
    const onExpired = vi.fn()
    const { container } = render(<EnlargeableImage url="https://images.test/expired.png" name="Price evidence for Oat milk" onExpired={onExpired} />)
    for (const image of container.querySelectorAll("img")) fireEvent.error(image)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it("shows the fallback picture when the photo can't be loaded", () => {
    render(<EnlargeableImage url="https://images.test/broken.png" name="Price evidence for Oat milk" fallback="/icons/milk.svg" onExpired={() => undefined} />)
    fireEvent.error(screen.getByRole("img", { name: "Price evidence for Oat milk" }))
    const thumbnail = screen.getByRole("button", { name: "Enlarge image of Price evidence for Oat milk" }).querySelector("img")
    expect(thumbnail).toHaveAttribute("src", "/icons/milk.svg")
  })
})
