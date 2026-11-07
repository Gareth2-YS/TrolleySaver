import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"
import breadIcon from "../../assets/product-icons/Bread.svg"

// The page reads the API address when it loads, so set it before the import below runs.
vi.hoisted(() => { vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test") })
const { SearchProductsPage } = await import("./search-products")

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const milk = {
  id: "milk", name: "Fresh Milk", brand: "Meiji", category: "milk", packQty: 1, packUnit: "L", hcs: false,
  prices: { fairprice: { priceCents: 363, priceDate: "2026-11-03", submissionCount: 2 } },
  lowestPrice: { retailerId: "fairprice", retailerName: "FairPrice", priceCents: 363, priceDate: "2026-11-03" },
  priceUpdatedAt: "2026-11-03T16:05:01.230Z",
}
// Never priced: search leaves priceUpdatedAt out
const bread = { id: "bread", name: "Wholemeal Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: true, prices: {}, lowestPrice: null }

function anonymousAuth(): AuthService {
  return {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    getAccessToken: vi.fn().mockResolvedValue(null),
  }
}

const catalogRetailers = [{ id: "coldstorage", name: "Cold Storage" }, { id: "fairprice", name: "FairPrice" }, { id: "shengsiong", name: "Sheng Siong" }]

function renderSearch(items: object[], retailers: object[] = catalogRetailers) {
  const result = { items, total: items.length, catalogSize: items.length, facets: { categories: ["bread", "milk"], brands: [], dietary: [] } }
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith("/retailers") ? { items: retailers } : result),
  })))
  return render(<MemoryRouter><AuthProvider serviceOverride={anonymousAuth()}><SearchProductsPage /></AuthProvider></MemoryRouter>)
}

