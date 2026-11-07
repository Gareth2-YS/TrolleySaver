import { ProductImage } from "../components/product-image"
import {
  AlertTriangle,
  BadgeCheck,
  Leaf,
  LoaderCircle,
  Minus,
  PiggyBank,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, type KeyboardEvent, useState, type ReactNode } from "react"
import { FormAlert } from "../components/auth/form-alert"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { FacetSelect } from "../components/facet-select"
import { countBy, facetOptions, type FacetOption } from "../lib/facets"
import { HcsBadge } from "../components/hcs-badge"
import { PageHeader } from "../components/layout/page-header"
import { usePageTitle } from "../lib/use-page-title"
import { createBasketService } from "../basket/service"
import { useBasketItems, type BasketItems } from "../basket/use-basket-items"
import type { BasketItem, BasketResult, BasketService, BasketStore, Product } from "../basket/types"
import { getCategoryIcon } from "../lib/category-icons"
import { formatCents, packLabel } from "../lib/format"
import { cn } from "../lib/utils"

const MAX_QUANTITY = 99
const COMPARE_DELAY_MS = 300
// The backend's MAX_BASKET_LINES: a compare request holding more products is rejected.
const COMPARE_MAX_LINES = 50

// One swap, recorded so it can be undone. `added` is what a merge actually added after the quantity cap,
// and `toQuantity` the swapped-in line's quantity right after the swap.
interface SwapRecord { fromId: string; fromQuantity: number; fromIndex: number; merged: boolean; added: number; toQuantity: number }

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

function storeName(store: { retailerId: string; retailerName: string | null }) {
  return store.retailerName ?? store.retailerId
}

function Card({ className, children, ...props }: { className?: string; children: ReactNode; "aria-labelledby"?: string; "aria-label"?: string }) {
  return <section className={cn("surface-card p-5 sm:p-6", className)} {...props}>{children}</section>
}

function CardTitle({ id, icon: Icon, title, description }: { id: string; icon: typeof Search; title: string; description: string }) {
  return (
    <div className="min-w-0">
      <h2 id={id} className="flex items-center gap-2.5 font-display text-[22px] font-extrabold tracking-tight">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary"><Icon className="size-5" /></span>{title}
      </h2>
      <p className="pl-[46px] text-[13px] text-muted-foreground">{description}</p>
    </div>
  )
}

function Filter({ id, label, value, options, allLabel, onChange }: { id: string; label: string; value: string; options: FacetOption[]; allLabel: string; onChange: (value: string) => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[220px] sm:basis-[170px]">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <FacetSelect id={id} value={value} options={options} allLabel={allLabel} onChange={onChange} className="capitalize" />
    </div>
  )
}

function ZoomableImage({ product, onOpen, onExpired, className }: { product: Product; onOpen: (productId: string) => void; onExpired: () => void; className: string }) {
  const categoryIcon = getCategoryIcon(product.category)
  // No photo: the category icon, like Search, or an empty box of the same size, so rows stay lined up.
  if (!product.imageUrl) {
    return categoryIcon
      ? <img src={categoryIcon} alt="" aria-hidden="true" className={cn("product-tile", className)} />
      : <span aria-hidden="true" className={cn("product-tile inline-block", className)} />
  }
  return (
    <button
      type="button"
      className="shrink-0 cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Enlarge image of ${product.name}`}
      title="Click to enlarge image"
      onClick={() => onOpen(product.id)}
    >
      <ProductImage url={product.imageUrl} fallback={categoryIcon} name={product.name} onExpired={onExpired} className={cn("product-tile", className)} />
    </button>
  )
}

// Price per 100 g or 100 ml, so packs of different sizes compare fairly. Null for units that don't convert.
function per100(product: Product, cents: number) {
  // Products added through requests can come back from the API without a pack unit.
  const unit = (product.packUnit ?? "").toLowerCase()
  const scale = unit === "kg" || unit === "l" ? 1000 : unit === "g" || unit === "ml" ? 1 : null
  if (scale === null || !product.packQty) return null
  return { cents: (cents * 100) / (product.packQty * scale * (product.packCount ?? 1)), unit: unit === "kg" || unit === "g" ? "g" : "ml" }
}

function per100Label(product: Product, cents: number | null) {
  const value = cents === null ? null : per100(product, cents)
  return value ? `${formatCents(Math.round(value.cents))} / 100${value.unit}` : ""
}

