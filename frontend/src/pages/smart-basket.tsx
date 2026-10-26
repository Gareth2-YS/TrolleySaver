import {
  AlertTriangle,
  BadgeCheck,
  ChartColumn,
  ClipboardList,
  LoaderCircle,
  Minus,
  PiggyBank,
  Plus,
  Search,
  ShoppingBasket,
  Store,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { FormAlert } from "../components/auth/form-alert"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { createBasketService, loadBasket, saveBasket } from "../basket/service"
import type { BasketItem, BasketResult, BasketSaving, BasketService, BasketStore, Product } from "../basket/types"
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

function PanelHeading({ icon: Icon, title, description, children }: { icon: typeof Store; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" /></span>
        <div><h2 className="text-xl font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div>
      </div>
      {children}
    </div>
  )
}

function HcsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
      <BadgeCheck className="size-3" />Healthier Choice
    </span>
  )
}

function CoverageText({ store }: { store: BasketStore }) {
  return (
    <span className={cn("text-xs", store.complete ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-300")}>
      {store.pricedCount} priced · {store.missingCount} missing
    </span>
  )
}

function SavingCard({ saving, recommendedName }: { saving: BasketSaving; recommendedName: string }) {
  const name = saving.retailerName ?? saving.retailerId
  const partial = saving.basis === "common-items"
  const amount = saving.savingsCents
  return (
    <article className="rounded-xl border bg-card/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs text-muted-foreground">Instead of buying everything at</span>
          <h3 className="font-semibold">{name}</h3>
        </div>
        {partial && <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Partial</span>}
      </div>
      {amount === null ? (
        <p className="mt-4 text-sm text-muted-foreground">No items are priced at both stores, so they can't be compared yet.</p>
      ) : (
        <>
          <p className={cn("mt-4 text-2xl font-semibold tabular-nums", amount > 0 ? "text-primary" : amount < 0 ? "text-destructive" : "")}>
            <span>{amount > 0 ? `Save ${formatCents(amount)}` : amount < 0 ? `${formatCents(-amount)} more` : "Same price"}</span>
            {amount !== 0 && saving.savingsPercent !== null && <span className="ml-2 text-xs font-medium text-muted-foreground">{Math.abs(saving.savingsPercent)}%</span>}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-secondary/55 p-3 text-xs">
            <div><dt className="text-muted-foreground">{name}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCents(saving.otherTotalCents!)}</dd></div>
            <div><dt className="text-muted-foreground">{recommendedName}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCents(saving.recommendedTotalCents!)}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {partial ? `Compared on the ${saving.comparedLines} ${saving.comparedLines === 1 ? "item" : "items"} both stores price.` : "Compared on your whole basket."}
          </p>
        </>
      )}
    </article>
  )
}