describe("search page", () => {
  it("limits the search box to what the backend accepts", async () => {
    renderSearch([milk])
    expect(await screen.findByRole("searchbox", { name: "Search products or brands" })).toHaveAttribute("maxLength", "100")
  })

  it("shows when each product's prices were last updated, in Singapore time", async () => {
    const user = userEvent.setup()
    renderSearch([bread, milk])
    const milkCard = (await screen.findByRole("button", { name: "View details for Fresh Milk" })).closest("article")!
    expect(within(milkCard).getByText(/^Prices updated 4 Nov, 12:05\sam$/)).toBeInTheDocument()
    const breadCard = screen.getByRole("button", { name: "View details for Wholemeal Bread" }).closest("article")!
    expect(within(breadCard).getByText("No current price available")).toBeInTheDocument()
    expect(within(breadCard).queryByText(/Prices updated/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "View details for Fresh Milk" }))
    expect(within(screen.getByRole("dialog", { name: "Fresh Milk" })).getByText(/^Prices updated 4 Nov, 12:05\sam$/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Close product details" }))
    await user.click(screen.getByRole("button", { name: "View details for Wholemeal Bread" }))
    expect(within(screen.getByRole("dialog", { name: "Wholemeal Bread" })).getByText("No prices yet")).toBeInTheDocument()
  })

  it("enlarges a product's picture from its card and from its details", async () => {
    const user = userEvent.setup()
    renderSearch([{ ...milk, imageUrl: "https://img.example/milk.png" }])
    const card = (await screen.findByRole("button", { name: "View details for Fresh Milk" })).closest("article")!

    await user.click(within(card).getByRole("button", { name: "Enlarge image of Fresh Milk" }))
    const preview = screen.getByRole("dialog", { name: "Enlarged image of Fresh Milk" })
    expect(preview).toHaveProperty("open", true)
    expect(within(preview).getByRole("img", { name: "Fresh Milk" })).toHaveAttribute("src", "https://img.example/milk.png")
    await user.click(within(preview).getByRole("button", { name: "Close enlarged image of Fresh Milk" }))
    expect(preview).toHaveProperty("open", false)

    await user.click(within(card).getByRole("button", { name: "View details for Fresh Milk" }))
    const details = screen.getByRole("dialog", { name: "Fresh Milk" })
    await user.click(within(details).getByRole("button", { name: "Enlarge image of Fresh Milk" }))
    expect(preview).toHaveProperty("open", true)
    // Clicking the backdrop closes it.
    await user.click(preview)
    expect(preview).toHaveProperty("open", false)
  })

  it("shows the category icon for a product without a picture, enlarged too", async () => {
    const user = userEvent.setup()
    renderSearch([bread])
    const card = (await screen.findByRole("button", { name: "View details for Wholemeal Bread" })).closest("article")!
    const icon = within(card).getByRole("button", { name: "Enlarge image of Wholemeal Bread" }).querySelector("img")!
    expect(icon).toHaveAttribute("src", breadIcon)
    expect(icon).toHaveAttribute("aria-hidden", "true")

    await user.click(within(card).getByRole("button", { name: "Enlarge image of Wholemeal Bread" }))
    const preview = screen.getByRole("dialog", { name: "Enlarged image of Wholemeal Bread" })
    expect(preview.querySelector("img")).toHaveAttribute("src", breadIcon)
  })

  it("names every store from the catalog in the details, priced or not", async () => {
    const user = userEvent.setup()
    // A store the frontend has never heard of, with a price.
    renderSearch([{ ...milk, prices: { ...milk.prices, newmart: { priceCents: 1250, priceDate: "2026-11-03", submissionCount: 1 } } }],
      [...catalogRetailers, { id: "newmart", name: "New Mart" }])
    await user.click(await screen.findByRole("button", { name: "View details for Fresh Milk" }))
    const details = screen.getByRole("dialog", { name: "Fresh Milk" })

    const rows = within(details).getByText("Cold Storage").closest("div")!.parentElement!
    expect([...rows.children].map((row) => row.firstElementChild?.textContent)).toEqual(["Cold Storage", "FairPrice", "Sheng Siong", "New Mart"])
    expect(within(details).getByText("$3.63")).toBeInTheDocument()
    expect(within(details).getByText("$12.50")).toBeInTheDocument()
    expect(within(details).getAllByText("No current price")).toHaveLength(2)
  })

  it("still shows priced stores when the store list can't be loaded", async () => {
    const user = userEvent.setup()
    renderSearch([milk], [])
    const card = (await screen.findByRole("button", { name: "View details for Fresh Milk" })).closest("article")!
    expect(within(card).getByText("$3.63")).toBeInTheDocument()
    await user.click(within(card).getByRole("button", { name: "View details for Fresh Milk" }))
    expect(within(screen.getByRole("dialog", { name: "Fresh Milk" })).getByText("Fairprice")).toBeInTheDocument()
  })

  it("filters to Healthier Choice with a switch, and has no quick filter chips", async () => {
    const user = userEvent.setup()
    renderSearch([bread, milk])
    const toggle = await screen.findByRole("switch", { name: "Healthier Choice only" })
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByLabelText("Quick filters")).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "true")
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("hcs=true"))).toBe(true))
    // The switch shows its own state, so it isn't counted on the Filters button.
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }))
    expect(toggle).toHaveAttribute("aria-checked", "false")
  })

  it("keeps the price range in dollars and cents", async () => {
    const user = userEvent.setup()
    renderSearch([milk])
    await user.click(await screen.findByRole("button", { name: "Filters" }))
    await user.type(screen.getByLabelText("From"), "3.639")
    expect(screen.getByLabelText("From")).toHaveValue(3.63)
  })

  it("shows the Healthier Choice pill first among the card's labels, not above the name", async () => {
    renderSearch([{ ...bread, name: "Gardenia Wholemeal Bread With Extra Grains And Seeds, Family Size" }])
    const card = (await screen.findByRole("button", { name: /View details for Gardenia Wholemeal/ })).closest("article")!
    // The card opens with the picture and name, so it lines up with the cards beside it.
    expect(card.firstElementChild).not.toHaveTextContent("Healthier Choice")
    const labels = within(card).getByLabelText("Labels")
    expect(labels.firstElementChild).toHaveTextContent("Healthier Choice")
  })
})
