import { ProductImage } from "../components/product-image"
import { Filter, LoaderCircle, Plus, RotateCcw, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { useBasketItems } from "../basket/use-basket-items"
import { getCategoryIcon } from "../lib/category-icons"
import { facetOptions, isStale } from "../lib/facets"
import { formatCents, formatDollars, isWholeCents, limitToCents } from "../lib/format"
import { cn } from "../lib/utils"
import { HcsBadge } from "../components/hcs-badge"
import { PageHeader } from "../components/layout/page-header"
import { FacetSelect } from "../components/facet-select"
import { usePageTitle } from "../lib/use-page-title"

interface StorePrice {
  priceCents: number
  priceDate: string
  submissionCount: number
}

interface SearchProduct {
  imageUrl?: string
  id: string
  name: string
  brand?: string
  category?: string
  packQty?: number
  packUnit?: string
  packCount?: number
  hcs?: boolean
  dietary?: string[]
  searchTerms?: string[]
  prices: Record<string, StorePrice>
  lowestPrice: { retailerId: string; retailerName: string | null; priceCents: number; priceDate: string } | null
  // When the nightly price job last changed any of its store prices (UTC); missing if never priced
  priceUpdatedAt?: string | null
}

interface SearchResult {
  items: SearchProduct[]
  total: number
  catalogSize: number
  facets: { categories: string[]; brands: string[]; dietary: string[] }
  // For each filter, how many products each option gives with the other filters kept
  facetCounts?: { categories: Record<string, number>; brands: Record<string, number>; dietary: Record<string, number> }
}

interface SearchCriteria {
  q: string
  category: string | null
  brand: string
  dietary: string
  hcsOnly: boolean
  minimumPrice: string
  maximumPrice: string
}

interface AppliedFilter {
  name: string
  label: string
  // Fits nothing alongside the other filters
  stale: boolean
  clear: () => void
}

interface Retailer {
  id: string
  name: string
}


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "")

function toCents(dollars: string) {
  return String(Math.round(Number(dollars) * 100))
}

async function fetchSearch(criteria: SearchCriteria, signal: AbortSignal): Promise<SearchResult> {
  if (!API_BASE_URL) {
    throw new Error("Set VITE_API_BASE_URL in frontend/.env.local to load the AWS catalog.")
  }

  const params = new URLSearchParams()
  if (criteria.q.trim()) params.set("q", criteria.q.trim())
  if (criteria.category) params.set("category", criteria.category)
  if (criteria.brand) params.set("brand", criteria.brand)
  if (criteria.dietary) params.set("dietary", criteria.dietary)
  if (criteria.hcsOnly) params.set("hcs", "true")
  if (criteria.minimumPrice !== "") params.set("minPriceCents", toCents(criteria.minimumPrice))
  if (criteria.maximumPrice !== "") params.set("maxPriceCents", toCents(criteria.maximumPrice))

  const response = await fetch(`${API_BASE_URL}/products/search?${params}`, { signal })
  if (!response.ok) throw new Error(`Could not search products (HTTP ${response.status}).`)

  const data = (await response.json()) as SearchResult
  if (!Array.isArray(data.items)) throw new Error("The search response did not contain a product list.")
  return data
}

// Store names come from the catalog, so a new or renamed store needs no frontend change.
async function fetchRetailers(signal: AbortSignal): Promise<Retailer[]> {
  if (!API_BASE_URL) return []
  const response = await fetch(`${API_BASE_URL}/retailers`, { signal })
  if (!response.ok) throw new Error(`Could not load stores (HTTP ${response.status}).`)
  const data = (await response.json()) as { items?: Retailer[] }
  return Array.isArray(data.items) ? data.items : []
}

function formatLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const PRICE_UPDATED_FORMAT = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Shown in Singapore time whatever the browser's time zone, e.g. "Prices updated 4 Nov, 12:05 am"
function getPriceUpdatedLabel(value?: string | null) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? `Prices updated ${PRICE_UPDATED_FORMAT.format(date)}` : null
}

function getPackDescription(product: SearchProduct) {
  const unitSize = [product.packQty, product.packUnit].filter((value) => value !== undefined).join(" ")
  if (!unitSize) return null
  return product.packCount && product.packCount > 1 ? `${product.packCount} × ${unitSize}` : unitSize
}

