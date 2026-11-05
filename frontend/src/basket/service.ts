import { compareBasket } from "./compare"
import { localPrices, localProducts, localRetailers } from "./fixtures"
import type { BasketItem, BasketResult, BasketService, Product } from "./types"

const BASKET_KEY = "trolleysaver.basket.v1"
const LOCAL_PRICE_MAX_AGE_DAYS = 30

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class LocalBasketService implements BasketService {
  readonly mode = "local" as const

  async listProducts() {
    await pause(80)
    return localProducts
  }

  async compare(items: BasketItem[]): Promise<BasketResult> {
    await pause(150)
    return { priceMaxAgeDays: LOCAL_PRICE_MAX_AGE_DAYS, basket: compareBasket(items, localProducts, localRetailers, localPrices) }
  }
}

export class ApiBasketService implements BasketService {
  readonly mode = "api" as const

  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? "") {}

  private async request<T>(path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) throw new Error("The price comparison service is not configured. Set VITE_API_BASE_URL or switch to local mode.")
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new Error("Could not reach the price comparison service. Check your connection and retry.")
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message ?? "The price comparison request failed.")
    return data as T
  }

  async listProducts() { return (await this.request<{ items: Product[] }>("/products")).items }

  compare(items: BasketItem[]) { return this.request<BasketResult>("/basket/compare", { items }) }
}

const configuredMode = import.meta.env.VITE_SMART_BASKET_MODE ?? (import.meta.env.DEV ? "local" : "api")
export const basketMode = configuredMode

export function createBasketService(): BasketService {
  return configuredMode === "local" ? new LocalBasketService() : new ApiBasketService()
}

// The basket is public, so it lives in this browser rather than on the server. Each signed-in
// account keeps its own basket, apart from the signed-out one, so signing out never shows it.
function basketKey(userId: string | null) {
  return userId ? `${BASKET_KEY}.${userId}` : BASKET_KEY
}

export function loadBasket(userId: string | null = null): BasketItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(basketKey(userId)) ?? "[]")
    return Array.isArray(saved) ? saved.filter((item) => typeof item?.productId === "string" && Number.isInteger(item?.quantity) && item.quantity > 0) : []
  } catch {
    return []
  }
}

export function saveBasket(items: BasketItem[], userId: string | null = null) {
  try { localStorage.setItem(basketKey(userId), JSON.stringify(items)) } catch { /* storage unavailable: the basket lasts for this visit only */ }
}
