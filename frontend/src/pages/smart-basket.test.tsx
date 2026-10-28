import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
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
    expect(screen.getByText("Add items to calculate your savings")).toBeInTheDocument()
    expect(service.compare).not.toHaveBeenCalled()
  })

  it("compares the basket and shows the saving against each other supermarket", async () => {
    const user = userEvent.setup()
    renderBasket(basketService(fullPrices))
    await user.click(await screen.findByRole("button", { name: "Add Thai Rice" }))
    await user.click(screen.getByRole("button", { name: "Add Fresh Milk" }))
    await user.click(screen.getByRole("button", { name: "Increase Fresh Milk" }))

    expect(screen.getByLabelText("Fresh Milk quantity")).toHaveTextContent("2")
    // Beta: 18.60 + 2 × 3.60 = 25.80; Alpha: 26.20; Gamma: 27.80
    expect(await screen.findByText("Save $0.40")).toBeInTheDocument()
    expect(screen.getByText("Save $2.00")).toBeInTheDocument()
    expect(screen.getByText("Best single store").closest("article")).toHaveTextContent("Beta Grocer$25.80")
    expect(within(screen.getByRole("button", { name: /Beta Grocer/ })).getByText("Cheapest")).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1")!)).toEqual([{ productId: "rice", quantity: 1 }, { productId: "milk", quantity: 2 }])
  })

  it("flags missing prices and labels partial savings", async () => {
    const user = userEvent.setup()
    const basket = [{ productId: "rice", quantity: 1 }, { productId: "bread", quantity: 1 }, { productId: "milk", quantity: 1 }]
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify(basket))
    // Alpha prices rice and bread, Beta rice and milk, Gamma only rice: no store has everything.
    renderBasket(basketService({ rice: { a: at(1880), b: at(1860), c: at(1900) }, bread: { a: at(330) }, milk: { b: at(360) } }))

    expect(await screen.findByText(/No single store has a price for every item yet/)).toBeInTheDocument()
    expect(screen.getAllByText("Partial")).toHaveLength(2)
    expect(screen.getAllByText("Compared on the 1 item both stores price.")).toHaveLength(2)
    // On rice, the only item they share, Alpha costs $0.20 more than Beta and $0.20 less than Gamma.
    expect(screen.getByText("$0.20 more")).toBeInTheDocument()
    expect(screen.getByText("Save $0.20")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Gamma Foods/ }))
    expect(screen.getByRole("heading", { name: "Shopping list · Gamma Foods" })).toBeInTheDocument()
    expect(screen.getAllByText("No price found, working on it")).toHaveLength(2)
    expect(screen.getByText("Total for priced items")).toBeInTheDocument()
  })

  it("shows an error when the comparison fails", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService(fullPrices, { compare: vi.fn().mockRejectedValue(new Error("Could not reach the price comparison service.")) }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the price comparison service."))
  })
})
