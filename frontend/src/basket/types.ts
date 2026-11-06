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
  // On a healthier basket's line: the basket product this Healthier Choice product replaces.
  replacesProductId?: string
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

export interface HealthierSwap {
  originalProductId: string
  originalName: string | null
  category: string | null
  status: "swapped" | "already-hcs" | "no-hcs-option"
}

export interface HealthierExtra {
  basketTotalCents: number
  healthierTotalCents: number
  // How much more the healthier basket's best store costs than the basket's; negative when it's cheaper.
  extraCents: number
  extraPercent: number
}

export interface BasketResult {
  priceMaxAgeDays: number
  basket: BasketComparison
  // The same basket with each product swapped for a Healthier Choice one where possible. The API sends
  // both; the local demo mode leaves them out.
  healthierBasket?: (BasketComparison & { swaps: HealthierSwap[] }) | null
  healthierExtra?: HealthierExtra | null
}

export interface BasketService {
  readonly mode: "local" | "api"
  listProducts(): Promise<Product[]>
  compare(items: BasketItem[]): Promise<BasketResult>
}