export function SmartBasketPage({ serviceOverride }: { serviceOverride?: BasketService }) {
  const [service] = useState(() => serviceOverride ?? createBasketService())
  const [products, setProducts] = useState<Product[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [items, setItems] = useState<BasketItem[]>(loadBasket)
  const [query, setQuery] = useState("")
  // The last comparison that came back, and which basket it was for, so edits in flight can show as "updating".
  const [result, setResult] = useState<BasketResult | null>(null)
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    service.listProducts()
      .then((loaded) => { if (active) setProducts(loaded) })
      .catch((error) => { if (active) setCatalogError(error instanceof Error ? error.message : "Could not load the product catalog.") })
      .finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [service])

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

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return products.filter((product) => {
      const text = `${product.name} ${product.brand} ${product.category}`.toLowerCase()
      return terms.every((term) => text.includes(term))
    })
  }, [products, query])

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

  const comparison = basket.length ? result?.basket ?? null : null
  const recommendation = comparison?.recommendation ?? null
  const cheapest = comparison?.stores[0]
  const selectedStore = comparison?.stores.find((store) => store.retailerId === selectedStoreId) ?? cheapest
  const recommendedName = recommendation?.retailerName ?? recommendation?.retailerId ?? ""
  const packCount = basket.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <AppShell>
      <div className="space-y-6 sm:space-y-8">
        <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="pb-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Public workspace</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Smart basket comparison</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Build your grocery list once and see what the whole basket costs at each supermarket, and how much you save by choosing the cheapest one.
            </p>
          </div>
          <aside className="glass-panel flex items-center justify-between p-5">
            <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><PiggyBank className="size-6" /></span>
            <div className="text-right">
              <strong className="block text-3xl font-semibold tabular-nums">
                {comparison?.maxSavingsCents ? formatCents(comparison.maxSavingsCents) : "—"}
              </strong>
              <span className="text-xs text-muted-foreground">Potential savings, up to</span>
            </div>
          </aside>
        </header>

        <FormAlert message={catalogError ?? compareError} />

        <div className="grid items-start gap-5 lg:grid-cols-12">
          <section className="glass-panel p-5 sm:p-7 lg:col-span-7">
            <PanelHeading icon={ShoppingBasket} title="Your basket" description={`${basket.length} ${basket.length === 1 ? "product" : "products"} · ${packCount} ${packCount === 1 ? "pack" : "packs"}`}>
              {basket.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setItems([])}><Trash2 className="size-4" />Clear</Button>}
            </PanelHeading>

            <div className="mt-6 space-y-2">
              <Label htmlFor="product-search">Add groceries</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="product-search" ref={searchRef} className="pl-9" placeholder="Search by product, brand or category" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            <ul className="mt-3 max-h-64 divide-y overflow-y-auto rounded-xl border bg-card/35" aria-label="Products">
              {catalogLoading ? (
                <li className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading products…</li>
              ) : matches.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">{catalogError ? "Products are unavailable." : `No products match “${query.trim()}”.`}</li>
              ) : matches.map((product) => {
                const inBasket = basket.find((item) => item.productId === product.id)
                return (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs capitalize text-muted-foreground">
                        <span className="normal-case">{product.brand} · {packLabel(product)}</span><span>· {product.category}</span>
                        {product.hcs && <HcsBadge />}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addProduct(product.id)} aria-label={`Add ${product.name}`}>
                      <Plus className="size-4" />{inBasket ? `Add (${inBasket.quantity})` : "Add"}
                    </Button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 border-t border-border/70 pt-2" aria-live="polite">
              {basket.length === 0 ? (
                <div className="py-10 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-xl bg-accent text-primary"><ShoppingBasket className="size-7" /></span>
                  <h3 className="mt-4 font-semibold">Your basket is empty</h3>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Add groceries above to compare the full basket total at every supermarket.</p>
                  <Button type="button" className="mt-5" onClick={() => searchRef.current?.focus()}><Search className="size-4" />Browse groceries</Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {basket.map((item) => {
                    const product = catalog.get(item.productId)!
                    const line = cheapest?.lines.find((entry) => entry.productId === item.productId)
                    return (
                      <li key={item.productId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_88px]">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug">{product.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{product.brand} · {packLabel(product)}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border bg-card/60 p-1">
                          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label={item.quantity === 1 ? `Remove ${product.name}` : `Decrease ${product.name}`}>
                            {item.quantity === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                          </Button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-label={`${product.name} quantity`}>{item.quantity}</span>
                          <Button type="button" variant="ghost" size="icon" className="size-8" disabled={item.quantity >= MAX_QUANTITY} onClick={() => setQuantity(item.productId, item.quantity + 1)} aria-label={`Increase ${product.name}`}>
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        <span className="col-span-2 text-right text-sm font-semibold tabular-nums sm:col-span-1">
                          {line ? formatCents(line.subtotalCents) : <span className="text-xs font-medium text-muted-foreground">{comparing ? "…" : "No price"}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-7 lg:col-span-5">
            <PanelHeading icon={Store} title="Price comparison" description="Whole-basket total at each supermarket">
              {comparing && <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-label="Updating prices" />}
            </PanelHeading>
            {!comparison ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-muted-foreground">{basket.length ? "Comparing store prices…" : "Store totals will appear once products are added."}</p>
                {[78, 64, 52].map((width) => <div key={width} className="h-12 rounded-xl bg-secondary/60" style={{ width: `${width}%` }} />)}
              </div>
            ) : (
              <>
                {recommendation && !recommendation.complete && (
                  <p className="mt-5 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />No single store has a price for every item yet. Totals only include the items each store prices.
                  </p>
                )}
                <ol className="mt-5 space-y-3">
                  {comparison.stores.map((store) => {
                    const selected = store.retailerId === selectedStore?.retailerId
                    const best = store.rank === 1 && store.pricedCount > 0
                    const difference = store.totalCents - (cheapest?.totalCents ?? 0)
                    return (
                      <li key={store.retailerId}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedStoreId(store.retailerId)}
                          className={cn(
                            "w-full rounded-xl border bg-card/45 p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected && "border-primary/60 bg-accent/50",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{store.retailerName ?? store.retailerId}</strong>
                                {best && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Cheapest</span>}
                              </div>
                              <CoverageText store={store} />
                            </div>
                            <div className="text-right">
                              <strong className="block text-xl font-semibold tabular-nums">{formatCents(store.totalCents)}</strong>
                              {!best && store.complete && cheapest?.complete && difference > 0 && <span className="text-xs text-muted-foreground">+{formatCents(difference)}</span>}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
          </section>
        </div>

        <section className="glass-panel p-5 sm:p-7">
          <PanelHeading icon={ChartColumn} title="Savings by supermarket" description="What you save by choosing the cheapest store instead of buying the whole basket elsewhere" />
          {!comparison || !recommendation ? (
            <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
              <PiggyBank className="mx-auto size-7 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">{comparison ? "No prices found yet" : "Add items to calculate your savings"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{comparison ? "None of these products has a recent price at any store. We're working on it." : "Savings are worked out against every supermarket in the comparison."}</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,.8fr)_minmax(0,2fr)]">
              <article className="rounded-xl border border-primary/40 bg-accent/50 p-5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Best single store</span>
                <h3 className="mt-2 text-2xl font-semibold">{recommendedName}</h3>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">{formatCents(recommendation.totalCents)}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {recommendation.complete ? "Prices your whole basket." : "Prices the most items, but not all of them."} Prices observed in the last {result!.priceMaxAgeDays} days.
                </p>
              </article>
              {comparison.savings.length === 0 ? (
                <p className="self-center text-sm text-muted-foreground">Only one store is in the comparison, so there's nothing to compare against.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {comparison.savings.map((saving) => <SavingCard key={saving.retailerId} saving={saving} recommendedName={recommendedName} />)}
                </div>
              )}
            </div>
          )}
        </section>

        {selectedStore && selectedStore.pricedCount + selectedStore.missingCount > 0 && (
          <section className="glass-panel p-5 sm:p-7">
            <PanelHeading icon={ClipboardList} title={`Shopping list · ${selectedStore.retailerName ?? selectedStore.retailerId}`} description="Choose a store in the price comparison to see its list">
              <span className="w-fit shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{selectedStore.pricedCount} priced · {selectedStore.missingCount} missing</span>
            </PanelHeading>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-3 pr-3 font-medium">Item</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Unit price</th>
                    <th className="py-3 pl-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedStore.lines.map((line) => (
                    <tr key={line.productId}>
                      <td className="py-3 pr-3"><span className="font-medium">{line.productName}</span><span className="block text-xs text-muted-foreground">{packLabel(line)}</span></td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCents(line.unitPriceCents)}</td>
                      <td className="py-3 pl-3 text-right font-semibold tabular-nums">{formatCents(line.subtotalCents)}</td>
                    </tr>
                  ))}
                  {selectedStore.unpriced.map((item) => (
                    <tr key={item.productId} className="text-muted-foreground">
                      <td className="py-3 pr-3"><span className="font-medium">{item.productName ?? item.productId}</span></td>
                      <td colSpan={3} className="py-3 pl-3 text-right text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" />No price found, working on it</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="py-3 pr-3 text-right text-xs text-muted-foreground">{selectedStore.complete ? "Basket total" : "Total for priced items"}</td>
                    <td className="py-3 pl-3 text-right text-lg font-semibold tabular-nums">{formatCents(selectedStore.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  )
}
