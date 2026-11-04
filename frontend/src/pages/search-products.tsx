import { ProductImage } from "../components/product-image"
import { Filter, Plus, Search, X } from "lucide-react"
// import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { loadBasket, saveBasket } from "../basket/service"
import type { BasketItem } from "../basket/types"
import breadIcon from "../../assets/product-icons/Bread.svg"
import cerealIcon from "../../assets/product-icons/Cereal.svg"
import coffeeIcon from "../../assets/product-icons/Coffee.svg"
import cookieIcon from "../../assets/product-icons/Cookie.svg"
import detergentIcon from "../../assets/product-icons/Detergent.svg"
import eggIcon from "../../assets/product-icons/Egg.svg"
import milkIcon from "../../assets/product-icons/Milk.svg"
import paperIcon from "../../assets/product-icons/Paper.svg"
import riceIcon from "../../assets/product-icons/Rice.svg"
import softDrinkIcon from "../../assets/product-icons/Soft.svg"
import teaIcon from "../../assets/product-icons/Tea.svg"
import yogurtIcon from "../../assets/product-icons/Yogurt.svg"


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
}

interface SearchResult {
  items: SearchProduct[]
  total: number
  catalogSize: number
  facets: { categories: string[]; brands: string[]; dietary: string[] }
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

const RETAILER_NAMES: Record<string, string> = {
  fairprice: "FairPrice",
  shengsiong: "Sheng Siong",
  coldstorage: "Cold Storage",
}

const QUICK_CATEGORY_LABELS = ["cereal", "milk", "soft drinks", "cookies", "toilet rolls"]

const PRODUCT_CATEGORY_ICONS: Record<string, string> = {
  bread: breadIcon,
  cereal: cerealIcon,
  coffee: coffeeIcon,
  cookies: cookieIcon,
  detergent: detergentIcon,
  "laundry detergent": detergentIcon,
  eggs: eggIcon,
  milk: milkIcon,
  dairy: milkIcon,
  paper: paperIcon,
  "toilet rolls": paperIcon,
  rice: riceIcon,
  "soft drinks": softDrinkIcon,
  tea: teaIcon,
  yoghurt: yogurtIcon,
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

function formatLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeCategory(value: string) {
  return value.toLocaleLowerCase().replace(/[-_]/g, " ").trim()
}

function getCategoryIcon(category?: string) {
  return category ? PRODUCT_CATEGORY_ICONS[normalizeCategory(category)] : undefined
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
}: {
  product: SearchProduct
  basketQuantity: number
  onImageExpired: () => void
  onAdd: (productId: string) => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const packDescription = getPackDescription(product)
  // const lowestPrice = getLowestPrice(product)
  const lowestPrice = product.lowestPrice
  const categoryIcon = getCategoryIcon(product.category)
  const retailerIds = [
    ...Object.keys(RETAILER_NAMES),
    ...Object.keys(product.prices ?? {}).filter((id) => !(id in RETAILER_NAMES)),
  ]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (detailsOpen && !dialog.open) dialog.showModal()
    if (!detailsOpen && dialog.open) dialog.close()
  }, [detailsOpen])

  function openDetails() {
    setDetailsOpen(true)
  }

