import { LoaderCircle, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useAuth } from "../auth/auth-context"
import { FormAlert } from "../components/auth/form-alert"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { ProductImage } from "../components/product-image"
import { prepareImage } from "../contributions/image"
import { contributionSchema, earliestObservedDate, packUnits, productCorrectionsSchema, productFieldsSchema, reasonError, singaporeDateString, validationMessages } from "../contributions/schema"
import { SubmissionServiceError } from "../contributions/service"
import type { CatalogRetailer, ProductCorrections, ProductFields, ProductRequest, ProductRequestStatus, SubmissionService } from "../contributions/types"
import { formatCents, limitToCents } from "../lib/format"
import { inputClass } from "../lib/styles"
import { cn } from "../lib/utils"
import { Select } from "../components/ui/select"
import hcsSymbol from "../../assets/brand/healthier-choice-symbol.png"

const emptyProduct: ProductFields = { name: "", brand: "", category: "", packQty: 0, packUnit: "ml", packCount: 1, hcs: false, dietary: [] }
type Facets = { categories: string[]; dietary: string[] }
function errorText(error: unknown) {
  if (error instanceof SubmissionServiceError && error.fieldErrors) return `${error.message} ${Object.entries(error.fieldErrors).map(([field, message]) => `${field}: ${message}`).join("; ")}`
  return error instanceof Error ? error.message : "Could not complete the request. Please retry."
}

