import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SuggestionInput } from "./suggestion-input"

afterEach(cleanup)

const categories = [{ label: "Coffee", count: 2 }, { label: "Cookies", count: 1 }, { label: "Milk", count: 2 }, { label: "Soft Drinks", count: 2 }]

function Field({ onSubmit = vi.fn(), start = "" }: { onSubmit?: () => void; start?: string }) {
  const [value, setValue] = useState(start)
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
    <label htmlFor="category">Category</label>
    <SuggestionInput id="category" value={value} onChange={setValue} suggestions={categories} noun="category" listLabel="Categories" newHint="It’s added when the product is approved." maxLength={40} />
    <button type="submit">Send</button>
  </form>
}

const field = () => screen.getByRole("combobox", { name: "Category" })
const options = () => screen.queryAllByRole("option").map((option) => option.textContent)

describe("suggestion input", () => {
  it("lists every suggestion with its product count when the field is focused", async () => {
    const user = userEvent.setup()
    render(<Field />)
    expect(field()).toHaveAttribute("aria-expanded", "false")
    await user.click(field())
    expect(field()).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("listbox", { name: "Categories" })).toBeInTheDocument()
    expect(options()).toEqual(["Coffee2 products", "Cookies1 product", "Milk2 products", "Soft Drinks2 products"])
  })

  it("narrows the list as you type, with a New row on top for a value that isn't listed", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(field(), "co")
    expect(options()).toEqual(["New category: “co”It’s added when the product is approved.", "Coffee2 products", "Cookies1 product"])
    expect(screen.getByRole("option", { name: /Coffee/ }).querySelector("strong")).toHaveTextContent("Co")
  })

  it("drops the New row, and ticks the match, once what you typed is listed", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(field(), "milk")
    expect(screen.queryByRole("option", { name: /New category/ })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Milk/ })).toHaveAttribute("aria-selected", "true")
  })

  it("picks a suggestion with the arrow keys and Enter, without sending the form", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Field onSubmit={onSubmit} />)
    await user.type(field(), "co")
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(field()).toHaveAttribute("aria-activedescendant", "category-suggestion-1")
    await user.keyboard("{Enter}")
    expect(field()).toHaveValue("Coffee")
    expect(field()).toHaveAttribute("aria-expanded", "false")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("keeps a new value from the New row, with extra spaces removed", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(field(), "  oat   milk")
    await user.click(screen.getByRole("option", { name: /New category: “oat milk”/ }))
    expect(field()).toHaveValue("oat milk")
    expect(field()).toHaveFocus()
  })

  it("picks a suggestion by clicking it", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(field(), "soft")
    await user.click(screen.getByRole("option", { name: /Soft Drinks/ }))
    expect(field()).toHaveValue("Soft Drinks")
  })

  it("closes with Esc, keeping what was typed, and when focus leaves", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(field(), "tea")
    await user.keyboard("{Escape}")
    expect(field()).toHaveValue("tea")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    await user.keyboard("{ArrowDown}")
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("sends the form on Enter once the list is closed", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Field onSubmit={onSubmit} start="Milk" />)
    await user.click(field())
    await user.keyboard("{Enter}")
    expect(onSubmit).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
