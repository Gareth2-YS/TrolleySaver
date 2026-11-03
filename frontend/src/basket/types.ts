// Shapes follow the backend contract for GET /products, GET /retailers and POST /basket/compare.

export interface Product {
  imageUrl?: string
  id: string
  name: string
  brand: string
  category: string
  packQty: number
  packUnit: string
  packCount?: number
  hcs: boolean
}

export interface Retailer {
  id: string
  name: string
}

export interface BasketItem {
  productId: string
  quantity: number
}

export interface BasketLine {
  productId: string
  productName: string | null
  brand: string | null
  packQty: number | null
  packUnit: string | null
  packCount: number
  hcs: boolean
  category: string | null
  quantity: number
  unitPriceCents: number
  subtotalCents: number
  observedAt: string
}

export interface BasketStore {
  retailerId: string
  retailerName: string | null
  rank: number
  complete: boolean
  pricedCount: number
  missingCount: number
  coveragePercent: number | null
  totalCents: number
  lines: BasketLine[]
  unpriced: { productId: string; productName: string | null; category: string | null }[]
}

export interface BasketSaving {
  retailerId: string
  retailerName: string | null
  basis: "full-basket" | "common-items"
  comparedLines: number
  otherTotalCents: number | null
  recommendedTotalCents: number | null
  savingsCents: number | null
  savingsPercent: number | null
}

export interface BasketComparison {
  stores: BasketStore[]
  recommendation: { retailerId: string; retailerName: string | null; totalCents: number; complete: boolean } | null
  savings: BasketSaving[]
  maxSavingsCents: number | null
}

export interface BasketResult {
  priceMaxAgeDays: number
  basket: BasketComparison
}

export interface BasketService {
  readonly mode: "local" | "api"
  listProducts(): Promise<Product[]>
  compare(items: BasketItem[]): Promise<BasketResult>
}