function differenceLabel(cents: number) {
  return cents === 0 ? "Same price" : cents > 0 ? `+${formatCents(cents)}` : `Save ${formatCents(-cents)}`
}

type SwapSort = "price" | "unit"

function HealthierChoices({ product, quantity, options, store, cheapest, optionStores, sort, onSort, onSwap, onOpenImage, onExpired, onClose }: {
  product: Product
  quantity: number
  options: Product[]
  store: BasketStore | undefined
  cheapest: boolean
  // undefined while the options' prices load; null if they could not be loaded.
  optionStores: BasketStore[] | null | undefined
  sort: SwapSort
  onSort: (sort: SwapSort) => void
  onSwap: (toId: string) => void
  onOpenImage: (productId: string) => void
  onExpired: () => void
  onClose: () => void
}) {
  const loading = optionStores === undefined
  const known = Boolean(store && optionStores)
  const fromCents = store?.lines.find((line) => line.productId === product.id)?.unitPriceCents ?? null
  const optionStore = optionStores?.find((entry) => entry.retailerId === store?.retailerId)
  const unitValue = (option: Product, cents: number | null) => (cents === null ? null : per100(option, cents)?.cents ?? null)
  // Unpriced options go last; ties fall back to the name so the order stays put.
  const ranked = options
    .map((option) => ({ option, cents: optionStore?.lines.find((line) => line.productId === option.id)?.unitPriceCents ?? null }))
    .sort((a, b) => {
      if ((a.cents === null) !== (b.cents === null)) return a.cents === null ? 1 : -1
      const key = (entry: typeof a) => (sort === "unit" ? unitValue(entry.option, entry.cents) ?? Infinity : entry.cents ?? 0)
      return (key(a) === key(b) ? 0 : key(a) - key(b)) || a.option.name.localeCompare(b.option.name)
    })
  const where = store ? storeName(store) : "your store"

  return (
    <>
      <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Leaf className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="swap-title" className="font-display text-xl font-extrabold leading-snug">Healthier choices</h2>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{product.category}{store && ` · prices at ${storeName(store)}`}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Close" onClick={onClose}><X className="size-[18px]" /></Button>
      </div>

      <div className="mx-6 flex items-center justify-between gap-3 rounded-xl bg-secondary px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ZoomableImage product={product} onOpen={onOpenImage} onExpired={onExpired} className="size-10" />
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">In your basket</span>
            <p className="mt-0.5 text-sm font-semibold leading-snug">{product.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{product.brand} · {packLabel(product)}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">{fromCents === null ? (store ? "No price" : "—") : formatCents(fromCents)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{per100Label(product, fromCents)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-2 pt-4">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          {plural(options.length, "Healthier Choice option")}
          {loading && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading prices" />}
        </p>
        <div role="group" aria-label="Sort recommendations" className="flex gap-0.5 rounded-lg bg-secondary p-[3px]">
          {([["price", "Lowest price"], ["unit", "Best unit price"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => onSort(value)}
              className={cn(
                "h-[30px] rounded-md px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sort === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol aria-label="Healthier Choice options" className="flex min-h-0 flex-col gap-2 overflow-y-auto px-6">
        {ranked.map(({ option, cents }, index) => {
          const top = index === 0 && (sort === "unit" ? unitValue(option, cents) !== null : cents !== null)
          const unpriced = known && cents === null
          const difference = cents === null || fromCents === null ? null : cents - fromCents
          return (
            <li key={option.id} className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3", top && "border-primary/45 bg-accent/50")}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
              <ZoomableImage product={option} onOpen={onOpenImage} onExpired={onExpired} className="size-10" />
              <div className="min-w-0 flex-1">
                {/* The badge sits on its own line so moving it between rows on a re-sort never rewraps a name. */}
                {top && <span className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{sort === "unit" ? "Best value" : "Cheapest"}</span>}
                <p className="text-sm font-semibold leading-snug">{option.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.brand} · {packLabel(option)}
                  {unpriced ? ` · No price at ${where}` : cents !== null && per100Label(option, cents) ? ` · ${per100Label(option, cents)}` : ""}
                </p>
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className="font-display text-base font-extrabold tabular-nums">{cents !== null ? formatCents(cents) : loading ? "…" : "—"}</p>
                {difference !== null && <p className={cn("text-xs font-semibold tabular-nums", difference < 0 ? "text-primary" : "text-muted-foreground")}>{differenceLabel(difference)}</p>}
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-lg px-3.5 text-[13px] font-semibold"
                disabled={loading || unpriced}
                onClick={() => onSwap(option.id)}
                aria-label={`Swap ${product.name} for ${option.name}`}
              >
                Swap
              </Button>
            </li>
          )
        })}
      </ol>

      <p className="px-6 pb-5 pt-4 text-xs text-muted-foreground">
        {optionStores === null
          ? "Prices for these options could not be loaded. "
          : store ? `Prices per pack at ${storeName(store)}${cheapest ? ", your cheapest store" : ""}. ` : ""}
        Your quantity (×{quantity}) carries over when you swap.
      </p>
    </>
  )
}

function retailerNote(store: BasketStore, cheapest: BasketStore) {
  if (store.retailerId === cheapest.retailerId && store.pricedCount > 0) return store.complete ? "Lowest total" : `${store.pricedCount} priced · ${store.missingCount} missing`
  if (!store.complete || !cheapest.complete) return `${store.pricedCount} priced · ${store.missingCount} missing`
  const difference = store.totalCents - cheapest.totalCents
  return difference > 0 ? `+${formatCents(difference)} more` : "Same total"
}

export function SmartBasketPage({ serviceOverride }: { serviceOverride?: BasketService }) {
  const basketItems = useBasketItems()
  // Prices, swaps and store choices belong to one account's basket, so signing in or out starts the page afresh.
  return <SmartBasketView key={basketItems.generation} serviceOverride={serviceOverride} basketItems={basketItems} />
}

function SmartBasketView({ serviceOverride, basketItems }: { serviceOverride?: BasketService; basketItems: BasketItems }) {
  usePageTitle("Smart basket")
  const [service] = useState(() => serviceOverride ?? createBasketService())
  const [products, setProducts] = useState<Product[]>([])
  const [imageRevision, setImageRevision] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const { items, setItems, save: saveBasket } = basketItems
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [brand, setBrand] = useState("")
  // The last comparison that came back, and which basket it was for, so edits in flight can show as "updating".
  const [result, setResult] = useState<BasketResult | null>(null)
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [swapOpenFor, setSwapOpenFor] = useState<string | null>(null)
  const [swapSort, setSwapSort] = useState<SwapSort>("price")
  // Prices for the open swap's options; a line's own comparison only prices what is in the basket.
  const [optionPrices, setOptionPrices] = useState<{ forId: string; stores: BasketStore[] | null } | null>(null)
  // Swaps into each product, oldest first, so they can be undone one at a time.
  const [swaps, setSwaps] = useState<Record<string, SwapRecord[]>>({})
  const [toastFor, setToastFor] = useState<string | null>(null)
  const [noteDismissed, setNoteDismissed] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewRef = useRef<HTMLDialogElement>(null)
  const swapRef = useRef<HTMLDialogElement>(null)
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
  // Looked up from the catalog so a refreshed (re-signed) image link reaches the open preview too.
  const previewProduct = previewId ? catalog.get(previewId) : undefined

  useEffect(() => {
    const dialog = previewRef.current
    if (previewProduct && dialog && !dialog.open) dialog.showModal()
  }, [previewProduct])
  // Saved lines for products no longer in the catalog are dropped once it loads.
  const basket = useMemo(() => (catalogLoading ? [] : items.filter((item) => catalog.has(item.productId))), [catalog, catalogLoading, items])
  const basketKey = JSON.stringify(basket)

  // Only save once the catalog has loaded, so a failed load can't wipe the saved basket.
  useEffect(() => { if (!catalogLoading && !catalogError) saveBasket(basket) }, [basket, catalogError, catalogLoading, saveBasket])

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

  const textMatches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return products.filter((product) => terms.every((term) => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(term)))
  }, [products, query])
  // Like Search: each list only offers what the search and the other filter leave, so either can go first.
  const typeOptions = useMemo(
    () => facetOptions(countBy(textMatches.filter((product) => !brand || product.brand === brand), (product) => product.category), category),
    [brand, category, textMatches],
  )
  const brandOptions = useMemo(
    () => facetOptions(countBy(textMatches.filter((product) => !category || product.category === category), (product) => product.brand), brand),
    [brand, category, textMatches],
  )
  const matches = useMemo(
    () => textMatches.filter((product) => (!category || product.category === category) && (!brand || product.brand === brand)),
    [brand, category, textMatches],
  )
  const filtered = Boolean(category || brand)

  function resetFilters() {
    setCategory("")
    setBrand("")
  }

  function clearSearchAndFilters() {
    setQuery("")
    resetFilters()
  }

  // Like the backend's healthier basket: a non-HCS product can swap for any HCS product in its category.
  const alternatives = useMemo(() => {
    const byProduct = new Map<string, Product[]>()
    for (const item of basket) {
      const product = catalog.get(item.productId)!
      if (!product.hcs) byProduct.set(product.id, products.filter((other) => other.hcs && other.category === product.category && other.id !== product.id))
    }
    return byProduct
  }, [basket, catalog, products])

  const swapOptions = swapOpenFor ? alternatives.get(swapOpenFor) ?? [] : []
  const swapOptionsKey = swapOptions.map((option) => option.id).join(",")

  useEffect(() => {
    if (!swapOpenFor || !swapOptionsKey) return
    let active = true
    const ids = swapOptionsKey.split(",")
    const chunks = Array.from({ length: Math.ceil(ids.length / COMPARE_MAX_LINES) }, (_, index) => ids.slice(index * COMPARE_MAX_LINES, (index + 1) * COMPARE_MAX_LINES))
    // Only the per-store lines are used, so chunked results merge by store.
    Promise.all(chunks.map((chunk) => service.compare(chunk.map((productId) => ({ productId, quantity: 1 })))))
      .then((results) => {
        const byStore = new Map<string, BasketStore>()
        for (const store of results.flatMap((next) => next.basket.stores)) {
          const seen = byStore.get(store.retailerId)
          byStore.set(store.retailerId, seen ? { ...seen, lines: [...seen.lines, ...store.lines] } : store)
        }
        if (active) setOptionPrices({ forId: swapOpenFor, stores: [...byStore.values()] })
      })
      .catch(() => { if (active) setOptionPrices({ forId: swapOpenFor, stores: null }) })
    return () => { active = false }
  }, [service, swapOpenFor, swapOptionsKey])

  useEffect(() => {
    const dialog = swapRef.current
    if (!dialog) return
    if (swapOpenFor && swapOptionsKey && !dialog.open) dialog.showModal()
    if (!(swapOpenFor && swapOptionsKey) && dialog.open) dialog.close()
  }, [swapOpenFor, swapOptionsKey])

  function openSwap(productId: string) {
    setSwapSort("price")
    // Drop prices from an earlier open so the dialog shows as loading until the fresh ones arrive.
    setOptionPrices(null)
    setSwapOpenFor(productId)
  }

  function forgetSwap(productId: string) {
    setSwaps((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
    setToastFor((current) => (current === productId ? null : current))
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity < 1) forgetSwap(productId)
    setItems((current) => quantity < 1
      ? current.filter((item) => item.productId !== productId)
      : current.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY) } : item)))
  }

  function addProduct(productId: string) {
    setItems((current) => current.some((item) => item.productId === productId)
      ? current.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) } : item))
      : [...current, { productId, quantity: 1 }])
  }

  // Each swap keeps its line's place and quantity; if the alternative is already in the basket the two merge.
  // Several swaps (the healthier basket's button) apply one after another, each recorded so it can be undone.
  function swapProducts(pairs: [fromId: string, toId: string][]) {
    let working = items
    const records: [string, SwapRecord][] = []
    for (const [fromId, toId] of pairs) {
      const fromIndex = working.findIndex((item) => item.productId === fromId)
      if (fromIndex < 0) continue
      const from = working[fromIndex]
      const existing = working.find((item) => item.productId === toId)
      const toQuantity = existing ? Math.min(existing.quantity + from.quantity, MAX_QUANTITY) : from.quantity
      records.push([toId, {
        fromId,
        fromQuantity: from.quantity,
        fromIndex,
        merged: Boolean(existing),
        added: existing ? toQuantity - existing.quantity : from.quantity,
        toQuantity,
      }])
      working = working
        .filter((item) => !(existing && item.productId === fromId))
        .map((item) => item.productId === (existing ? toId : fromId) ? { productId: toId, quantity: toQuantity } : item)
    }
    setSwapOpenFor(null)
    if (!records.length) return
    setItems(working)
    setSwaps((current) => {
      const next = { ...current }
      for (const [toId, record] of records) next[toId] = [...(next[toId] ?? []), record]
      return next
    })
    setToastFor(records[records.length - 1][0])
  }

  function swapProduct(fromId: string, toId: string) { swapProducts([[fromId, toId]]) }

  // Undoes the latest swap into a product. An ordinary swap puts the original back in place of the line,
  // keeping its current quantity. A merge takes back only what it added and restores the original line,
  // at its old position, with the quantity it had.
  function undoSwap(toId: string) {
    const records = swaps[toId] ?? []
    const swap = undoableSwap(toId)
    if (!swap) return
    setItems((current) => {
      const to = current.find((item) => item.productId === toId)
      if (!to) return current
      if (!swap.merged) return current.map((item) => (item.productId === toId ? { productId: swap.fromId, quantity: item.quantity } : item))
      const kept = to.quantity - swap.added
      const rest = current.flatMap((item) => (item.productId !== toId ? [item] : kept >= 1 ? [{ productId: toId, quantity: kept }] : []))
      const at = Math.min(swap.fromIndex, rest.length)
      return [...rest.slice(0, at), { productId: swap.fromId, quantity: swap.fromQuantity }, ...rest.slice(at)]
    })
    // An ordinary swap removes the line the earlier swaps went into, so their records go with it.
    if (!swap.merged) forgetSwap(toId)
    else {
      setSwaps((current) => ({ ...current, [toId]: records.slice(0, -1) }))
      setToastFor((current) => (current === toId ? null : current))
    }
  }

  // Undo is only offered while the original isn't back in the basket some other way. A merged line's
  // quantity mixes what was there with what the swap added, so once it is edited the merge can't be split back.
  function undoableSwap(toId: string) {
    const records = swaps[toId] ?? []
    const swap = records[records.length - 1]
    const to = basket.find((item) => item.productId === toId)
    if (!swap || !to || basket.some((item) => item.productId === swap.fromId)) return undefined
    return swap.merged && to.quantity !== swap.toQuantity ? undefined : swap
  }

  const comparison = basket.length ? result?.basket ?? null : null
  const stores = comparison?.stores ?? []
  const cheapest = stores[0]
  const selectedStore = stores.find((store) => store.retailerId === selectedStoreId) ?? cheapest
  const packCount = basket.reduce((sum, item) => sum + item.quantity, 0)
  const hcsCount = basket.filter((item) => catalog.get(item.productId)?.hcs).length
  const swappable = [...alternatives.values()].filter((options) => options.length > 0).length
  // The savings tile: the largest full-basket saving and the two stores it is between.
  const maxSavingsCents = comparison?.maxSavingsCents ?? null
  const bestSaving = maxSavingsCents
    ? comparison?.savings.find((saving) => saving.basis === "full-basket" && saving.savingsCents === maxSavingsCents) ?? null
    : null
  const recommendation = comparison?.recommendation ?? null
  // The healthier basket's best store, and the swaps it makes there that can still be applied to this basket.
  const healthier = basket.length ? result?.healthierBasket ?? null : null
  const healthierStore = healthier?.recommendation
    ? healthier.stores.find((store) => store.retailerId === healthier.recommendation!.retailerId)
    : undefined
  const healthierPairs: [string, string][] = (healthierStore?.lines ?? []).flatMap((line) =>
    line.replacesProductId && basket.some((item) => item.productId === line.replacesProductId) && catalog.has(line.productId)
      ? [[line.replacesProductId, line.productId] as [string, string]] : [])
  const alreadyHealthier = healthier?.swaps.filter((swap) => swap.status === "already-hcs").length ?? 0
  const healthierExtra = basket.length ? result?.healthierExtra ?? null : null

  const savingsMessage = !basket.length ? "Add groceries to see what you could save."
    : !comparison ? (comparing ? "Comparing store prices…" : "No savings to show yet.")
    : maxSavingsCents === 0 ? "Every store charges the same for this basket."
    : "Savings show once two stores price every item."

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
        <PageHeader
          title="Smart basket comparison"
          description="Build your grocery list once and see what the whole basket costs at each supermarket, and how much you save by choosing the cheapest one."
        >
          <aside className="surface-card flex flex-[1_1_260px] items-center gap-4 px-6 py-5">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-primary"><PiggyBank className="size-7" /></span>
            <div aria-live="polite">
              {maxSavingsCents && bestSaving && recommendation ? (
                <>
                  <p className="text-[13px] font-medium text-muted-foreground">Save up to</p>
                  <p className="my-1.5 font-display text-[36px] font-extrabold leading-none tracking-tight text-primary tabular-nums">{formatCents(maxSavingsCents)}</p>
                  <p className="text-[13px] text-muted-foreground">at {storeName(recommendation)} instead of {storeName(bestSaving)}</p>
                </>
              ) : (
                <p className="text-[14px] leading-relaxed text-muted-foreground">{savingsMessage}</p>
              )}
            </div>
          </aside>
        </PageHeader>

        <FormAlert message={catalogError ?? compareError} />

        {/* Desktop: search spans the top; the basket and price-per-item card sit side by side below it. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="lg:col-span-2" aria-labelledby="add-heading">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-[1_1_240px]"><CardTitle id="add-heading" icon={ShoppingBag} title="Add groceries" description="Search the catalog and add items to your basket" /></div>
              <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:flex-[0_1_560px] sm:justify-end">
                <Filter id="basket-type-filter" label="Product type" value={category} options={typeOptions} allLabel="All product types" onChange={setCategory} />
                <Filter id="basket-brand-filter" label="Brand" value={brand} options={brandOptions} allLabel="All brands" onChange={setBrand} />
                <Button type="button" variant="ghost" className="h-11 shrink-0 self-start px-3 text-[13px] sm:mt-[26px]" disabled={!filtered} onClick={resetFilters}><RotateCcw className="size-4" />Reset filters</Button>
              </div>
            </div>

            <label className="sr-only" htmlFor="product-search">Search groceries</label>
            <div className="relative my-[18px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                ref={searchRef}
                type="search"
                maxLength={100}
                className="h-12 pl-[42px] text-base"
                placeholder="Search by product, brand or category"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {/* The list scrolls: a fade at the bottom edge and a count underneath say there's more. */}
            <div className="relative">
            <ul className="flex max-h-[300px] flex-col gap-2.5 overflow-y-auto overscroll-contain pb-10 pr-1.5 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label="Products">
              {catalogLoading ? (
                <li className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading products…</li>
              ) : matches.length === 0 ? (
                <li className="rounded-[10px] border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
                  {catalogError ? "Products are unavailable." : query.trim() ? `No products match “${query.trim()}”.` : "No products match these filters."}
                  {!catalogError && (filtered || query.trim()) && <Button type="button" variant="outline" size="sm" className="ml-3 mt-2 sm:mt-0" onClick={clearSearchAndFilters}>Clear search and filters</Button>}
                </li>
              ) : matches.map((product) => {
                const inBasket = basket.find((item) => item.productId === product.id)
                return (
                  <li key={product.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-background/60 px-4 py-3">
                    <div className="flex min-w-0 flex-[999_1_200px] items-center gap-3">
                      <ZoomableImage product={product} onOpen={setPreviewId} onExpired={refreshImages} className="size-12" />
                      <div className="min-w-0">
                      <p className="mb-1 text-sm font-semibold leading-snug">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.brand} · {packLabel(product)} · {product.category}</p>
                      {/* Under the details, as on Search, so names start level with the picture on every row */}
                      {product.hcs && <HcsBadge className="mt-1.5 border border-primary/35" />}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={inBasket ? "default" : "outline"}
                      className={cn("h-11 px-[18px] text-[13px]", !inBasket && "border-primary text-primary hover:bg-accent")}
                      onClick={() => addProduct(product.id)}
                      aria-label={`Add ${product.name}`}
                    >
                      {inBasket ? `Add (${inBasket.quantity})` : "Add"}
                    </Button>
                  </li>
                )
              })}
            </ul>
            {matches.length > 3 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-card/0 to-card" />}
            </div>
            {!catalogLoading && matches.length > 0 && (
              <p className="mt-2 text-center text-[13px] text-muted-foreground">
                {plural(matches.length, "product")}{matches.length > 3 ? " · scroll the list for more" : ""}
              </p>
            )}
          </Card>

          <Card aria-labelledby="basket-heading">
            <div className="mb-[18px] flex items-start gap-4">
              <div className="flex-1"><CardTitle id="basket-heading" icon={ShoppingBasket} title="Your basket" description={`${plural(basket.length, "product")} · ${plural(packCount, "pack")}`} /></div>
              {basket.length > 0 && <Button type="button" variant="outline" size="sm" className="rounded-lg text-[13px] font-semibold text-muted-foreground" onClick={() => { setItems([]); setSwaps({}); setToastFor(null) }}>Reset</Button>}
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
                            "flex flex-col items-start gap-1 rounded-2xl border bg-card px-4 py-3.5 text-left hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected && "border-2 border-primary bg-accent px-[15px] py-[13px] hover:border-primary",
                          )}
                        >
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {storeName(store)}
                            {best && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary-foreground">Cheapest</span>}
                          </span>
                          <span className={cn("font-display text-2xl font-extrabold tracking-tight tabular-nums", selected && "text-accent-foreground")}>{formatCents(store.totalCents)}</span>
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

                {healthier && healthierPairs.length > 0 && (
                  <div role="group" aria-labelledby="healthier-heading" className="mb-[18px] flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-dashed border-primary/45 bg-accent/40 px-4 py-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Leaf className="size-5" /></span>
                    <div className="min-w-0 flex-[1_1_240px]">
                      <p id="healthier-heading" className="font-semibold">Healthier basket at {healthierStore ? storeName(healthierStore) : "the best store"}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        Swaps in {healthierPairs.map(([, toId]) => catalog.get(toId)!.name).join(", ")}.
                        {alreadyHealthier > 0 && ` ${plural(alreadyHealthier, "item")} ${alreadyHealthier === 1 ? "is" : "are"} already Healthier Choice.`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-[22px] font-extrabold leading-tight text-accent-foreground tabular-nums">
                        {formatCents(healthierExtra?.healthierTotalCents ?? healthierStore?.totalCents ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {!healthierExtra ? "Not every store prices the swaps yet"
                          : healthierExtra.extraCents > 0 ? `${formatCents(healthierExtra.extraCents)} more (${healthierExtra.extraPercent}%)`
                          : healthierExtra.extraCents < 0 ? `${formatCents(-healthierExtra.extraCents)} less`
                          : "Same as your basket"}
                      </p>
                    </div>
                    <Button type="button" variant="outline" className="border-primary text-accent-foreground hover:bg-accent" onClick={() => swapProducts(healthierPairs)}>
                      Swap {plural(healthierPairs.length, "item")}
                    </Button>
                  </div>
                )}

                {swappable > 0 && !noteDismissed && (
                  <div role="note" className="mb-[18px] flex items-start gap-3 rounded-[10px] bg-accent px-4 py-3.5">
                    <Leaf className="mt-0.5 size-[18px] shrink-0 text-accent-foreground" />
                    <p className="flex-1 text-[13px] leading-relaxed text-accent-foreground">
                      <strong>{plural(swappable, "item")} {swappable === 1 ? "has" : "have"} a Healthier Choice alternative.</strong> Tap <strong>Healthier options</strong> under an item to compare and swap.
                    </p>
                    <button type="button" className="grid size-6 place-items-center rounded-md text-accent-foreground hover:bg-background/60" onClick={() => setNoteDismissed(true)} aria-label="Dismiss note"><X className="size-3.5" /></button>
                  </div>
                )}

                <ul aria-label="Basket items" aria-live="polite">
                  {basket.map((item) => {
                    const product = catalog.get(item.productId)!
                    const line = selectedStore?.lines.find((entry) => entry.productId === item.productId)
                    const options = alternatives.get(item.productId) ?? []
                    const swap = undoableSwap(item.productId)
                    const swappedFrom = swap ? catalog.get(swap.fromId) : undefined
                    return (
                      <li key={item.productId} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <ZoomableImage product={product} onOpen={setPreviewId} onExpired={refreshImages} className="size-12" />
                            <div className="min-w-0">
                              <p className="font-display text-base font-extrabold leading-snug">{product.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{product.brand} · {packLabel(product)}</p>
                            </div>
                          </div>
                          <p className="whitespace-nowrap font-display text-lg font-extrabold tabular-nums">
                            {line ? formatCents(line.subtotalCents) : <span className="text-xs font-medium text-muted-foreground">{comparing || !selectedStore ? "…" : "No price"}</span>}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          {product.hcs && <HcsBadge />}
                          {options.length > 0 && (
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              onClick={() => openSwap(item.productId)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/35 bg-accent/60 px-2.5 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Leaf className="size-3.5" />Healthier options ({options.length})
                            </button>
                          )}
                          <div className="order-last flex items-center gap-2">
                            <div className="flex items-center overflow-hidden rounded-lg border bg-background">
                              <button type="button" className="grid size-9 place-items-center text-muted-foreground hover:bg-secondary disabled:opacity-50" disabled={item.quantity <= 1} onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label={`Decrease ${product.name}`}>
                                <Minus className="size-3.5" />
                              </button>
                              <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${product.name} quantity`}>{item.quantity}</span>
                              <button type="button" className="grid size-9 place-items-center text-muted-foreground hover:bg-secondary disabled:opacity-50" disabled={item.quantity >= MAX_QUANTITY} onClick={() => setQuantity(item.productId, item.quantity + 1)} aria-label={`Increase ${product.name}`}>
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                            {/* The whole line, however many there are */}
                            <button type="button" className="grid size-9 place-items-center rounded-lg border bg-background text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setQuantity(item.productId, 0)} aria-label={`Remove ${product.name} from basket`} title="Remove from basket">
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {swappedFrom && (
                          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>Swapped from {swappedFrom.name}</span>
                            <button type="button" className="py-0.5 font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => undoSwap(item.productId)} aria-label={`Undo swap back to ${swappedFrom.name}`}>Undo</button>
                          </p>
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
                    <p className="font-display text-[26px] font-extrabold tracking-tight text-primary tabular-nums">{selectedStore ? formatCents(selectedStore.totalCents) : "—"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{hcsCount} of {plural(basket.length, "item")} {hcsCount === 1 ? "is" : "are"} Healthier Choice.</p>
                </div>
              </>
            )}
          </Card>

          <Card aria-labelledby="per-item-heading">
            <h2 id="per-item-heading" className="mb-1 font-display text-xl font-extrabold tracking-tight">Price per item</h2>
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

      <dialog
        ref={swapRef}
        aria-labelledby="swap-title"
        className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[600px] flex-col overflow-hidden rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-sm open:flex"
        onClose={() => setSwapOpenFor(null)}
        onClick={(event) => { if (event.target === swapRef.current) swapRef.current?.close() }}
      >
        {swapOpenFor && swapOptions.length > 0 && (() => {
          const item = basket.find((entry) => entry.productId === swapOpenFor)
          const product = catalog.get(swapOpenFor)
          if (!item || !product) return null
          return (
            <HealthierChoices
              product={product}
              quantity={item.quantity}
              options={swapOptions}
              store={selectedStore}
              cheapest={Boolean(selectedStore && selectedStore.retailerId === cheapest?.retailerId)}
              optionStores={optionPrices?.forId === swapOpenFor ? optionPrices.stores : undefined}
              sort={swapSort}
              onSort={setSwapSort}
              onSwap={(toId) => swapProduct(swapOpenFor, toId)}
              onOpenImage={setPreviewId}
              onExpired={refreshImages}
              onClose={() => swapRef.current?.close()}
            />
          )
        })()}
      </dialog>

      {toastFor && catalog.get(toastFor) && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground py-2.5 pl-4 pr-2.5 text-[13px] text-background shadow-2xl">
          <BadgeCheck className="size-4 shrink-0" />
          <span>Swapped to {catalog.get(toastFor)!.name}</span>
          {undoableSwap(toastFor) && (
            <button type="button" className="h-[30px] rounded-md bg-background/15 px-2.5 text-xs font-semibold hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => undoSwap(toastFor)}>Undo</button>
          )}
          <button type="button" className="grid size-[30px] place-items-center rounded-md hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setToastFor(null)} aria-label="Dismiss"><X className="size-3.5" /></button>
        </div>
      )}

      <dialog
        ref={previewRef}
        aria-label={previewProduct ? `Enlarged image of ${previewProduct.name}` : "Enlarged image"}
        className="max-h-[95vh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-2xl backdrop:bg-black/75"
        onClose={() => setPreviewId(null)}
        onClick={(event) => { if (event.target === previewRef.current) previewRef.current?.close() }}
      >
        {previewProduct && (
          <>
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="truncate font-medium">{previewProduct.name}</p>
              <Button type="button" variant="ghost" size="icon" aria-label={`Close enlarged image of ${previewProduct.name}`} onClick={() => previewRef.current?.close()}>
                <X className="size-4" />
              </Button>
            </div>
            <ProductImage url={previewProduct.imageUrl} fallback={getCategoryIcon(previewProduct.category)} name={previewProduct.name} onExpired={refreshImages} className="mx-auto max-h-[82vh] max-w-full rounded-lg bg-white object-contain" />
          </>
        )}
      </dialog>
    </AppShell>
  )
}
