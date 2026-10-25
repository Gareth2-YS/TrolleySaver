import { Filter, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
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

interface SearchProduct {
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
  prices?: Record<string, { priceCents?: number; priceDate?: string; submissionCount?: number; computedAt?: string }>
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

async function fetchProducts(): Promise<SearchProduct[]> {
  if (!API_BASE_URL) {
    throw new Error("Set VITE_API_BASE_URL in frontend/.env.local to load the AWS catalog.")
  }

  const response = await fetch(`${API_BASE_URL}/products`)
  if (!response.ok) throw new Error(`Could not load products (HTTP ${response.status}).`)

  const data = (await response.json()) as { items?: SearchProduct[] }
  if (!Array.isArray(data.items)) throw new Error("The catalog response did not contain a product list.")
  return data.items
}

async function fetchProductPrices(products: SearchProduct[]): Promise<SearchProduct[]> {
  if (!API_BASE_URL || products.length === 0) return products
  
  const pricesByProduct: Record<string, NonNullable<SearchProduct["prices"]>> = {}

  for (let start = 0; start < products.length; start += 50) {
    const batch = products.slice(start, start + 50)
    const response = await fetch(`${API_BASE_URL}/basket/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch.map(({ id }) => ({ productId: id, quantity: 1 })) }),
    })
    if (!response.ok) throw new Error(`Could not load current prices (HTTP ${response.status}).`)

    const data = (await response.json()) as {
      basket?: {
        stores?: Array<{
          retailerId: string
          lines?: Array<{ productId: string; unitPriceCents: number; priceDate: string; submissionCount: number }>
        }>
      }
    }
    if (!Array.isArray(data.basket?.stores)) throw new Error("The price response did not contain store prices.")

    for (const store of data.basket.stores) {
      for (const line of store.lines ?? []) {
        if (!Number.isFinite(line.unitPriceCents) || line.unitPriceCents <= 0) continue
        pricesByProduct[line.productId] ??= {}
        pricesByProduct[line.productId][store.retailerId] = {
          priceCents: line.unitPriceCents,
          priceDate: line.priceDate,
          submissionCount: line.submissionCount,
        }
      }
    }
  }

  return products.map((product) => ({ ...product, prices: pricesByProduct[product.id] ?? {} }))
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

function getLowestPrice(product: SearchProduct) {
  return Object.entries(product.prices ?? {})
    .filter((entry): entry is [string, { priceCents: number; priceDate?: string }] =>
      typeof entry[1]?.priceCents === "number" && Number.isFinite(entry[1].priceCents) && entry[1].priceCents > 0,
    )
    .map(([retailerId, price]) => ({ retailerId, ...price }))
    .sort((a, b) => a.priceCents - b.priceCents || a.retailerId.localeCompare(b.retailerId))[0]
}

function ProductCard({ product, showNoPrice }: { product: SearchProduct; showNoPrice: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const packDescription = getPackDescription(product)
  const lowestPrice = getLowestPrice(product)
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

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openDetails()
    }
  }

  return (
    <>
      <article
        className="glass-panel flex h-full cursor-pointer flex-col p-5 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`View details for ${product.name}`}
        onClick={openDetails}
        onKeyDown={handleCardKeyDown}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {categoryIcon && <img src={categoryIcon} alt="" aria-hidden="true" className="size-12 shrink-0 object-contain" />}
            <div className="min-w-0">
              <h2 className="font-semibold leading-snug">{product.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[product.brand, packDescription].filter(Boolean).join(" · ") || "Product details unavailable"}
              </p>
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
                at {RETAILER_NAMES[lowestPrice.retailerId] ?? formatLabel(lowestPrice.retailerId)}
              </span>
            </p>
          </div>
        )}
        {!lowestPrice && showNoPrice && (
          <p className="mt-4 rounded-lg border border-border/70 px-3 py-2.5 text-sm text-muted-foreground">
            No current price available
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
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
              {categoryIcon && <img src={categoryIcon} alt="" aria-hidden="true" className="size-14 shrink-0 object-contain" />}
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
  const [products, setProducts] = useState<SearchProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(true)
  const [pricesError, setPricesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftQuery, setDraftQuery] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [hcsOnly, setHcsOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [brand, setBrand] = useState("")
  const [dietary, setDietary] = useState("")
  const [minimumPrice, setMinimumPrice] = useState("")
  const [maximumPrice, setMaximumPrice] = useState("")

  useEffect(() => {
    let active = true

    fetchProducts()
      .then((items) => {
        if (!active) return
        setProducts(items)
        setLoading(false)

        return fetchProductPrices(items)
          .then((pricedItems) => { if (active) setProducts(pricedItems) })
          .catch((priceError: unknown) => {
            if (active) setPricesError(priceError instanceof Error ? priceError.message : "Could not load current prices.")
          })
          .finally(() => { if (active) setPricesLoading(false) })
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load products.")
        if (active) setPricesLoading(false)
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [])

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  )
  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brand).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  )
  const dietaryOptions = useMemo(
    () => [...new Set(products.flatMap((product) => product.dietary ?? []))].sort(),
    [products],
  )
  const quickCategories = useMemo(
    () => QUICK_CATEGORY_LABELS.flatMap((label) => {
      const value = categories.find((item) => normalizeCategory(item) === label)
      return value ? [value] : []
    }),
    [categories],
  )

  const priceRangeError = useMemo(() => {
    const min = minimumPrice === "" ? 0 : Number(minimumPrice)
    const max = maximumPrice === "" ? Number.POSITIVE_INFINITY : Number(maximumPrice)
    if (!Number.isFinite(min) || min < 0) return "Enter a valid minimum price of 0 or more."
    if (maximumPrice !== "" && (!Number.isFinite(max) || max < 0)) return "Enter a valid maximum price of 0 or more."
    if (min > max) return "Minimum price must not be greater than maximum price."
    return null
  }, [maximumPrice, minimumPrice])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.brand,
        product.category,
        ...(product.searchTerms ?? []),
        ...(product.dietary ?? []),
        product.packQty?.toString(),
        product.packUnit,
      ].filter(Boolean).join(" ").toLocaleLowerCase()

      return (!normalizedQuery || searchableText.includes(normalizedQuery))
        && (!category || product.category === category)
        && (!hcsOnly || product.hcs === true)
        && (!brand || product.brand === brand)
        && (!dietary || product.dietary?.includes(dietary) === true)
        && (priceRangeError !== null || (minimumPrice === "" && maximumPrice === "") || (() => {
          const lowestPrice = getLowestPrice(product)?.priceCents
          if (lowestPrice === undefined) return false
          const minCents = minimumPrice === "" ? 0 : Number(minimumPrice) * 100
          const maxCents = maximumPrice === "" ? Number.POSITIVE_INFINITY : Number(maximumPrice) * 100
          return lowestPrice >= minCents && lowestPrice <= maxCents
        })())
    })
  }, [brand, category, dietary, hcsOnly, maximumPrice, minimumPrice, priceRangeError, products, query])

  const activeFilterCount = Number(Boolean(category)) + Number(hcsOnly) + Number(Boolean(brand))
    + Number(Boolean(dietary)) + Number(Boolean(minimumPrice)) + Number(Boolean(maximumPrice))

  function submitSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(draftQuery)
  }

  function clearFilters() {
    setDraftQuery("")
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
            {loading ? "Loading…" : `${filteredProducts.length} of ${products.length} products`}
          </p>
        </header>

        {pricesLoading && !loading && (
          <p className="text-sm text-muted-foreground" aria-live="polite">Loading current retailer prices…</p>
        )}
        {pricesError && !loading && (
          <p role="status" className="rounded-lg border border-border/70 px-4 py-3 text-sm text-muted-foreground">
            Product list loaded, but current prices are unavailable: {pricesError}
          </p>
        )}

        <div className="glass-panel space-y-5 p-5 sm:p-7">
          <form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search product or brand"
                aria-label="Search products or brands"
                className="pl-10"
              />
            </div>
            <Button type="submit"><Search className="size-4" />Search</Button>
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
        ) : products.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <h2 className="font-semibold">No products yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Products will appear here when the catalog API returns them.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <h2 className="font-semibold">No matching products</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try a different search or clear some filters.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>Clear search and filters</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} showNoPrice={!pricesLoading && !pricesError} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