  return (
    <>
      <article
        className="glass-panel flex h-full flex-col p-5 text-left transition hover:border-primary/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onImageExpired} className="size-12 shrink-0 object-contain" />
            <div className="min-w-0">
              <button
                type="button"
                className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-haspopup="dialog"
                aria-label={`View details for ${product.name}`}
                onClick={openDetails}
              >
                <span className="block font-semibold leading-snug">{product.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {[product.brand, packDescription].filter(Boolean).join(" · ") || "Product details unavailable"}
                </span>
              </button>
            </div>
          </div>
          {product.hcs && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Healthier Choice
            </span>
          )}
        </div>

        {lowestPrice && (
          <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
            <p className="mt-0.5 font-semibold text-[20px] text-primary">
              ${(lowestPrice.priceCents / 100).toFixed(2)}
              <span className="ml-2 text-sm font-normal text-foreground">
                {/* at {RETAILER_NAMES[lowestPrice.retailerId] ?? formatLabel(lowestPrice.retailerId)} */}
                at {lowestPrice.retailerName ?? RETAILER_NAMES[lowestPrice.retailerId] ?? formatLabel(lowestPrice.retailerId)}
              </span>
            </p>
          </div>
        )}
        {/* {!lowestPrice && showNoPrice && ( */}
        {!lowestPrice && (
          <p className="mt-4 rounded-lg border border-border/70 px-3 py-2.5 text-sm text-muted-foreground">
            No current price available
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
          <div className="flex flex-wrap gap-2">
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
            variant={basketQuantity > 0 ? "default" : "outline"}
            disabled={basketQuantity >= 99}
            aria-label={basketQuantity >= 99 ? `${product.name} is already at the maximum basket quantity` : basketQuantity > 0 ? `Add another ${product.name}; ${basketQuantity} currently in basket` : `Add ${product.name} to basket`}
            onClick={() => onAdd(product.id)}
          >
            <Plus className="size-4" />{basketQuantity > 0 ? `Add (${basketQuantity})` : "Add"}
          </Button>
        </div>
      </article>

      <dialog
        ref={dialogRef}
        aria-labelledby={`product-title-${product.id}`}
        className="max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
        onClose={() => setDetailsOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close()
        }}
      >
        <div className="space-y-6 p-6 sm:p-8">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onImageExpired} className="size-14 shrink-0 object-contain" />
              <div>
                <h2 id={`product-title-${product.id}`} className="text-2xl font-semibold">{product.name}</h2>
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
            <h3 id={`product-prices-title-${product.id}`} className="font-semibold">Current retailer prices</h3>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {retailerIds.map((retailerId) => {
                const price = product.prices?.[retailerId]
                const hasPrice = typeof price?.priceCents === "number" && Number.isFinite(price.priceCents)
                return (
                  <div key={retailerId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{RETAILER_NAMES[retailerId] ?? formatLabel(retailerId)}</span>
                    {hasPrice ? (
                      <div className="text-right">
                        <p className="font-semibold">${(price.priceCents! / 100).toFixed(2)}</p>
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
            <h3 id={`product-info-title-${product.id}`} className="font-semibold">Product information</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Category</dt><dd>{product.category ? formatLabel(product.category) : "—"}</dd>
              <dt className="text-muted-foreground">Pack size</dt><dd>{packDescription ?? "—"}</dd>
              <dt className="text-muted-foreground">Healthier Choice</dt><dd>{product.hcs ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Dietary</dt><dd>{product.dietary?.map(formatLabel).join(", ") || "—"}</dd>
            </dl>
          </section>
        </div>
      </dialog>
    </>
  )
}

export function SearchProductsPage() {
  // const [products, setProducts] = useState<SearchProduct[]>([])
  const [imageRevision, setImageRevision] = useState(0)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [basketItems, setBasketItems] = useState<BasketItem[]>(loadBasket)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  // const [pricesLoading, setPricesLoading] = useState(true)
  // const [pricesError, setPricesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // const [draftQuery, setDraftQuery] = useState("")
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
  const categories = useMemo(() => result?.facets.categories ?? [], [result])
  const brands = result?.facets.brands ?? []
  const dietaryOptions = result?.facets.dietary ?? []
  const quickCategories = useMemo(
    () => QUICK_CATEGORY_LABELS.flatMap((label) => {
      const value = categories.find((item) => normalizeCategory(item) === label)
      return value ? [value] : []
    }),
    [categories],
  )

  useEffect(() => { saveBasket(basketItems) }, [basketItems])

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



  const activeFilterCount = Number(Boolean(category)) + Number(hcsOnly) + Number(Boolean(brand))
    + Number(Boolean(dietary)) + Number(Boolean(minimumPrice)) + Number(Boolean(maximumPrice))


  function clearFilters() {
    // setDraftQuery("")
    setQuery("")
    setCategory(null)
    setHcsOnly(false)
    setBrand("")
    setDietary("")
    setMinimumPrice("")
    setMaximumPrice("")
  }

  return (
    <AppShell>
      <section className="space-y-6 sm:space-y-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Search and filter groceries</h1>
            <p className="mt-2 text-sm text-muted-foreground">Find a product by name or brand.</p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {/* {loading ? "Loading…" : `${filteredProducts.length} of ${products.length} products`} */}
            {loading ? "Loading…" : searching ? "Updating…" : `${result?.total ?? 0} of ${result?.catalogSize ?? 0} products`}
          </p>
        </header>

        <div className="glass-panel space-y-5 p-5 sm:p-7">
          {/* <form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"> */}
          <form onSubmit={(event) => event.preventDefault()} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                // value={draftQuery}
                // onChange={(event) => setDraftQuery(event.target.value)}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or brand"
                aria-label="Search products or brands"
                className="pl-10"
              />
            </div>
            {/* <Button type="submit"><Search className="size-4" />Search</Button> */}
            <Button
              type="button"
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="advanced-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="size-4" />Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2" aria-label="Quick filters">
            <Button type="button" size="sm" variant={category === null && !hcsOnly ? "default" : "outline"} onClick={() => { setCategory(null); setHcsOnly(false) }}>
              All
            </Button>
            {quickCategories.map((value) => (
              <Button key={value} type="button" size="sm" variant={category === value ? "default" : "outline"} onClick={() => { setCategory(category === value ? null : value); setHcsOnly(false) }}>
                {formatLabel(value)}
              </Button>
            ))}
            <Button type="button" size="sm" variant={hcsOnly ? "default" : "outline"} aria-pressed={hcsOnly} onClick={() => { setHcsOnly((value) => !value); setCategory(null) }}>
              Healthier Choice
            </Button>
          </div>

          {filtersOpen && (
            <div id="advanced-filters" className="grid gap-4 rounded-xl border border-border/70 bg-card/30 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type-filter">Type</Label>
                <select id="type-filter" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" value={category ?? ""} onChange={(event) => { setCategory(event.target.value || null); setHcsOnly(false) }}>
                  <option value="">All types</option>
                  {categories.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-filter">Brand</Label>
                <select id="brand-filter" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" value={brand} onChange={(event) => setBrand(event.target.value)}>
                  <option value="">All brands</option>
                  {brands.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dietary-filter">Dietary</Label>
                <select id="dietary-filter" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" value={dietary} onChange={(event) => setDietary(event.target.value)}>
                  <option value="">All dietary options</option>
                  {dietaryOptions.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
                </select>
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm font-medium">Lowest price range ($)</legend>
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
                      onChange={(event) => setMinimumPrice(event.target.value)}
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
                      onChange={(event) => setMaximumPrice(event.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Leave From blank for $0 or To blank for no upper limit.</p>
                {priceRangeError && (minimumPrice !== "" || maximumPrice !== "") && (
                  <p role="alert" className="text-xs text-destructive">{priceRangeError}</p>
                )}
              </fieldset>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Price filtering uses each product’s lowest current retailer price.</p>
                <Button type="button" size="sm" variant="ghost" onClick={clearFilters}><X className="size-4" />Clear search and filters</Button>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div role="alert" className="glass-panel p-10 text-center">
            <h2 className="font-semibold">Catalogue unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : loading ? (
          <div className="glass-panel p-10 text-center text-sm text-muted-foreground" aria-live="polite">Loading products…</div>
        // ) : products.length === 0 ? (
        ) : result?.catalogSize === 0 ? (
          <div className="glass-panel p-10 text-center">
            <h2 className="font-semibold">No products yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Products will appear here when the catalog API returns them.</p>
          </div>
        // ) : filteredProducts.length === 0 ? (
        ) : products.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <h2 className="font-semibold">No matching products</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try a different search or clear some filters.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>Clear search and filters</Button>
          </div>
        ) : (
          // <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          <div className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${searching ? "opacity-60" : ""}`} aria-live="polite" aria-busy={searching}>
            {/* {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} showNoPrice={!pricesLoading && !pricesError} />
            ))} */}
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                basketQuantity={basketQuantities.get(product.id) ?? 0}
                onImageExpired={() => setImageRevision((n) => n + 1)}
                onAdd={addToBasket}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