function ProductEditor({ value, onChange, facets, prefix }: { value: ProductFields; onChange: (value: ProductFields) => void; facets: Facets; prefix: string }) {
  function set<K extends keyof ProductFields>(key: K, next: ProductFields[K]) { onChange({ ...value, [key]: next }) }
  const tags = [...new Set([...facets.dietary, ...value.dietary])]
  return <div className="grid gap-5 sm:grid-cols-2">
    {([['name', 'Product name', 120], ['brand', 'Brand', 60], ['category', 'Category', 40]] as const).map(([field, label, max]) => <div key={field} className="space-y-2">
      <Label htmlFor={`${prefix}-${field}`}>{label}</Label>
      <Input id={`${prefix}-${field}`} value={value[field]} required minLength={field === "name" ? 2 : 1} maxLength={max} list={field === "category" ? `${prefix}-categories` : undefined} onChange={(e) => set(field, e.target.value)} />
    </div>)}
    <datalist id={`${prefix}-categories`}>{facets.categories.map((category) => <option key={category} value={category} />)}</datalist>
    <div className="space-y-2"><Label htmlFor={`${prefix}-qty`}>Pack quantity</Label><Input id={`${prefix}-qty`} type="number" step="any" min="0.001" max="100000" required value={value.packQty || ""} onChange={(e) => set("packQty", Number(e.target.value))} /></div>
    <div className="space-y-2"><Label htmlFor={`${prefix}-unit`}>Pack unit</Label><Select id={`${prefix}-unit`} value={value.packUnit} onChange={(e) => set("packUnit", e.target.value as ProductFields["packUnit"])}>{packUnits.map((unit) => <option key={unit}>{unit}</option>)}</Select></div>
    <div className="space-y-2"><Label htmlFor={`${prefix}-count`}>Units per pack</Label><Input id={`${prefix}-count`} type="number" min="1" max="100" step="1" required value={value.packCount || ""} onChange={(e) => set("packCount", Number(e.target.value))} /></div>
    <section className="space-y-4 rounded-xl border bg-accent/30 p-5 sm:col-span-2" aria-label="Product labels">
      <h3 className="font-display text-lg font-extrabold">Does it have any of these labels?</h3>
      {/* The symbol itself, so contributors can match it to the pack. Decorative: the text names the checkbox. */}
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={value.hcs} onChange={(e) => set("hcs", e.target.checked)} /><img src={hcsSymbol} alt="" aria-hidden="true" className="size-11 shrink-0" />Healthier Choice Symbol</label>
      <p className="text-sm text-muted-foreground">Select only claims shown on the packaging. Unselected dietary tags are not suitability advice. Claims will be reviewed by an administrator.</p>
      <div className="grid gap-3 sm:grid-cols-2">{tags.map((tag) => <label key={tag} className="flex min-h-12 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={value.dietary.includes(tag)} disabled={value.dietary.length >= 5 && !value.dietary.includes(tag)} onChange={(e) => set("dietary", e.target.checked ? [...value.dietary, tag] : value.dietary.filter((t) => t !== tag))} />{tag}</label>)}</div>
      <p className="text-sm text-muted-foreground">Choose up to five dietary tags.</p>
    </section>
  </div>
}

function ImagePicker({ label, file, onChange, id }: { label: string; file: File | null; onChange: (file: File | null) => void; id: string }) {
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const field = event.target
    const next = field.files?.[0] ?? null
    // Checked, and redrawn without its metadata (e.g. GPS location), before anything is uploaded.
    setPreparing(Boolean(next))
    const prepared = next ? await prepareImage(next) : null
    setPreparing(false)
    const chosen = prepared?.file ?? null
    setError(prepared?.error ?? null); onChange(chosen)
    setPreview(chosen ? URL.createObjectURL(chosen) : undefined)
    if (prepared?.error) field.value = ""
  }
  return <div className="space-y-3 rounded-xl border p-4">
    <Label htmlFor={id}>{label}</Label><p id={`${id}-help`} className="text-sm text-muted-foreground">JPG or PNG · Up to 5 MB</p>
    <Input ref={input} id={id} type="file" accept="image/jpeg,image/png" aria-describedby={`${id}-help`} disabled={preparing} onChange={select} />
    {preparing && <p className="text-sm text-muted-foreground" aria-live="polite">Preparing image…</p>}
    {preview && <img src={preview} alt={`Selected ${label.toLowerCase()} preview`} className="max-h-64 w-full rounded-lg object-contain" />}
    {file && <Button type="button" variant="outline" onClick={() => { onChange(null); setPreview(undefined); if (input.current) input.current.value = "" }}>Remove {label.toLowerCase()}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function ProductRequestForm({ service, onDone, onExisting }: { service: SubmissionService; onDone: () => void; onExisting: (id: string) => Promise<void> }) {
  const { user, getAccessToken } = useAuth()
  const [product, setProduct] = useState(emptyProduct)
  const [facets, setFacets] = useState<Facets>({ categories: [], dietary: [] })
  const [stores, setStores] = useState<CatalogRetailer[]>([])
  const [storeId, setStoreId] = useState("")
  const [price, setPrice] = useState("")
  const [date, setDate] = useState(singaporeDateString())
  const [picture, setPicture] = useState<File | null>(null)
  const [evidence, setEvidence] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([service.listFacets(), service.listRetailers()]).then(([f, r]) => { if (active) { setFacets(f); setStores(r); setReady(true) } }).catch((e) => { if (active) setError(errorText(e)) })
    return () => { active = false }
  }, [service])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setExistingId(undefined)
    const fields = productFieldsSchema.safeParse(product)
    const contribution = contributionSchema.safeParse({ productId: "new", storeId, price, observedDate: date })
    if (!fields.success) { setError(validationMessages(fields.error.issues)); return }
    if (!contribution.success) { setError(validationMessages(contribution.error.issues)); return }
    if (!picture) { setError("A product picture is required for every new product."); return }
    setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token || !user) throw new Error("Sign in again and retry.")
      const target = await service.requestProductImageUpload(picture, "product-image", token)
      await service.uploadImage(target, picture)
      let photoKey: string | undefined
      if (evidence) {
        const photo = await service.requestProductImageUpload(evidence, "evidence", token)
        await service.uploadImage(photo, evidence); photoKey = photo.photoKey
      }
      await service.createProductRequest({ ...fields.data, retailerId: storeId, priceCents: Math.round(Number(price) * 100), observedAt: date, productImageKey: target.photoKey, ...(photoKey ? { photoKey } : {}) }, user.id, token)
      onDone()
    } catch (e) {
      setError(errorText(e))
      if (e instanceof SubmissionServiceError && e.code === "PRODUCT_EXISTS") setExistingId(e.productId)
    } finally { setBusy(false) }
  }
  return <form onSubmit={submit} noValidate className="space-y-6">
    <p className="text-base text-muted-foreground">Share the product details and a clear packaging picture. An administrator reviews each new find before it joins the catalog. Its price becomes available after nightly aggregation.</p>
    <FormAlert message={error} />
    {existingId && <Button type="button" variant="outline" disabled={busy} onClick={() => { setBusy(true); void onExisting(existingId).catch((e) => setError(errorText(e))).finally(() => setBusy(false)) }}>Submit a price for this product instead</Button>}
    <fieldset disabled={busy || !ready} className="space-y-6">
      <ProductEditor value={product} onChange={setProduct} facets={facets} prefix="new-product" />
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="request-store">Store</Label><Select id="request-store" value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Choose a store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="request-price">Price (SGD)</Label><Input id="request-price" type="number" min="0.01" max="1000" step="0.01" value={price} onChange={(e) => setPrice(limitToCents(e.target.value))} /></div>
        <div className="space-y-2"><Label htmlFor="request-date">Observed date</Label><Input id="request-date" type="date" min={earliestObservedDate()} max={singaporeDateString()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="grid gap-5 md:grid-cols-2"><ImagePicker id="product-picture" label="Product picture (required)" file={picture} onChange={setPicture} /><ImagePicker id="request-evidence" label="Price evidence (optional)" file={evidence} onChange={setEvidence} /></div>
      <Button type="submit">{busy ? "Saving…" : "Submit new product for review"}</Button>
    </fieldset>
  </form>
}