function ProductCard({
  product,
  basketQuantity,
  onAdd,
  onImageExpired,
  retailers,
}: {
  product: SearchProduct
  basketQuantity: number
  onImageExpired: () => void
  onAdd: (productId: string) => void
  retailers: Retailer[]
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const imagePreviewRef = useRef<HTMLDialogElement>(null)
  const packDescription = getPackDescription(product)
  const lowestPrice = product.lowestPrice
  const priceUpdated = getPriceUpdatedLabel(product.priceUpdatedAt)
  const categoryIcon = getCategoryIcon(product.category)
  // Every store in the catalog gets a row, priced or not, plus any priced store the list doesn't know yet.
  const retailerNames = new Map(retailers.map((retailer) => [retailer.id, retailer.name]))
  const retailerIds = [
    ...retailers.map((retailer) => retailer.id),
    ...Object.keys(product.prices ?? {}).filter((id) => !retailerNames.has(id)),
  ]
  const retailerName = (id: string) => retailerNames.get(id) ?? formatLabel(id)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (detailsOpen && !dialog.open) dialog.showModal()
    if (!detailsOpen && dialog.open) dialog.close()
  }, [detailsOpen])

  function openDetails() {
    setDetailsOpen(true)
  }

  function openImagePreview() {
    imagePreviewRef.current?.showModal()
  }

  return (
    <>
      <article
        className="surface-card flex h-full flex-col p-5 text-left transition-colors hover:border-primary/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Enlarge image of ${product.name}`}
              title="Click to enlarge image"
              onClick={openImagePreview}
            >
              <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onImageExpired} className="product-tile size-14" />
            </button>
            <div className="min-w-0">
              <button
                type="button"
                className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-haspopup="dialog"
                aria-label={`View details for ${product.name}`}
                onClick={openDetails}
              >
                <span className="block font-display text-[17px] font-extrabold leading-snug">{product.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {[product.brand, packDescription].filter(Boolean).join(" · ") || "Product details unavailable"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t pt-3">
          {lowestPrice ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[13px] text-muted-foreground">Lowest</span>
              <span className="font-display text-[26px] font-extrabold leading-tight text-primary tabular-nums">{formatCents(lowestPrice.priceCents)}</span>
              <span className="text-sm">at {lowestPrice.retailerName ?? retailerName(lowestPrice.retailerId)}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No current price available</p>
          )}
          {priceUpdated && <p className="mt-0.5 text-xs text-muted-foreground">{priceUpdated}</p>}
        </div>

        {/* The labels take at least 160px and wrap within it, so Add to basket sits bottom-right on every card;
            on a card too narrow for both, the button moves to its own line, on every card alike. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
          <div className="flex min-w-0 flex-[1_1_160px] flex-wrap gap-2" aria-label="Labels">
            {/* With the other labels, first, rather than above the name: that kept the cards in a row from lining up */}
            {product.hcs && <HcsBadge className="border border-primary/35" />}
            {product.category && (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                {formatLabel(product.category)}
              </span>
            )}
            {product.dietary?.map((tag) => (
              <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                {formatLabel(tag)}
              </span>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            variant={basketQuantity > 0 ? "default" : "outline"}
            disabled={basketQuantity >= 99}
            aria-label={basketQuantity >= 99 ? `${product.name} is already at the maximum basket quantity` : basketQuantity > 0 ? `Add another ${product.name}; ${basketQuantity} currently in basket` : `Add ${product.name} to basket`}
            onClick={() => onAdd(product.id)}
          >
            <Plus className="size-4" />{basketQuantity > 0 ? `Add to basket (${basketQuantity})` : "Add to basket"}
          </Button>
        </div>
      </article>

      <dialog
        ref={dialogRef}
        aria-labelledby={`product-title-${product.id}`}
        className="max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
        onClose={() => setDetailsOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close()
        }}
      >
        <div className="space-y-6 p-6 sm:p-8">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Enlarge image of ${product.name}`}
                title="Click to enlarge image"
                onClick={openImagePreview}
              >
                <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onImageExpired} className="product-tile size-16" />
              </button>
              <div>
                <h2 id={`product-title-${product.id}`} className="font-display text-2xl font-extrabold">{product.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[product.brand, packDescription].filter(Boolean).join(" · ") || "Product details unavailable"}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close product details" onClick={() => dialogRef.current?.close()}>
              <X className="size-4" />
            </Button>
          </header>

          <section aria-labelledby={`product-prices-title-${product.id}`}>
            <h3 id={`product-prices-title-${product.id}`} className="font-semibold">Current Retailer Prices</h3>
            <p className="mt-1 text-xs text-muted-foreground">{priceUpdated ?? "No prices yet"}</p>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {retailerIds.map((retailerId) => {
                const price = product.prices?.[retailerId]
                const hasPrice = typeof price?.priceCents === "number" && Number.isFinite(price.priceCents)
                return (
                  <div key={retailerId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{retailerName(retailerId)}</span>
                    {hasPrice ? (
                      <div className="text-right">
                        <p className="font-display text-lg font-extrabold tabular-nums">{formatCents(price.priceCents!)}</p>
                        <p className="text-xs text-muted-foreground">
                          {price.priceDate ? `Price date ${price.priceDate}` : "Date unavailable"}
                          {price.submissionCount ? ` · ${price.submissionCount} submission${price.submissionCount === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No current price</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section aria-labelledby={`product-info-title-${product.id}`}>
            <h3 id={`product-info-title-${product.id}`} className="font-semibold">Product Information</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Category</dt><dd>{product.category ? formatLabel(product.category) : "—"}</dd>
              <dt className="text-muted-foreground">Pack size</dt><dd>{packDescription ?? "—"}</dd>
              <dt className="text-muted-foreground">Healthier Choice</dt><dd>{product.hcs ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Dietary</dt><dd>{product.dietary?.map(formatLabel).join(", ") || "—"}</dd>
            </dl>
          </section>
        </div>
      </dialog>

      <dialog
        ref={imagePreviewRef}
        aria-label={`Enlarged image of ${product.name}`}
        className="max-h-[95vh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-2xl backdrop:bg-black/75"
        onClick={(event) => {
          if (event.target === imagePreviewRef.current) imagePreviewRef.current?.close()
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="truncate font-medium">{product.name}</p>
          <Button type="button" variant="ghost" size="icon" aria-label={`Close enlarged image of ${product.name}`} onClick={() => imagePreviewRef.current?.close()}>
            <X className="size-4" />
          </Button>
        </div>
        <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onImageExpired} className="mx-auto max-h-[82vh] max-w-full rounded-lg bg-white object-contain" />
      </dialog>
    </>
  )
}

export function SearchProductsPage() {
  usePageTitle("Search & filter")
  const [imageRevision, setImageRevision] = useState(0)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const { items: basketItems, setItems: setBasketItems, save: saveBasket } = useBasketItems()
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [hcsOnly, setHcsOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [brand, setBrand] = useState("")
  const [dietary, setDietary] = useState("")
  const [minimumPrice, setMinimumPrice] = useState("")
  const [maximumPrice, setMaximumPrice] = useState("")

  const products = result?.items ?? []
  const basketQuantities = useMemo(
    () => new Map(basketItems.map((item) => [item.productId, item.quantity])),
    [basketItems],
  )
  // Each list narrows to what the other filters leave, so filters can be picked in any order.
  const typeOptions = facetOptions(result?.facetCounts?.categories, category ?? "", result?.facets.categories)
  const brandOptions = facetOptions(result?.facetCounts?.brands, brand, result?.facets.brands)
  const dietaryOptions = facetOptions(result?.facetCounts?.dietary, dietary, result?.facets.dietary)

  useEffect(() => { saveBasket(basketItems) }, [basketItems, saveBasket])

  function addToBasket(productId: string) {
    setBasketItems((current) => {
      const existing = current.find((item) => item.productId === productId)
      if (existing && existing.quantity >= 99) return current
      return existing
        ? current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId, quantity: 1 }]
    })
  }

  const priceRangeError = useMemo(() => {
    const min = minimumPrice === "" ? 0 : Number(minimumPrice)
    const max = maximumPrice === "" ? Number.POSITIVE_INFINITY : Number(maximumPrice)
    if (!Number.isFinite(min) || min < 0) return "Enter a valid minimum price of 0 or more."
    if (maximumPrice !== "" && (!Number.isFinite(max) || max < 0)) return "Enter a valid maximum price of 0 or more."
    if (!isWholeCents(min) || (maximumPrice !== "" && !isWholeCents(max))) return "Enter prices in dollars and cents, e.g. 3.63"
    if (min > max) return "Minimum price must not be greater than maximum price."
    return null
  }, [maximumPrice, minimumPrice])

  useEffect(() => {
    if (priceRangeError) return // the backend would reject it with a 400 anyway
    const controller = new AbortController()
    // Debounce so typing in the price boxes doesn't send a request per keystroke
    const timer = setTimeout(() => {
      setSearching(true)
      fetchSearch({ q: query, category, brand, dietary, hcsOnly, minimumPrice, maximumPrice }, controller.signal)
        .then((data) => { setResult(data); setError(null) })
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted) setError(searchError instanceof Error ? searchError.message : "Could not search products.")
        })
        .finally(() => {
          if (!controller.signal.aborted) { setSearching(false); setLoading(false) }
        })
    }, 300)

    return () => { clearTimeout(timer); controller.abort() }
  }, [brand, category, dietary, hcsOnly, maximumPrice, minimumPrice, priceRangeError, query, imageRevision])

  useEffect(() => {
    const controller = new AbortController()
    // Without the list, the details still show each priced store, named from its id.
    fetchRetailers(controller.signal).then(setRetailers).catch(() => undefined)
    return () => controller.abort()
  }, [])

  // The filters inside the panel. The Healthier Choice switch shows its own state beside it.
  const activeFilterCount = Number(Boolean(category)) + Number(Boolean(brand))
    + Number(Boolean(dietary)) + Number(Boolean(minimumPrice)) + Number(Boolean(maximumPrice))

  function resetFilters() {
    setCategory(null)
    setHcsOnly(false)
    setBrand("")
    setDietary("")
    setMinimumPrice("")
    setMaximumPrice("")
  }

  function clearSearchAndFilters() {
    setQuery("")
    resetFilters()
  }

  // What's applied, shown above the results whether or not the Filters panel is open.
  const priceLabel = minimumPrice && maximumPrice ? `${formatDollars(Number(minimumPrice))} – ${formatDollars(Number(maximumPrice))}`
    : minimumPrice ? `from ${formatDollars(Number(minimumPrice))}` : maximumPrice ? `up to ${formatDollars(Number(maximumPrice))}` : ""
  const appliedFilters: AppliedFilter[] = []
  if (category) appliedFilters.push({ name: "type", label: `Type: ${formatLabel(category)}`, stale: isStale(typeOptions, category), clear: () => setCategory(null) })
  if (brand) appliedFilters.push({ name: "brand", label: `Brand: ${brand}`, stale: isStale(brandOptions, brand), clear: () => setBrand("") })
  if (dietary) appliedFilters.push({ name: "dietary", label: `Dietary: ${formatLabel(dietary)}`, stale: isStale(dietaryOptions, dietary), clear: () => setDietary("") })
  if (hcsOnly) appliedFilters.push({ name: "Healthier Choice", label: "Healthier Choice only", stale: false, clear: () => setHcsOnly(false) })
  if (priceLabel) appliedFilters.push({ name: "price", label: `Price ${priceLabel}`, stale: false, clear: () => { setMinimumPrice(""); setMaximumPrice("") } })
  // Choices that fit nothing alongside the others; the empty results offer to clear each one.
  const staleFilters = appliedFilters.filter((filter) => filter.stale)

  return (
    <AppShell>
      <section className="space-y-6 sm:space-y-8">
        <PageHeader title="Search and Filter Groceries" description="Find a product by name or brand.">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {(loading || searching) && <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />}
            {loading ? "Loading…" : searching ? "Updating…" : `${result?.total ?? 0} of ${result?.catalogSize ?? 0} products`}
          </p>
        </PageHeader>

        <div className="surface-card space-y-5 p-5 sm:p-6">
          <form onSubmit={(event) => event.preventDefault()} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                maxLength={100}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or brand"
                aria-label="Search products or brands"
                className="h-12 pl-10 text-base"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              aria-expanded={filtersOpen}
              aria-controls="advanced-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="size-4" />Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
            <button
              type="button"
              role="switch"
              aria-checked={hcsOnly}
              onClick={() => setHcsOnly((value) => !value)}
              className={cn(
                "flex h-12 items-center justify-center gap-2.5 rounded-lg border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                hcsOnly && "border-primary bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              <span aria-hidden="true" className={cn("relative h-5 w-9 shrink-0 rounded-full bg-input/40 transition-colors", hcsOnly && "bg-primary")}>
                <span className={cn("absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform", hcsOnly && "translate-x-4")} />
              </span>
              Healthier Choice only
            </button>
          </form>

          {filtersOpen && (
            <div id="advanced-filters" className="grid gap-4 rounded-xl border bg-background/60 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type-filter">Type</Label>
                <FacetSelect id="type-filter" value={category ?? ""} options={typeOptions} allLabel="All types" format={formatLabel} onChange={(value) => setCategory(value || null)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-filter">Brand</Label>
                <FacetSelect id="brand-filter" value={brand} options={brandOptions} allLabel="All brands" onChange={setBrand} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dietary-filter">Dietary</Label>
                <FacetSelect id="dietary-filter" value={dietary} options={dietaryOptions} allLabel="All dietary options" format={formatLabel} onChange={setDietary} />
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm font-semibold">Lowest price range ($)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="minimum-price" className="text-xs text-muted-foreground">From</Label>
                    <Input
                      id="minimum-price"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0"
                      value={minimumPrice}
                      onChange={(event) => setMinimumPrice(limitToCents(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="maximum-price" className="text-xs text-muted-foreground">To</Label>
                    <Input
                      id="maximum-price"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="No limit"
                      value={maximumPrice}
                      onChange={(event) => setMaximumPrice(limitToCents(event.target.value))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Leave From blank for $0 or To blank for no upper limit.</p>
                {priceRangeError && (minimumPrice !== "" || maximumPrice !== "") && (
                  <p role="alert" className="text-xs text-destructive">{priceRangeError}</p>
                )}
              </fieldset>
              <p className="text-xs text-muted-foreground sm:col-span-2">Each list only offers choices that still have products, with how many. Price filtering uses each product’s lowest current retailer price.</p>
            </div>
          )}

          {appliedFilters.length > 0 && (
            <div role="group" aria-label="Applied filters" className="flex flex-wrap items-center gap-2">
              {appliedFilters.map((filter) => (
                <button
                  key={filter.name}
                  type="button"
                  onClick={filter.clear}
                  aria-label={`Remove ${filter.label}`}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter.stale ? "border-amber-600 text-amber-800 dark:border-amber-400 dark:text-amber-200" : "border-primary/40 bg-accent/60 text-accent-foreground",
                  )}
                >
                  {filter.label}<X aria-hidden="true" className="size-3.5" />
                </button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="text-[13px]" onClick={resetFilters}><RotateCcw className="size-4" />Reset filters</Button>
            </div>
          )}
        </div>

        {error ? (
          <div role="alert" className="surface-card p-10 text-center">
            <h2 className="font-display text-lg font-extrabold">Catalogue unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : loading ? (
          <div className="surface-card flex flex-col items-center gap-3 p-12 text-center text-sm text-muted-foreground" aria-live="polite">
            <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />Loading products…
          </div>
        ) : result?.catalogSize === 0 ? (
          <div className="surface-card p-10 text-center">
            <h2 className="font-display text-lg font-extrabold">No products yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Products will appear here when the catalog API returns them.</p>
          </div>
        ) : products.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <h2 className="font-display text-lg font-extrabold">No matching products</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {staleFilters.length > 1 ? `${staleFilters.map((filter) => filter.label).join(" and ")} don’t go together. Clear one to see what’s available.` : "Try a different search or clear some filters."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {staleFilters.length > 1 && staleFilters.map((filter) => (
                <Button key={filter.name} type="button" variant="outline" onClick={filter.clear}>Clear {filter.name}</Button>
              ))}
              <Button type="button" variant={staleFilters.length > 1 ? "ghost" : "outline"} onClick={clearSearchAndFilters}>Clear search and filters</Button>
            </div>
          </div>
        ) : (
          <div className={`grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${searching ? "opacity-60" : ""}`} aria-live="polite" aria-busy={searching}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                basketQuantity={basketQuantities.get(product.id) ?? 0}
                onImageExpired={() => setImageRevision((n) => n + 1)}
                onAdd={addToBasket}
                retailers={retailers}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
