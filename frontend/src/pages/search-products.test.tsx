import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"

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

function renderSearch(items: object[]) {
  const result = { items, total: items.length, catalogSize: items.length, facets: { categories: ["bread", "milk"], brands: [], dietary: [] } }
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({ ok: true, json: async () => result })))
  return render(<MemoryRouter><AuthProvider serviceOverride={anonymousAuth()}><SearchProductsPage /></AuthProvider></MemoryRouter>)
}

describe("search page", () => {
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
})
