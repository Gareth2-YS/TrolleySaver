import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"
import { compareBasket, type PriceTable } from "../basket/compare"
import type { BasketItem, BasketService, Product, Retailer } from "../basket/types"
import { SmartBasketPage } from "./smart-basket"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const products: Product[] = [
  { id: "rice", name: "Thai Rice", brand: "Songhe", category: "rice", packQty: 5, packUnit: "kg", hcs: false },
  { id: "milk", name: "Fresh Milk", brand: "Meiji", category: "milk", packQty: 1, packUnit: "L", hcs: false },
  { id: "bread", name: "Wholemeal Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: true },
]
const retailers: Retailer[] = [{ id: "a", name: "Alpha Mart" }, { id: "b", name: "Beta Grocer" }, { id: "c", name: "Gamma Foods" }]
const at = (priceCents: number) => ({ priceCents, observedAt: "2026-10-24T08:00:00.000Z" })
const fullPrices: PriceTable = {
  rice: { a: at(1880), b: at(1860), c: at(1980) },
  milk: { a: at(370), b: at(360), c: at(400) },
}

const shopper = { id: "u1", email: "alex@example.com", name: "Alex Tan", role: "user" as const, groups: ["user"] }

function anonymousAuth(): AuthService {
  return {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    getAccessToken: vi.fn().mockResolvedValue(null),
  }
}

function basketService(prices: PriceTable, overrides: Partial<BasketService> = {}): BasketService {
  return {
    mode: "local",
    listProducts: vi.fn().mockResolvedValue(products),
    compare: vi.fn().mockImplementation(async (items: BasketItem[]) => ({ priceMaxAgeDays: 30, basket: compareBasket(items, products, retailers, prices) })),
    ...overrides,
  }
}

function renderBasket(service: BasketService) {
  return render(<MemoryRouter initialEntries={["/basket"]}><AuthProvider serviceOverride={anonymousAuth()}><SmartBasketPage serviceOverride={service} /></AuthProvider></MemoryRouter>)
}

describe("smart basket page", () => {
  it("shows the empty basket without calling the comparison", async () => {
    const service = basketService(fullPrices)
    renderBasket(service)
    expect(await screen.findByRole("heading", { name: "Your basket is empty" })).toBeInTheDocument()
    expect(screen.getByText("Add items to compare prices at each store.")).toBeInTheDocument()
    expect(service.compare).not.toHaveBeenCalled()
  })

  it("compares the basket at each retailer and switches the total to the chosen one", async () => {
    const user = userEvent.setup()
    renderBasket(basketService(fullPrices))
    await user.click(await screen.findByRole("button", { name: "Add Thai Rice" }))
    await user.click(screen.getByRole("button", { name: "Add Fresh Milk" }))
    await user.click(screen.getByRole("button", { name: "Increase Fresh Milk" }))

    expect(screen.getByLabelText("Fresh Milk quantity")).toHaveTextContent("2")
    // Beta: 18.60 + 2 × 3.60 = 25.80; Alpha: 26.20; Gamma: 27.80
    const beta = await screen.findByRole("radio", { name: /Beta Grocer/ })
    expect(beta).toHaveAttribute("aria-checked", "true")
    expect(within(beta).getByText("Cheapest")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Alpha Mart/ })).toHaveTextContent("+$0.40 more")
    expect(screen.getByRole("radio", { name: /Gamma Foods/ })).toHaveTextContent("+$2.00 more")
    expect(screen.getByText("Total at Beta Grocer · cheapest")).toBeInTheDocument()
    expect(screen.getByText("$2.00", { selector: "p" })).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: /Gamma Foods/ }))
    expect(screen.getByText("Total at Gamma Foods")).toBeInTheDocument()
    expect(screen.getByText("$27.80", { selector: "p" })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1")!)).toEqual([{ productId: "rice", quantity: 1 }, { productId: "milk", quantity: 2 }])
  })

  it("flags missing prices at each store", async () => {
    const user = userEvent.setup()
    const basket = [{ productId: "rice", quantity: 1 }, { productId: "bread", quantity: 1 }, { productId: "milk", quantity: 1 }]
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify(basket))
    // Alpha prices rice and bread, Beta rice and milk, Gamma only rice: no store has everything.
    renderBasket(basketService({ rice: { a: at(1880), b: at(1860), c: at(1900) }, bread: { a: at(330) }, milk: { b: at(360) } }))

    expect(await screen.findByText(/No single store has a price for every item yet/)).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Gamma Foods/ })).toHaveTextContent("1 priced · 2 missing")

    await user.click(screen.getByRole("radio", { name: /Gamma Foods/ }))
    expect(screen.getByText("1 priced · 2 missing at Gamma Foods")).toBeInTheDocument()
    expect(screen.getByText("Total for priced items at Gamma Foods")).toBeInTheDocument()
    // Price per item: bread and milk are each missing at two of the three stores.
    expect(within(screen.getByRole("region", { name: "Price per item" })).getAllByText("No price")).toHaveLength(4)
  })

  it("swaps a product for a Healthier Choice one in its category", async () => {
    const user = userEvent.setup()
    const withWhiteBread: Product[] = [...products, { id: "white", name: "White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false }]
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "white", quantity: 2 }]))
    const prices: PriceTable = { ...fullPrices, white: { a: at(260), b: at(250), c: at(270) }, bread: { a: at(330), b: at(320), c: at(340) } }
    const service = basketService(prices, { listProducts: vi.fn().mockResolvedValue(withWhiteBread) })
    service.compare = vi.fn().mockImplementation(async (items: BasketItem[]) => ({ priceMaxAgeDays: 30, basket: compareBasket(items, withWhiteBread, retailers, prices) }))
    renderBasket(service)

    expect(await screen.findByText(/1 item has a Healthier Choice alternative/)).toBeInTheDocument()
    await screen.findByRole("radio", { name: /Beta Grocer/ })
    await user.click(screen.getByRole("button", { name: "Healthier options (1)" }))

    // Options are priced at the selected store (Beta, the cheapest) against the line being swapped.
    const dialog = screen.getByRole("dialog", { name: "Healthier choices" })
    expect(await within(dialog).findByText("$3.20")).toBeInTheDocument()
    expect(within(dialog).getByText("+$0.70")).toBeInTheDocument()
    expect(within(dialog).getByText(/\$0\.80 \/ 100g/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Swap White Bread for Wholemeal Bread" }))

    expect(screen.getByLabelText("Wholemeal Bread quantity")).toHaveTextContent("2")
    expect(screen.getByText("1 of 1 item is Healthier Choice.")).toBeInTheDocument()
    expect(screen.getByText("Swapped from White Bread")).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1")!)).toEqual([{ productId: "bread", quantity: 2 }])

    const toast = screen.getByRole("status")
    expect(toast).toHaveTextContent("Swapped to Wholemeal Bread")
    await user.click(within(toast).getByRole("button", { name: "Undo" }))
    expect(screen.getByLabelText("White Bread quantity")).toHaveTextContent("2")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("undoes a capped merge back to the basket as it was", async () => {
    const user = userEvent.setup()
    const withWhiteBread: Product[] = [...products, { id: "white", name: "White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false }]
    const prices: PriceTable = { ...fullPrices, white: { a: at(260), b: at(250), c: at(270) }, bread: { a: at(330), b: at(320), c: at(340) } }
    const service = basketService(prices, { listProducts: vi.fn().mockResolvedValue(withWhiteBread) })
    service.compare = vi.fn().mockImplementation(async (items: BasketItem[]) => ({ priceMaxAgeDays: 30, basket: compareBasket(items, withWhiteBread, retailers, prices) }))
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "white", quantity: 20 }, { productId: "bread", quantity: 90 }]))
    renderBasket(service)

    await screen.findByRole("radio", { name: /Beta Grocer/ })
    await user.click(screen.getByRole("button", { name: "Healthier options (1)" }))
    const dialog = screen.getByRole("dialog", { name: "Healthier choices" })
    await within(dialog).findByText("$3.20")
    await user.click(within(dialog).getByRole("button", { name: "Swap White Bread for Wholemeal Bread" }))
    // 90 + 20 is capped at 99.
    expect(screen.getByLabelText("Wholemeal Bread quantity")).toHaveTextContent("99")

    await user.click(within(screen.getByRole("status")).getByRole("button", { name: "Undo" }))
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1")!)).toEqual([{ productId: "white", quantity: 20 }, { productId: "bread", quantity: 90 }])
  })

  it("keeps a signed-in shopper's basket apart from the signed-out one", async () => {
    const user = userEvent.setup()
    const auth: AuthService = {
      ...anonymousAuth(),
      getCurrentUser: vi.fn().mockResolvedValue(shopper),
    }
    render(<MemoryRouter initialEntries={["/basket"]}><AuthProvider serviceOverride={auth}><SmartBasketPage serviceOverride={basketService(fullPrices)} /></AuthProvider></MemoryRouter>)

    expect(await screen.findByText("Alex Tan")).toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: "Add Thai Rice" }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1.u1")!)).toEqual([{ productId: "rice", quantity: 1 }]))

    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("heading", { name: "Your basket is empty" })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1") ?? "[]")).toEqual([])
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1.u1")!)).toEqual([{ productId: "rice", quantity: 1 }])
  })

  it("prices the signed-out basket after signing out, even when it matches the signed-in one", async () => {
    const user = userEvent.setup()
    const auth: AuthService = { ...anonymousAuth(), getCurrentUser: vi.fn().mockResolvedValue(shopper) }
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    localStorage.setItem("trolleysaver.basket.v1.u1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    render(<MemoryRouter initialEntries={["/basket"]}><AuthProvider serviceOverride={auth}><SmartBasketPage serviceOverride={basketService(fullPrices)} /></AuthProvider></MemoryRouter>)

    expect(await screen.findByRole("radio", { name: /Beta Grocer/ })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("radio", { name: /Beta Grocer/ })).toBeInTheDocument()
    expect(screen.getByText("Total at Beta Grocer · cheapest")).toBeInTheDocument()
  })

  it("keeps items added while the session is still being restored", async () => {
    const user = userEvent.setup()
    let finishRestore: (value: typeof shopper) => void = () => {}
    const auth: AuthService = { ...anonymousAuth(), getCurrentUser: vi.fn(() => new Promise<typeof shopper>((resolve) => { finishRestore = resolve })) }
    localStorage.setItem("trolleysaver.basket.v1.u1", JSON.stringify([{ productId: "milk", quantity: 1 }]))
    render(<MemoryRouter initialEntries={["/basket"]}><AuthProvider serviceOverride={auth}><SmartBasketPage serviceOverride={basketService(fullPrices)} /></AuthProvider></MemoryRouter>)

    await user.click(await screen.findByRole("button", { name: "Add Thai Rice" }))
    await act(async () => finishRestore(shopper))
    await waitFor(() => expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1.u1")!)).toEqual([{ productId: "milk", quantity: 1 }, { productId: "rice", quantity: 1 }]))
  })

  it("stops offering undo once a merged line is edited", async () => {
    const user = userEvent.setup()
    const withWhiteBread: Product[] = [...products, { id: "white", name: "White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false }]
    const prices: PriceTable = { ...fullPrices, white: { a: at(260), b: at(250), c: at(270) }, bread: { a: at(330), b: at(320), c: at(340) } }
    const service = basketService(prices, { listProducts: vi.fn().mockResolvedValue(withWhiteBread) })
    service.compare = vi.fn().mockImplementation(async (items: BasketItem[]) => ({ priceMaxAgeDays: 30, basket: compareBasket(items, withWhiteBread, retailers, prices) }))
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "bread", quantity: 1 }, { productId: "white", quantity: 5 }]))
    renderBasket(service)

    await screen.findByRole("radio", { name: /Beta Grocer/ })
    await user.click(screen.getByRole("button", { name: "Healthier options (1)" }))
    const dialog = screen.getByRole("dialog", { name: "Healthier choices" })
    await within(dialog).findByText("$3.20")
    await user.click(within(dialog).getByRole("button", { name: "Swap White Bread for Wholemeal Bread" }))
    expect(within(screen.getByRole("status")).getByRole("button", { name: "Undo" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Decrease Wholemeal Bread" }))
    expect(within(screen.getByRole("status")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument()
    expect(screen.queryByText("Swapped from White Bread")).not.toBeInTheDocument()
  })

  it("shows an error when the comparison fails", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService(fullPrices, { compare: vi.fn().mockRejectedValue(new Error("Could not reach the price comparison service.")) }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the price comparison service."))
  })
})