// The product picture and, if one was attached, the price evidence photo. Admins and the request's
// own contributor get a link to the evidence; without one, the card just says it's there.
function RequestImages({ item, refresh }: { item: ProductRequest; refresh: () => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <ProductImage url={item.productImageUrl} name={`Product picture for ${item.name}`} className="max-h-64 w-full rounded-lg object-contain" onExpired={refresh} />
    {item.photoKey && (item.photoUrl ? <ProductImage url={item.photoUrl} name={`Price evidence for ${item.name}`} className="max-h-64 w-full rounded-lg object-contain" onExpired={refresh} /> : <p className="rounded-xl border p-4 text-sm">Photo attached</p>)}
  </div>
}

export function ProductRequestHistory({ service, refreshKey }: { service: SubmissionService; refreshKey: boolean }) {
  const { user, getAccessToken } = useAuth()
  const [items, setItems] = useState<ProductRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // True until the first list arrives, and while any refresh is in flight.
  const [loading, setLoading] = useState(true)
  const loadsInFlight = useRef(0)
  const historyVersion = useRef(0)
  const load = useCallback(async (message: string | null = null) => {
    const version = ++historyVersion.current
    loadsInFlight.current += 1
    setLoading(true)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      const records = await service.listMyProductRequests(user.id, token)
      if (version === historyVersion.current) { setItems(records); setError(message) }
    } catch (e) { if (version === historyVersion.current) setError(message ? `${message} Could not refresh the list: ${errorText(e)}` : errorText(e)) }
    finally {
      loadsInFlight.current -= 1
      if (loadsInFlight.current === 0) setLoading(false)
    }
  }, [service, user, getAccessToken])
  async function deletePending(id: string) {
    if (deletingId || !window.confirm("Delete this request? Its product picture and price evidence photo will be removed too. This cannot be undone.")) return
    ++historyVersion.current
    setDeletingId(id); setError(null)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      await service.deleteProductRequest(id, { id: user.id, role: user.role }, token)
      ++historyVersion.current
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (e) {
      if (e instanceof SubmissionServiceError && ((e.status === 404 && e.code === "NOT_FOUND") || (e.status === 409 && e.code === "ALREADY_MODERATED"))) {
        await load(e.code === "NOT_FOUND" ? "This request no longer exists." : errorText(e))
      } else setError(errorText(e))
    } finally { setDeletingId(null) }
  }
  useEffect(() => { async function fetchHistory() { await load() } void fetchHistory() }, [load, refreshKey])
  return <section className="surface-card space-y-5 p-5 sm:p-7" aria-label="Your product submissions" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-extrabold">Your product submissions</h2><Button variant="outline" disabled={deletingId !== null || loading} onClick={() => void load()}><RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />Refresh product submissions</Button></div>
    <FormAlert message={error} />
    {items.length === 0 && (loading
      ? <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />Loading your product submissions…</p>
      : <p className="text-sm text-muted-foreground">New product submissions will appear here.</p>)}
    <div className={cn("grid gap-4 transition-opacity", loading && items.length > 0 && "opacity-60")}>{items.map((item) => <article key={item.id} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-display font-extrabold">{item.name} · <span className="capitalize">{item.status}</span></h3>
      <p>{item.brand} · {item.packCount} × {item.packQty} {item.packUnit} · {item.retailerName ?? item.retailerId} · {formatCents(item.priceCents)}</p>
      <RequestImages item={item} refresh={() => void load()} />
      {item.rejectionReason && <p>Rejection reason: {item.rejectionReason}</p>}
      {item.status === "pending" && <Button variant="outline" disabled={deletingId !== null} onClick={() => void deletePending(item.id)}>{deletingId === item.id ? "Deleting…" : "Delete pending product request"}</Button>}
      {item.status === "approved" && <p className="text-sm">Added to the catalog. Public prices update after nightly aggregation; reload Search or Smart Basket to see the product.</p>}
    </article>)}</div>
  </section>
}

