import { CalendarDays, Image, ImageOff, LoaderCircle, RefreshCw, Store, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useAuth } from "../../auth/auth-context"
import { SubmissionServiceError } from "../../contributions/service"
import type { PriceSubmission, ProductRequest, SubmissionService } from "../../contributions/types"
import { getCategoryIcon } from "../../lib/category-icons"
import { formatCents, formatDay, formatDollars, formatTimestamp } from "../../lib/format"
import { cn } from "../../lib/utils"
import { FormAlert } from "../auth/form-alert"
import { EnlargeableImage } from "../enlargeable-image"
import { ProductImage } from "../product-image"
import { Button } from "../ui/button"
import { PriceStatusBadge, RequestStatusBadge } from "./status-badge"

type Filter = "all" | "price" | "new"
type Entry = { kind: "price"; at: string; item: PriceSubmission } | { kind: "new"; at: string; item: ProductRequest }

const FILTERS: [Filter, string][] = [["all", "All"], ["price", "Prices"], ["new", "New products"]]
const EMPTY: Record<Filter, string> = {
  all: "Prices and new products you send will appear here.",
  price: "Prices you send for products on TrolleySaver will appear here.",
  new: "New products you add will appear here while an admin checks them.",
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Could not complete the request. Please retry."
}

function packLabel(item: ProductRequest) {
  const size = `${item.packQty} ${item.packUnit}`
  return item.packCount > 1 ? `${item.packCount} × ${size}` : size
}

function Thumb({ children }: { children?: ReactNode }) {
  return children ?? <span className="product-tile grid size-12 place-items-center text-muted-foreground sm:size-14"><Image aria-hidden="true" className="size-5" /></span>
}

function Row({ thumb, name, kind, meta, photo, price, badge, after }: { thumb: ReactNode; name: string; kind: "price" | "new"; meta: ReactNode[]; photo?: ReactNode; price: string; badge: ReactNode; after?: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t py-4 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="row-span-2 sm:row-span-1">{thumb}</div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-base font-extrabold leading-snug">{name}</h3>
          <span className={cn("whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold", kind === "new" ? "border-primary/40 bg-accent/60 text-accent-foreground" : "text-muted-foreground")}>
            {kind === "new" ? "New product" : "Price"}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">{meta}</div>
        {photo}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
        <span className="font-display text-xl font-extrabold tabular-nums text-primary">{price}</span>
        {badge}
      </div>
      {after && <div className="col-span-2 sm:col-span-2 sm:col-start-2 sm:col-end-4">{after}</div>}
    </li>
  )
}

// The price photo the contributor sent, as a thumbnail that enlarges like the pictures on Search.
function YourPhoto({ url, name, onExpired }: { url: string; name: string; onExpired: () => void }) {
  return (
    <div className="flex items-center gap-2.5 pt-1.5">
      <EnlargeableImage url={url} name={name} onExpired={onExpired} className="size-11 object-cover p-0" />
      <span className="text-xs text-muted-foreground">Your price photo</span>
    </div>
  )
}

