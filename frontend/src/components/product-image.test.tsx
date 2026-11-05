import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { ProductImage } from "./product-image"
afterEach(cleanup)
it("refetches an expired product link once and falls back without an error loop", () => {
  const refresh = vi.fn()
  const { rerender } = render(<ProductImage url="https://image.test/old" fallback="category.svg" name="Milk" onExpired={refresh} />)
  fireEvent.error(screen.getByRole("img", { name: "Milk" }))
  expect(refresh).toHaveBeenCalledOnce()
  expect(screen.getByAltText("")).toHaveAttribute("src", "category.svg")
  rerender(<ProductImage url="https://image.test/new" fallback="category.svg" name="Milk" onExpired={refresh} />)
  fireEvent.error(screen.getByRole("img", { name: "Milk" }))
  expect(refresh).toHaveBeenCalledOnce()
})
