import { ProductImage } from "../components/product-image"
import {
  AlertTriangle,
  BadgeCheck,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  Leaf,
  LoaderCircle,
  Minus,
  PiggyBank,
  Plus,
  Search,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, type KeyboardEvent, useState, type ReactNode } from "react"
import { FormAlert } from "../components/auth/form-alert"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { createBasketService, loadBasket, saveBasket } from "../basket/service"
import type { BasketItem, BasketResult, BasketService, BasketStore, Product } from "../basket/types"
import { cn } from "../lib/utils"

const MAX_QUANTITY = 99
const COMPARE_DELAY_MS = 300

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", currencyDisplay: "narrowSymbol" }).format(cents / 100)
}

function packLabel(item: { packQty: number | null; packUnit: string | null; packCount?: number }) {
  if (item.packQty === null || item.packUnit === null) return ""
  const size = `${item.packQty} ${item.packUnit}`
  return item.packCount && item.packCount > 1 ? `${item.packCount} × ${size}` : size
}

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

function storeName(store: { retailerId: string; retailerName: string | null }) {
  return store.retailerName ?? store.retailerId
}

function Card({ className, children, ...props }: { className?: string; children: ReactNode; "aria-labelledby"?: string; "aria-label"?: string }) {
  return <section className={cn("rounded-[14px] border bg-card p-5 shadow-sm sm:p-6", className)} {...props}>{children}</section>
}

function CardTitle({ id, icon: Icon, title, description }: { id: string; icon: typeof Search; title: string; description: string }) {
  return (
    <div className="min-w-0">
      <h2 id={id} className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary"><Icon className="size-5" /></span>{title}
      </h2>
      <p className="pl-[46px] text-[13px] text-muted-foreground">{description}</p>
    </div>
  )
}

function HcsBadge({ solid = false }: { solid?: boolean }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide", solid ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
      Healthier Choice
    </span>
  )
}

function Filter({ label, value, options, allLabel, onChange }: { label: string; value: string; options: string[]; allLabel: string; onChange: (value: string) => void }) {
  return (
    <label className="relative min-w-0 flex-1 sm:max-w-[220px] sm:basis-[170px]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-lg border bg-background pl-3 pr-9 text-[13px] font-medium capitalize hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value && "border-primary bg-accent/50 text-accent-foreground",
        )}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </label>
  )
}

function retailerNote(store: BasketStore, cheapest: BasketStore) {
  if (store.retailerId === cheapest.retailerId && store.pricedCount > 0) return store.complete ? "Lowest total" : `${store.pricedCount} priced · ${store.missingCount} missing`
  if (!store.complete || !cheapest.complete) return `${store.pricedCount} priced · ${store.missingCount} missing`
  const difference = store.totalCents - cheapest.totalCents
  return difference > 0 ? `+${formatCents(difference)} more` : "Same total"
}