function Meta({ icon: Icon, children }: { icon?: typeof Store; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{Icon && <Icon aria-hidden="true" className="size-3.5" />}{children}</span>
}

/**
 * Everything the contributor has sent, prices and new products in one list, newest first.
 * Price submissions come from the page (it adds new ones as they are sent); product requests are loaded here.
 */
export function YourSubmissions({ service, priceSubmissions, pricesLoading, refreshPrices, onPriceDeleted, categoryOf, refreshKey }: {
  service: SubmissionService
  priceSubmissions: PriceSubmission[]
  pricesLoading: boolean
  refreshPrices: () => Promise<void>
  onPriceDeleted: (id: string) => void
  categoryOf: (productId: string) => string | undefined
  refreshKey: number
}) {
  const { user, getAccessToken } = useAuth()
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  // True until the first list arrives, and while any refresh is in flight.
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [pricesRefreshing, setPricesRefreshing] = useState(false)
  const loadsInFlight = useRef(0)
  const historyVersion = useRef(0)

  const load = useCallback(async (message: string | null = null) => {
    const version = ++historyVersion.current
    loadsInFlight.current += 1
    setRequestsLoading(true)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      const records = await service.listMyProductRequests(user.id, token)
      if (version === historyVersion.current) { setRequests(records); setError(message) }
    } catch (e) { if (version === historyVersion.current) setError(message ? `${message} Could not refresh the list: ${errorText(e)}` : errorText(e)) }
    finally {
      loadsInFlight.current -= 1
      if (loadsInFlight.current === 0) setRequestsLoading(false)
    }
  }, [service, user, getAccessToken])

  useEffect(() => { async function fetchHistory() { await load() } void fetchHistory() }, [load, refreshKey])

  async function refresh() {
    setPricesRefreshing(true)
    try {
      await Promise.all([load(), refreshPrices().catch((e) => setError(`Could not refresh your price submissions: ${errorText(e)}`))])
    } finally { setPricesRefreshing(false) }
  }

  async function deletePending(id: string) {
    if (deletingId || !window.confirm("Delete this request? Its product picture and price evidence photo will be removed too. This cannot be undone.")) return
    ++historyVersion.current
    setDeletingId(id); setError(null)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      await service.deleteProductRequest(id, { id: user.id, role: user.role }, token)
      ++historyVersion.current
      setRequests((current) => current.filter((item) => item.id !== id))
    } catch (e) {
      if (e instanceof SubmissionServiceError && ((e.status === 404 && e.code === "NOT_FOUND") || (e.status === 409 && e.code === "ALREADY_MODERATED"))) {
        await load(e.code === "NOT_FOUND" ? "This request no longer exists." : errorText(e))
      } else setError(errorText(e))
    } finally { setDeletingId(null) }
  }

  // Only a pending (flagged) price can be withdrawn: an admin hasn't decided it yet.
  async function deletePendingPrice(submission: PriceSubmission) {
    if (deletingId || !user || !window.confirm("Delete this price submission? Its photo will be removed too. This cannot be undone.")) return
    setDeletingId(submission.id); setError(null)
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
      await service.deleteSubmission(submission.id, { id: user.id, role: user.role }, token)
      onPriceDeleted(submission.id)
    } catch (e) {
      if (e instanceof SubmissionServiceError && (e.code === "NOT_FOUND" || e.code === "ALREADY_MODERATED")) {
        await refreshPrices().catch(() => undefined)
        setError(e.code === "NOT_FOUND" ? "This submission no longer exists." : e.message)
      } else setError(e instanceof Error ? e.message : "The submission could not be deleted.")
    } finally { setDeletingId(null) }
  }

  const entries: Entry[] = [
    ...priceSubmissions.map((item): Entry => ({ kind: "price", at: item.submittedAt, item })),
    ...requests.map((item): Entry => ({ kind: "new", at: item.submittedAt, item })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const counts: Record<Filter, number> = { all: entries.length, price: priceSubmissions.length, new: requests.length }
  const shown = entries.filter((entry) => filter === "all" || entry.kind === filter)
  const busy = requestsLoading || pricesLoading || pricesRefreshing
  const firstLoad = entries.length === 0 && busy

  return (
    <section className="surface-card min-w-0 space-y-4 p-5 sm:p-7" aria-label="Your submissions" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2.5 font-display text-xl font-extrabold">
          Your submissions
          {!firstLoad && <span className="font-sans text-sm font-semibold tabular-nums text-muted-foreground">{entries.length}</span>}
        </h2>
        <Button variant="outline" size="sm" disabled={deletingId !== null || busy} onClick={() => void refresh()}>
          <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === value && "bg-card text-foreground shadow-sm ring-1 ring-border",
              )}
            >
              {label}<span className="font-medium tabular-nums text-muted-foreground">{counts[value]}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Newest first</span>
      </div>

      <FormAlert message={error} />

      {firstLoad ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />Loading your submissions…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="font-semibold">Nothing here yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">{EMPTY[filter]}</p>
        </div>
      ) : (
        <ul className={cn("transition-opacity", busy && "opacity-60")}>
          {shown.map((entry) => {
            if (entry.kind === "price") {
              const item = entry.item
              const icon = getCategoryIcon(categoryOf(item.productId))
              return (
                <Row
                  key={`price-${item.id}`}
                  kind="price"
                  name={item.productName}
                  thumb={<Thumb>{icon && <img src={icon} alt="" className="product-tile size-12 sm:size-14" />}</Thumb>}
                  meta={[
                    <Meta key="store" icon={Store}>{item.storeName}</Meta>,
                    <Meta key="seen" icon={CalendarDays}>Seen {formatDay(item.observedDate)}</Meta>,
                    item.photo ? (item.photo.previewUrl ? null : <Meta key="photo" icon={Image}>Photo attached</Meta>) : <Meta key="photo" icon={ImageOff}>No photo</Meta>,
                    <Meta key="sent">Sent {formatTimestamp(item.submittedAt)}</Meta>,
                  ]}
                  photo={item.photo?.previewUrl && <YourPhoto url={item.photo.previewUrl} name={`Price evidence for ${item.productName}`} onExpired={() => { if (item.photo?.storage === "private-s3") void refreshPrices().catch(() => undefined) }} />}
                  price={formatDollars(item.price)}
                  badge={<PriceStatusBadge status={item.status} />}
                  after={
                    item.rejectionReason ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><strong>Rejection reason:</strong> {item.rejectionReason}</p>
                    : item.status === "flagged" ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">This price is unusual, so an admin checks it first.</p>
                        <Button variant="ghost" size="sm" disabled={deletingId !== null} onClick={() => void deletePendingPrice(item)}>
                          <Trash2 className="size-4" aria-hidden="true" />{deletingId === item.id ? "Deleting…" : "Delete price"}
                        </Button>
                      </div>
                    )
                    : null
                  }
                />
              )
            }
            const item = entry.item
            return (
              <Row
                key={`new-${item.id}`}
                kind="new"
                name={item.name}
                thumb={<Thumb><ProductImage url={item.productImageUrl} fallback={getCategoryIcon(item.category)} name={`Product picture for ${item.name}`} className="product-tile size-12 sm:size-14" onExpired={() => void load()} /></Thumb>}
                meta={[
                  <Meta key="pack">{packLabel(item)}</Meta>,
                  <Meta key="store" icon={Store}>{item.retailerName ?? item.retailerId}</Meta>,
                  <Meta key="seen" icon={CalendarDays}>Seen {formatDay(item.observedAt)}</Meta>,
                  item.photoKey && !item.photoUrl ? <Meta key="photo" icon={Image}>Photo attached</Meta> : null,
                  <Meta key="sent">Sent {formatTimestamp(item.submittedAt)}</Meta>,
                ]}
                photo={item.photoUrl && <YourPhoto url={item.photoUrl} name={`Price evidence for ${item.name}`} onExpired={() => void load()} />}
                price={formatCents(item.priceCents)}
                badge={<RequestStatusBadge status={item.status} />}
                after={
                  item.rejectionReason ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><strong>Rejection reason:</strong> {item.rejectionReason}</p>
                  : item.status === "pending" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">An admin checks the pack picture and details first.</p>
                      <Button variant="ghost" size="sm" disabled={deletingId !== null} onClick={() => void deletePending(item.id)}>
                        <Trash2 className="size-4" aria-hidden="true" />{deletingId === item.id ? "Deleting…" : "Delete request"}
                      </Button>
                    </div>
                  )
                  : item.status === "approved" ? <p className="text-sm text-muted-foreground">Added to the catalog. Reload Search or Smart Basket to see it; its price shows after the nightly update.</p>
                  : null
                }
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
