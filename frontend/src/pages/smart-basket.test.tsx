import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"
import { compareBasket, type PriceTable } from "../basket/compare"
import type { BasketItem, BasketService, Product, Retailer } from "../basket/types"
import { SmartBasketPage } from "./smart-basket"
import riceIcon from "../../assets/product-icons/Rice.svg"

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
    expect(screen.getByText("Add groceries to see what you could save.")).toBeInTheDocument()
    expect(service.compare).not.toHaveBeenCalled()
  })

  it("shows the category icon for a basket product without a photo", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService(fullPrices))
    const list = await screen.findByRole("list", { name: "Basket items" })
    const icon = list.querySelector("img")!
    expect(icon).toHaveAttribute("src", riceIcon)
    expect(icon).toHaveAttribute("aria-hidden", "true")
    // An icon isn't a photo, so there's nothing to enlarge.
    expect(within(list).queryByRole("button", { name: /Enlarge image/ })).not.toBeInTheDocument()
  })

  it("says when every store charges the same", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService({ rice: { a: at(1880), b: at(1880), c: at(1880) } }))
    expect(await screen.findByText("Every store charges the same for this basket.")).toBeInTheDocument()
    expect(screen.queryByText("Save up to")).not.toBeInTheDocument()
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
    // The largest full-basket saving, and the two stores it is between.
    expect(screen.getByText("$2.00", { selector: "p" }).previousElementSibling).toHaveTextContent("Save up to")
    expect(screen.getByText("at Beta Grocer instead of Gamma Foods")).toBeInTheDocument()

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

  it("offers the healthier basket and swaps every item in it at once", async () => {
    const user = userEvent.setup()
    const all: Product[] = [
      ...products,
      { id: "white", name: "White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false },
      { id: "lowfat", name: "Low Fat Milk", brand: "Marigold", category: "milk", packQty: 1, packUnit: "L", hcs: true },
    ]
    const prices: PriceTable = { ...fullPrices, white: { a: at(260), b: at(250), c: at(270) }, bread: { a: at(330), b: at(320), c: at(340) }, lowfat: { a: at(380), b: at(350), c: at(410) } }
    // What the API sends: the healthier basket swaps white bread and fresh milk; rice has no Healthier Choice option.
    const swapTo: Record<string, string> = { white: "bread", milk: "lowfat" }
    const compare = vi.fn().mockImplementation(async (items: BasketItem[]) => {
      const basket = compareBasket(items, all, retailers, prices)
      const swapped = compareBasket(items.map((item) => ({ ...item, productId: swapTo[item.productId] ?? item.productId })), all, retailers, prices)
      const healthierBasket = {
        ...swapped,
        stores: swapped.stores.map((store) => ({ ...store, lines: store.lines.map((line) => {
          const from = items.find((item) => swapTo[item.productId] === line.productId)
          return from ? { ...line, replacesProductId: from.productId } : line
        }) })),
        swaps: items.map((item) => ({ originalProductId: item.productId, originalName: null, category: null, status: swapTo[item.productId] ? "swapped" as const : "no-hcs-option" as const })),
      }
      const extraCents = swapped.recommendation!.totalCents - basket.recommendation!.totalCents
      const healthierExtra = { basketTotalCents: basket.recommendation!.totalCents, healthierTotalCents: swapped.recommendation!.totalCents, extraCents, extraPercent: Math.round((extraCents / basket.recommendation!.totalCents) * 1000) / 10 }
      return { priceMaxAgeDays: 30, basket, healthierBasket, healthierExtra }
    })
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "white", quantity: 2 }, { productId: "milk", quantity: 1 }, { productId: "rice", quantity: 1 }]))
    renderBasket(basketService(prices, { listProducts: vi.fn().mockResolvedValue(all), compare }))

    // Basket at Beta: 2 × 2.50 + 3.60 + 18.60 = 27.20. Healthier at Beta: 2 × 3.20 + 3.50 + 18.60 = 28.50.
    const offer = await screen.findByRole("group", { name: "Healthier basket at Beta Grocer" })
    expect(offer).toHaveTextContent("Swaps in Wholemeal Bread, Low Fat Milk.")
    expect(offer).toHaveTextContent("$28.50")
    expect(offer).toHaveTextContent("$1.30 more (4.8%)")

    await user.click(within(offer).getByRole("button", { name: "Swap 2 items" }))
    expect(JSON.parse(localStorage.getItem("trolleysaver.basket.v1")!)).toEqual([{ productId: "bread", quantity: 2 }, { productId: "lowfat", quantity: 1 }, { productId: "rice", quantity: 1 }])
    expect(screen.getByText("Swapped from White Bread")).toBeInTheDocument()
    expect(screen.getByText("Swapped from Fresh Milk")).toBeInTheDocument()
    // Nothing left to swap, so the offer goes; each swap can still be undone on its own.
    await waitFor(() => expect(screen.queryByRole("group", { name: /Healthier basket/ })).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Undo swap back to White Bread" }))
    expect(screen.getByLabelText("White Bread quantity")).toHaveTextContent("2")
    expect(screen.getByLabelText("Low Fat Milk quantity")).toHaveTextContent("1")
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
    // Once the comparison has failed the page stops saying it is still comparing.
    expect(screen.getAllByText("No store prices yet").length).toBeGreaterThan(0)
    expect(screen.queryByText("Comparing store prices…")).not.toBeInTheDocument()
  })

  it("handles a basket that no store has a price for", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService({}))

    const alpha = await screen.findByRole("radio", { name: /Alpha Mart/ })
    expect(alpha).toHaveTextContent("0 priced · 1 missing")
    // Nothing is priced anywhere, so no store is "Cheapest" and there's no saving to show.
    for (const store of screen.getAllByRole("radio")) expect(within(store).queryByText("Cheapest")).not.toBeInTheDocument()
    expect(screen.getByText("Savings show once two stores price every item.")).toBeInTheDocument()
    expect(screen.getByText(/No single store has a price for every item yet/)).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Basket items" })).getByText("No price")).toBeInTheDocument()
  })

  it("moves between stores with the arrow keys", async () => {
    const user = userEvent.setup()
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService(fullPrices))

    // Ranked Beta (18.60), Alpha (18.80), Gamma (19.80).
    await user.click(await screen.findByRole("radio", { name: /Beta Grocer/ }))
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("radio", { name: /Alpha Mart/ })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: /Alpha Mart/ })).toHaveFocus()
    expect(screen.getByText("Total at Alpha Mart")).toBeInTheDocument()
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(screen.getByRole("radio", { name: /Beta Grocer/ })).toHaveAttribute("aria-checked", "true")
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByRole("radio", { name: /Gamma Foods/ })).toHaveAttribute("aria-checked", "true")
  })

  it("highlights each item's lowest store price", async () => {
    localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "rice", quantity: 1 }]))
    renderBasket(basketService(fullPrices))
    const perItem = await screen.findByRole("region", { name: "Price per item" })
    await within(perItem).findByText("$18.60")
    expect(within(perItem).getByText("$18.60").closest("div")).toHaveClass("border-primary")
    expect(within(perItem).getByText("$18.80").closest("div")).not.toHaveClass("border-primary")
    expect(within(perItem).getByText("$19.80").closest("div")).not.toHaveClass("border-primary")
  })

  describe("healthier options", () => {
    const breads: Product[] = [
      ...products,
      { id: "white", name: "White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false },
      { id: "big", name: "Big Wholemeal Loaf", brand: "Sunshine", category: "bread", packQty: 800, packUnit: "g", hcs: true },
      { id: "rolls", name: "Wholemeal Rolls", brand: "Sunshine", category: "bread", packQty: 6, packUnit: "pcs", hcs: true },
    ]

    function breadService(prices: PriceTable) {
      return basketService(prices, {
        listProducts: vi.fn().mockResolvedValue(breads),
        compare: vi.fn().mockImplementation(async (items: BasketItem[]) => ({ priceMaxAgeDays: 30, basket: compareBasket(items, breads, retailers, prices) })),
      })
    }

    async function openOptions(user: ReturnType<typeof userEvent.setup>, count: number) {
      await screen.findByRole("radio", { name: /Beta Grocer/ })
      await user.click(screen.getByRole("button", { name: `Healthier options (${count})` }))
      return screen.getByRole("dialog", { name: "Healthier choices" })
    }

    it("sorts by lowest price, or by price per 100 g with unconvertible units last", async () => {
      const user = userEvent.setup()
      localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "white", quantity: 1 }]))
      renderBasket(breadService({
        white: { a: at(260), b: at(250), c: at(270) },
        bread: { a: at(330), b: at(320), c: at(340) },  // 400 g: 80¢ / 100 g
        big: { a: at(500), b: at(500), c: at(520) },    // 800 g: 62.5¢ / 100 g
        rolls: { a: at(200), b: at(200), c: at(210) },  // pcs: no unit price
      }))
      const dialog = await openOptions(user, 3)
      const options = () => within(within(dialog).getByRole("list", { name: "Healthier Choice options" })).getAllByRole("listitem")
      await within(dialog).findByText("$2.00")

      // Lowest price first (at Beta, the selected store).
      expect(options().map((item) => item.textContent)).toEqual([
        expect.stringMatching(/^1Cheapest.*Wholemeal Rolls/), expect.stringMatching(/^2.*Wholemeal Bread/), expect.stringMatching(/^3.*Big Wholemeal Loaf/),
      ])
      await user.click(within(dialog).getByRole("button", { name: "Best unit price" }))
      expect(within(dialog).getByRole("button", { name: "Best unit price" })).toHaveAttribute("aria-pressed", "true")
      expect(options().map((item) => item.textContent)).toEqual([
        expect.stringMatching(/^1Best value.*Big Wholemeal Loaf/), expect.stringMatching(/^2.*Wholemeal Bread/), expect.stringMatching(/^3.*Wholemeal Rolls/),
      ])
    })

    it("can't swap to an option the selected store has no price for", async () => {
      const user = userEvent.setup()
      localStorage.setItem("trolleysaver.basket.v1", JSON.stringify([{ productId: "white", quantity: 1 }]))
      // Beta is cheapest for white bread, but only Alpha prices the wholemeal loaf.
      renderBasket(breadService({ white: { a: at(260), b: at(250), c: at(270) }, bread: { a: at(330) } }))
      let dialog = await openOptions(user, 3)
      const swap = () => within(dialog).getByRole("button", { name: "Swap White Bread for Wholemeal Bread" })
      await waitFor(() => expect(swap()).toBeDisabled())
      expect(within(dialog).getAllByText(/No price at Beta Grocer/).length).toBeGreaterThan(0)

      await user.click(within(dialog).getByRole("button", { name: "Close" }))
      await user.click(screen.getByRole("radio", { name: /Alpha Mart/ }))
      await user.click(screen.getByRole("button", { name: "Healthier options (3)" }))
      dialog = screen.getByRole("dialog", { name: "Healthier choices" })
      await waitFor(() => expect(swap()).toBeEnabled())
    })
  })

  it("enlarges a product picture and closes it again", async () => {
    const user = userEvent.setup()
    const withPicture = products.map((product) => (product.id === "milk" ? { ...product, imageUrl: "https://img.example/milk.png" } : product))
    renderBasket(basketService(fullPrices, { listProducts: vi.fn().mockResolvedValue(withPicture) }))

    // Only products with a picture can be enlarged.
    expect(screen.queryByRole("button", { name: "Enlarge image of Thai Rice" })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: "Enlarge image of Fresh Milk" }))
    const preview = screen.getByRole("dialog", { name: "Enlarged image of Fresh Milk" })
    expect(within(preview).getByRole("img", { name: "Fresh Milk" })).toHaveAttribute("src", "https://img.example/milk.png")

    await user.click(within(preview).getByRole("button", { name: "Close enlarged image of Fresh Milk" }))
    expect(preview).toHaveProperty("open", false)
    // Clicking the backdrop (the dialog itself, outside its content) closes it too.
    await user.click(screen.getByRole("button", { name: "Enlarge image of Fresh Milk" }))
    expect(preview).toHaveProperty("open", true)
    await user.click(preview)
    expect(preview).toHaveProperty("open", false)
  })
})