export function SmartBasketPage({ serviceOverride }: { serviceOverride?: BasketService }) {
  const [service] = useState(() => serviceOverride ?? createBasketService())
  const [products, setProducts] = useState<Product[]>([])
  const [imageRevision, setImageRevision] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [items, setItems] = useState<BasketItem[]>(loadBasket)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [brand, setBrand] = useState("")
  // The last comparison that came back, and which basket it was for, so edits in flight can show as "updating".
  const [result, setResult] = useState<BasketResult | null>(null)
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [swapOpenFor, setSwapOpenFor] = useState<string | null>(null)
  const [noteDismissed, setNoteDismissed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const retailerRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    let active = true
    service.listProducts()
      .then((loaded) => { if (active) setProducts(loaded) })
      .catch((error) => { if (active) setCatalogError(error instanceof Error ? error.message : "Could not load the product catalog.") })
      .finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [service, imageRevision])

  // S3 image links are presigned and expire; reloading the catalog fetches fresh ones.
  const refreshImages = () => setImageRevision((n) => n + 1)

  const catalog = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  // Saved lines for products no longer in the catalog are dropped once it loads.
  const basket = useMemo(() => (catalogLoading ? [] : items.filter((item) => catalog.has(item.productId))), [catalog, catalogLoading, items])
  const basketKey = JSON.stringify(basket)

  // Only save once the catalog has loaded, so a failed load can't wipe the saved basket.
  useEffect(() => { if (!catalogLoading && !catalogError) saveBasket(basket) }, [basket, catalogError, catalogLoading])

  useEffect(() => {
    const current: BasketItem[] = JSON.parse(basketKey)
    if (!current.length) return
    let active = true
    const timer = setTimeout(() => {
      service.compare(current)
        .then((next) => { if (active) { setResult(next); setSettled({ key: basketKey, error: null }) } })
        .catch((error) => { if (active) setSettled({ key: basketKey, error: error instanceof Error ? error.message : "Could not compare store prices." }) })
    }, COMPARE_DELAY_MS)
    return () => { active = false; clearTimeout(timer) }
  }, [basketKey, service])

  const comparing = basket.length > 0 && settled?.key !== basketKey
  const compareError = basket.length > 0 && settled?.key === basketKey ? settled.error : null

  const categories = useMemo(() => [...new Set(products.map((product) => product.category))].sort(), [products])
  const brands = useMemo(() => [...new Set(products.map((product) => product.brand))].sort((a, b) => a.localeCompare(b)), [products])

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return products.filter((product) => {
      if ((category && product.category !== category) || (brand && product.brand !== brand)) return false
      const text = `${product.name} ${product.brand} ${product.category}`.toLowerCase()
      return terms.every((term) => text.includes(term))
    })
  }, [brand, category, products, query])

  // Like the backend's healthier basket: a non-HCS product can swap for any HCS product in its category.
  const alternatives = useMemo(() => {
    const byProduct = new Map<string, Product[]>()
    for (const item of basket) {
      const product = catalog.get(item.productId)!
      if (!product.hcs) byProduct.set(product.id, products.filter((other) => other.hcs && other.category === product.category && other.id !== product.id))
    }
    return byProduct
  }, [basket, catalog, products])

  function setQuantity(productId: string, quantity: number) {
    setItems((current) => quantity < 1
      ? current.filter((item) => item.productId !== productId)
      : current.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY) } : item)))
  }

  function addProduct(productId: string) {
    setItems((current) => current.some((item) => item.productId === productId)
      ? current.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) } : item))
      : [...current, { productId, quantity: 1 }])
  }

  // The swap keeps the line's place and quantity; if the alternative is already in the basket the two merge.
  function swapProduct(fromId: string, toId: string) {
    setItems((current) => {
      const from = current.find((item) => item.productId === fromId)
      if (!from) return current
      const existing = current.find((item) => item.productId === toId)
      return current
        .filter((item) => !(existing && item.productId === fromId))
        .map((item) => item.productId === (existing ? toId : fromId) ? { productId: toId, quantity: Math.min(item.quantity + (existing ? from.quantity : 0), MAX_QUANTITY) } : item)
    })
    setSwapOpenFor(null)
  }

  const comparison = basket.length ? result?.basket ?? null : null
  const stores = comparison?.stores ?? []
  const cheapest = stores[0]
  const selectedStore = stores.find((store) => store.retailerId === selectedStoreId) ?? cheapest
  const packCount = basket.reduce((sum, item) => sum + item.quantity, 0)
  const hcsCount = basket.filter((item) => catalog.get(item.productId)?.hcs).length
  const swappable = [...alternatives.values()].filter((options) => options.length > 0).length

  function retailerKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + stores.length) % stores.length
    setSelectedStoreId(stores[next].retailerId)
    retailerRefs.current[next]?.focus()
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-[999_1_480px]">
            <h1 className="mb-3 text-[clamp(28px,4vw,38px)] font-bold leading-tight tracking-tight">Smart basket comparison</h1>
            <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
              Build your grocery list once and see what the whole basket costs at each supermarket, and how much you save by choosing the cheapest one.
            </p>
          </div>
          <aside className="flex flex-[1_1_240px] items-center gap-4 rounded-[14px] border bg-card px-6 py-5 shadow-sm">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-primary"><PiggyBank className="size-7" /></span>
            <div>
              <p className="mb-1.5 text-[34px] font-bold leading-none tracking-tight text-primary tabular-nums">
                {comparison?.maxSavingsCents ? formatCents(comparison.maxSavingsCents) : "—"}
              </p>
              <p className="text-[13px] text-muted-foreground">Potential savings, up to</p>
            </div>
          </aside>
        </header>

        <FormAlert message={catalogError ?? compareError} />

        {/* Desktop: search spans the top; the basket and price-per-item card sit side by side below it. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="lg:col-span-2" aria-labelledby="add-heading">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-[1_1_240px]"><CardTitle id="add-heading" icon={ShoppingBag} title="Add groceries" description="Search the catalog and add items to your basket" /></div>
              <div className="flex w-full gap-2 sm:w-auto sm:flex-[0_1_440px] sm:flex-wrap sm:justify-end">
                <Filter label="Product type" value={category} options={categories} allLabel="All product types" onChange={setCategory} />
                <Filter label="Brand" value={brand} options={brands} allLabel="All brands" onChange={setBrand} />
              </div>
            </div>

            <label className="sr-only" htmlFor="product-search">Search groceries</label>
            <div className="relative my-[18px]">
              <Search className="absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <input
                id="product-search"
                ref={searchRef}
                type="search"
                className="h-12 w-full rounded-[10px] border bg-background pl-[42px] pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Search by product, brand or category"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <ul className="flex max-h-[292px] flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label="Products">
              {catalogLoading ? (
                <li className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading products…</li>
              ) : matches.length === 0 ? (
                <li className="rounded-[10px] border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
                  {catalogError ? "Products are unavailable." : query.trim() ? `No products match “${query.trim()}”.` : "No products match these filters."}
                </li>
              ) : matches.map((product) => {
                const inBasket = basket.find((item) => item.productId === product.id)
                return (
                  <li key={product.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border border-border/60 bg-background px-4 py-3.5">
                    <div className="flex min-w-0 flex-[999_1_200px] items-center gap-3">
                      <ProductImage url={product.imageUrl} name={product.name} onExpired={refreshImages} className="size-12 shrink-0 rounded-lg object-contain" />
                      <div className="min-w-0">
                      <p className="mb-1 text-sm font-semibold leading-snug">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.brand} · {packLabel(product)} · {product.category}</p>
                      </div>
                    </div>
                    {product.hcs && <HcsBadge />}
                    <Button
                      type="button"
                      variant={inBasket ? "default" : "outline"}
                      className={cn("h-11 rounded-lg px-[18px] text-[13px] font-semibold", !inBasket && "border-primary text-primary hover:bg-accent")}
                      onClick={() => addProduct(product.id)}
                      aria-label={`Add ${product.name}`}
                    >
                      {inBasket ? `Add (${inBasket.quantity})` : "Add"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card aria-labelledby="basket-heading">
            <div className="mb-[18px] flex items-start gap-4">
              <div className="flex-1"><CardTitle id="basket-heading" icon={ShoppingBasket} title="Your basket" description={`${plural(basket.length, "product")} · ${plural(packCount, "pack")}`} /></div>
              {basket.length > 0 && <Button type="button" variant="outline" size="sm" className="rounded-lg text-[13px] font-semibold text-muted-foreground" onClick={() => setItems([])}>Reset</Button>}
            </div>

            {basket.length === 0 ? (
              <div className="py-10 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-xl bg-accent text-primary"><ShoppingBasket className="size-7" /></span>
                <h3 className="mt-4 font-semibold">Your basket is empty</h3>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Add groceries to compare the full basket total at every supermarket.</p>
                <Button type="button" className="mt-5" onClick={() => searchRef.current?.focus()}><Search className="size-4" />Browse groceries</Button>
              </div>
            ) : (
              <>
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[13px] font-semibold">Compare by retailer</p>
                  <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    {comparing && <LoaderCircle className="size-3.5 animate-spin" aria-label="Updating prices" />}
                    {selectedStore ? `${selectedStore.pricedCount} priced · ${selectedStore.missingCount} missing at ${storeName(selectedStore)}` : comparing ? "Comparing store prices…" : "No store prices yet"}
                  </p>
                </div>

                {stores.length === 0 ? (
                  comparing && (
                    <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                      {[0, 1, 2].map((index) => <div key={index} className="h-[88px] rounded-xl bg-secondary" />)}
                    </div>
                  )
                ) : (
                  <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5" role="radiogroup" aria-label="Show basket prices at">
                    {stores.map((store, index) => {
                      const selected = store.retailerId === selectedStore?.retailerId
                      const best = store.rank === 1 && store.pricedCount > 0
                      return (
                        <button
                          key={store.retailerId}
                          ref={(element) => { retailerRefs.current[index] = element }}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => setSelectedStoreId(store.retailerId)}
                          onKeyDown={(event) => retailerKeyDown(event, index)}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-xl border bg-background px-4 py-3.5 text-left hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected && "border-[1.5px] border-primary bg-accent/40 hover:border-primary",
                          )}
                        >
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {storeName(store)}
                            {best && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary-foreground">Cheapest</span>}
                          </span>
                          <span className={cn("text-xl font-bold tracking-tight tabular-nums", selected && "text-primary")}>{formatCents(store.totalCents)}</span>
                          <span className={cn("text-xs text-muted-foreground", !store.complete && "font-medium text-amber-700 dark:text-amber-300")}>{retailerNote(store, cheapest!)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {cheapest && !cheapest.complete && (
                  <p className="mb-[18px] flex gap-2 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />No single store has a price for every item yet. Totals only include the items each store prices.
                  </p>
                )}

                {swappable > 0 && !noteDismissed && (
                  <div className="mb-[18px] flex items-start gap-3 rounded-[10px] bg-accent px-4 py-3.5">
                    <p className="flex-1 text-[13px] leading-relaxed text-accent-foreground">
                      <strong>{plural(swappable, "item")} {swappable === 1 ? "has" : "have"} a Healthier Choice alternative.</strong> Tap <strong>Swap for healthier</strong> under an item to compare and swap.
                    </p>
                    <button type="button" className="grid size-6 place-items-center rounded-md text-accent-foreground hover:bg-background/60" onClick={() => setNoteDismissed(true)} aria-label="Dismiss note"><X className="size-3.5" /></button>
                  </div>
                )}

                <ul aria-label="Basket items" aria-live="polite">
                  {basket.map((item) => {
                    const product = catalog.get(item.productId)!
                    const line = selectedStore?.lines.find((entry) => entry.productId === item.productId)
                    const options = alternatives.get(item.productId) ?? []
                    const swapOpen = swapOpenFor === item.productId && options.length > 0
                    return (
                      <li key={item.productId} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <ProductImage url={product.imageUrl} name={product.name} onExpired={refreshImages} className="size-12 shrink-0 rounded-lg object-contain" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug">{product.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{product.brand} · {packLabel(product)}</p>
                            </div>
                          </div>
                          <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
                            {line ? formatCents(line.subtotalCents) : <span className="text-xs font-medium text-muted-foreground">{comparing || !selectedStore ? "…" : "No price"}</span>}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          {product.hcs && <HcsBadge />}
                          {options.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={swapOpen}
                              onClick={() => setSwapOpenFor(swapOpen ? null : item.productId)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-foreground hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Leaf className="size-[15px]" />Swap for healthier
                              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{options.length}</span>
                            </button>
                          )}
                          <div className="order-last flex items-center overflow-hidden rounded-lg border bg-background">
                            <button type="button" className="grid size-9 place-items-center text-muted-foreground hover:bg-secondary" onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label={item.quantity === 1 ? `Remove ${product.name}` : `Decrease ${product.name}`}>
                              {item.quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${product.name} quantity`}>{item.quantity}</span>
                            <button type="button" className="grid size-9 place-items-center text-muted-foreground hover:bg-secondary disabled:opacity-50" disabled={item.quantity >= MAX_QUANTITY} onClick={() => setQuantity(item.productId, item.quantity + 1)} aria-label={`Increase ${product.name}`}>
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        {swapOpen && (
                          <ul className="mt-3 flex flex-col gap-2 rounded-[10px] bg-accent/40 p-3" aria-label={`Healthier alternatives to ${product.name}`}>
                            {options.map((option) => (
                              <li key={option.id} className="flex items-center gap-3">
                                <ProductImage url={option.imageUrl} name={option.name} onExpired={refreshImages} className="size-10 shrink-0 rounded-md object-contain" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] font-semibold leading-snug">{option.name}</p>
                                  <p className="text-xs text-muted-foreground">{option.brand} · {packLabel(option)}</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" className="rounded-lg border-primary text-[13px] font-semibold text-primary hover:bg-accent" onClick={() => swapProduct(item.productId, option.id)} aria-label={`Swap ${product.name} for ${option.name}`}>Swap</Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="pt-[18px]">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {selectedStore
                        ? `${selectedStore.complete ? "Total" : "Total for priced items"} at ${storeName(selectedStore)}${selectedStore.rank === 1 ? " · cheapest" : ""}`
                        : comparing ? "Comparing store prices…" : "No store prices yet"}
                    </p>
                    <p className="text-2xl font-bold tracking-tight text-primary tabular-nums">{selectedStore ? formatCents(selectedStore.totalCents) : "—"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{hcsCount} of {plural(basket.length, "item")} {hcsCount === 1 ? "is" : "are"} Healthier Choice.</p>
                </div>
              </>
            )}
          </Card>

          <Card aria-labelledby="per-item-heading">
            <h2 id="per-item-heading" className="mb-1 text-lg font-semibold tracking-tight">Price per item</h2>
            <p className="text-[13px] text-muted-foreground">Line totals for each product · lowest price highlighted</p>
            {basket.length === 0 || stores.length === 0 ? (
              <p className="mt-4 rounded-[10px] border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
                {basket.length ? (comparing ? "Comparing store prices…" : "No store prices yet") : "Add items to compare prices at each store."}
              </p>
            ) : (
              <ul className="mt-3.5">
                {basket.map((item) => {
                  const product = catalog.get(item.productId)!
                  const cells = stores.map((store) => ({ store, subtotal: store.lines.find((line) => line.productId === item.productId)?.subtotalCents ?? null }))
                  const priced = cells.flatMap((cell) => (cell.subtotal === null ? [] : [cell.subtotal]))
                  const lowest = priced.length ? Math.min(...priced) : null
                  return (
                    <li key={item.productId} className="border-t border-border/60 py-3.5 last:pb-0">
                      <p className="mb-2 text-[13px] font-semibold leading-snug">{product.name} <span className="font-medium text-muted-foreground">× {item.quantity}</span></p>
                      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(stores.length, 3)}, minmax(0, 1fr))` }}>
                        {cells.map(({ store, subtotal }) => {
                          const best = subtotal !== null && subtotal === lowest
                          return (
                            <div key={store.retailerId} className={cn("flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background px-2 py-1.5", best && "border-primary bg-accent/40")}>
                              <span className="truncate text-[11px] text-muted-foreground">{storeName(store)}</span>
                              <span className={cn("text-[13px] font-semibold tabular-nums", best && "text-accent-foreground", subtotal === null && "font-medium text-muted-foreground")}>
                                {subtotal === null ? "No price" : formatCents(subtotal)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