function RequestReviewCard({ item, service, facets, refresh, notify }: { item: ProductRequest; service: SubmissionService; facets: Facets; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const { user, getAccessToken } = useAuth()
  const [fields, setFields] = useState<ProductFields>(item)
  const [min, setMin] = useState(item.suggestedMinCents ?? 1)
  const [max, setMax] = useState(item.suggestedMaxCents ?? 100000)
  const [terms, setTerms] = useState("")
  const [checked, setChecked] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function decide(decision: "approved" | "rejected") {
    setError(null)
    let changes: ProductCorrections | undefined
    if (decision === "approved") {
      if (!checked) return
      const result = productCorrectionsSchema.safeParse({ ...fields, minCents: min, maxCents: max, searchTerms: terms.trim() ? terms.split(",").map((s) => s.trim()) : [] })
      if (!result.success) { setError(validationMessages(result.error.issues)); return }
      changes = result.data
    } else if (!reason.trim() || reason.trim().length > 500) { setError("Enter a reason of 1–500 characters before rejecting."); return }
    else if (reasonError(reason)) { setError(reasonError(reason)); return }
    setBusy(true)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      await service.moderateProductRequest(item.id, decision, reason, changes, { id: user.id, role: user.role }, token)
      await refresh()
    } catch (e) {
      setError(errorText(e))
      if (e instanceof SubmissionServiceError && e.code === "ALREADY_MODERATED") { await refresh(); notify(errorText(e)) }
    } finally { setBusy(false) }
  }
  return <article className="space-y-5 rounded-xl border p-5">
    <h3 className="font-display text-lg font-extrabold">{item.name} · {item.status}</h3>
    <p className="text-sm">{item.submitterName ?? item.userId} {item.submitterEmail} · {item.retailerName ?? item.retailerId} · {formatCents(item.priceCents)} · observed {singaporeDateString(new Date(item.observedAt))}</p>
    <RequestImages item={item} refresh={() => void refresh()} />
    <FormAlert message={error} />
    {item.rejectionReason && <p>Rejection reason: {item.rejectionReason}</p>}
    {item.status === "pending" && <fieldset disabled={busy} className="space-y-5">
      <ProductEditor value={fields} onChange={setFields} facets={facets} prefix={`review-${item.id}`} />
      <p className="text-sm text-muted-foreground">Suggested range: {item.suggestedMinCents}–{item.suggestedMaxCents} cents. Review this range before approval; it applies across stores.</p>
      <div className="grid gap-4 sm:grid-cols-2">{([["Minimum cents", min, setMin], ["Maximum cents", max, setMax]] as const).map(([label, value, set]) => <label key={label} className="space-y-2">{label}<Input type="number" min="1" max="100000" step="1" value={value || ""} onChange={(e) => set(Number(e.target.value))} /></label>)}</div>
      <label className="block space-y-2">Search terms (comma separated)<Input value={terms} maxLength={320} onChange={(e) => setTerms(e.target.value)} /></label>
      <label className="flex min-h-12 items-start gap-3 rounded-xl border bg-accent/40 p-4"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I reviewed the packaging, product fields, HCS and dietary claims, and price range. Correct unsupported claims before approval. If evidence is unclear, leave the request pending or reject it with a reason.</span></label>
      <label className="block space-y-2">Reason for rejection<textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "h-auto min-h-24 resize-y")} /></label>
      <div className="flex flex-wrap gap-3"><Button disabled={!checked} onClick={() => void decide("approved")}>Approve product</Button><Button variant="destructive" onClick={() => void decide("rejected")}>Reject product</Button></div>
    </fieldset>}
  </article>
}

export function ProductRequestReview({ service }: { service: SubmissionService }) {
  const { user, getAccessToken } = useAuth()
  const [status, setStatus] = useState<ProductRequestStatus>("pending")
  const [items, setItems] = useState<ProductRequest[]>([])
  const [facets, setFacets] = useState<Facets>({ categories: [], dietary: [] })
  const [error, setError] = useState<string | null>(null)
  const loadId = useRef(0)
  const load = useCallback(async () => {
    const currentLoad = ++loadId.current
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      const [requests, nextFacets] = await Promise.all([service.listProductRequests(status, { id: user.id, role: user.role }, token), service.listFacets()])
      if (currentLoad !== loadId.current) return
      setItems(requests); setFacets(nextFacets); setError(null)
    } catch (e) { if (currentLoad === loadId.current) setError(errorText(e)) }
  }, [service, status, user, getAccessToken])
  useEffect(() => { async function fetchQueue() { await load() } void fetchQueue(); const timer = window.setInterval(() => void load(), 4 * 60_000); return () => window.clearInterval(timer) }, [load])
  return <section className="surface-card space-y-5 p-5 sm:p-7" aria-label="Product request review">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-xl font-extrabold">Review new product requests</h2><Button variant="outline" onClick={() => void load()}>Refresh request queue</Button></div>
    <label className="flex max-w-xs flex-col gap-1.5 text-sm font-semibold">Request status<Select value={status} onChange={(e) => { setItems([]); setStatus(e.target.value as ProductRequestStatus) }} className="capitalize">{["pending", "approved", "rejected"].map((s) => <option key={s}>{s}</option>)}</Select></label>
    <FormAlert message={error} />
    {items.length === 0 && <p>No {status} product requests.</p>}
    {items.map((item) => <RequestReviewCard key={item.id} item={item} service={service} facets={facets} refresh={load} notify={setError} />)}
  </section>
}
