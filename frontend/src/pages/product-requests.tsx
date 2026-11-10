import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "../auth/auth-context"
import { FormAlert } from "../components/auth/form-alert"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { ReviewCard, ReviewThumb } from "../components/contribute/review-card"
import { RequestStatusBadge } from "../components/contribute/status-badge"
import { packUnits, productCorrectionsSchema, reasonError, singaporeDateString, validationMessages } from "../contributions/schema"
import { errorText, SubmissionServiceError } from "../contributions/service"
import type { ProductCorrections, ProductFacets, ProductFields, ProductRequest, ProductRequestStatus, SubmissionService } from "../contributions/types"
import { formatCents } from "../lib/format"
import { cn } from "../lib/utils"
import { Select } from "../components/ui/select"
import { RejectionReason } from "../components/contribute/rejection-reason"
import { Check, LoaderCircle, RefreshCw, X } from "lucide-react"
import { SuggestionInput } from "../components/suggestion-input"
import { titleCase, toSuggestions } from "../lib/suggestions"
import hcsSymbol from "../../assets/brand/healthier-choice-symbol.png"

export const emptyProduct: ProductFields = { name: "", brand: "", category: "", packQty: 0, packUnit: "ml", packCount: 1, hcs: false, dietary: [] }
export type Facets = ProductFacets
export const emptyFacets: Facets = { categories: [], brands: [], dietary: [] }

// Brand and Category suggest what's already in the catalogue but take anything. Categories are saved
// in lower case, so they're shown as on Search ("Soft Drinks"); brands are shown as they're spelled.
const SUGGESTION_TEXT = {
  brand: { noun: "brand", listLabel: "Brands", newHint: "Spell it as it’s printed on the pack." },
  category: { noun: "category", listLabel: "Categories", newHint: "New to the catalogue. It’s added when the product is approved." },
}

export function ProductEditor({ value, onChange, facets, prefix }: { value: ProductFields; onChange: (value: ProductFields) => void; facets: Facets; prefix: string }) {
  function set<K extends keyof ProductFields>(key: K, next: ProductFields[K]) { onChange({ ...value, [key]: next }) }
  const tags = [...new Set([...facets.dietary, ...value.dietary])]
  const suggestions = {
    brand: toSuggestions(facets.brands, facets.counts?.brands),
    category: toSuggestions(facets.categories, facets.counts?.categories, titleCase),
  }
  return <div className="grid gap-5 sm:grid-cols-2">
    {([['name', 'Product name', 120], ['brand', 'Brand', 60], ['category', 'Category', 40]] as const).map(([field, label, max]) => {
      const props = { id: `${prefix}-${field}`, value: value[field], required: true, minLength: field === "name" ? 2 : 1, maxLength: max }
      return <div key={field} className="space-y-2">
        <Label htmlFor={props.id}>{label}</Label>
        {field === "name"
          ? <Input {...props} onChange={(e) => set(field, e.target.value)} />
          : <SuggestionInput {...props} {...SUGGESTION_TEXT[field]} suggestions={suggestions[field]} onChange={(next) => set(field, next)} />}
      </div>
    })}
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

// The product picture and the price evidence photo, as thumbnails that enlarge on click. Admins get a
// link to the evidence; without one, the box just says it's there.
function RequestImages({ item, refresh }: { item: ProductRequest; refresh: () => void }) {
  return <>
    <ReviewThumb label="Product picture" url={item.productImageUrl} name={`Product picture for ${item.name}`} missing="Photo attached" onExpired={refresh} />
    <ReviewThumb label="Price evidence" url={item.photoUrl} name={`Price evidence for ${item.name}`} missing={item.photoKey ? "Photo attached" : "No price evidence photo sent"} onExpired={refresh} />
  </>
}

function RequestReviewCard({ item, service, facets, refresh, notify }: { item: ProductRequest; service: SubmissionService; facets: Facets; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const { user, getAccessToken } = useAuth()
  const [fields, setFields] = useState<ProductFields>(item)
  const [min, setMin] = useState(item.suggestedMinCents ?? 1)
  const [max, setMax] = useState(item.suggestedMaxCents ?? 100000)
  const [terms, setTerms] = useState("")
  const [checked, setChecked] = useState(false)
  const [reason, setReason] = useState("")
  // What's wrong with the reason, shown under its field rather than at the top of the card.
  const [reasonProblem, setReasonProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The decision being saved, so only its button shows a spinner.
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null)
  async function decide(decision: "approved" | "rejected") {
    setError(null)
    setReasonProblem(null)
    let changes: ProductCorrections | undefined
    if (decision === "approved") {
      if (!checked) return
      const result = productCorrectionsSchema.safeParse({ ...fields, minCents: min, maxCents: max, searchTerms: terms.trim() ? terms.split(",").map((s) => s.trim()) : [] })
      if (!result.success) { setError(validationMessages(result.error.issues)); return }
      changes = result.data
    } else if (!reason.trim()) { setReasonProblem("Enter a reason before rejecting this request."); return }
    else if (reasonError(reason)) { setReasonProblem(reasonError(reason)); return }
    setBusy(decision)
    try {
      const token = await getAccessToken(); if (!token || !user) throw new Error("Sign in again and retry.")
      await service.moderateProductRequest(item.id, decision, reason, changes, { id: user.id, role: user.role }, token)
      await refresh()
    } catch (e) {
      setError(errorText(e))
      if (e instanceof SubmissionServiceError && e.code === "ALREADY_MODERATED") { await refresh(); notify(errorText(e)) }
    } finally { setBusy(null) }
  }
  return <ReviewCard
    pictures={<RequestImages item={item} refresh={() => void refresh()} />}
    title={item.name}
    badge={<RequestStatusBadge status={item.status} />}
    price={formatCents(item.priceCents)}
    store={item.retailerName ?? item.retailerId}
    observedDate={singaporeDateString(new Date(item.observedAt))}
    submitter={[item.submitterName ?? item.userId, item.submitterEmail].filter(Boolean).join(" · ")}
    submittedAt={item.submittedAt}
    rejectionReason={item.rejectionReason}
  >
    <FormAlert message={error} />
    {item.status === "pending" && <fieldset disabled={Boolean(busy)} className="mt-5 space-y-5 border-t pt-5">
      <ProductEditor value={fields} onChange={setFields} facets={facets} prefix={`review-${item.id}`} />
      <p className="text-sm text-muted-foreground">Suggested range: {item.suggestedMinCents}–{item.suggestedMaxCents} cents. Review this range before approval; it applies across stores.</p>
      <div className="grid gap-4 sm:grid-cols-2">{([["Minimum cents", min, setMin], ["Maximum cents", max, setMax]] as const).map(([label, value, set]) => <label key={label} className="space-y-2">{label}<Input type="number" min="1" max="100000" step="1" value={value || ""} onChange={(e) => set(Number(e.target.value))} /></label>)}</div>
      <label className="block space-y-2">Search terms (comma separated)<Input value={terms} maxLength={320} onChange={(e) => setTerms(e.target.value)} /></label>
      <label className="flex min-h-12 items-start gap-3 rounded-xl border bg-accent/40 p-4"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I reviewed the packaging, product fields, HCS and dietary claims, and price range. Correct unsupported claims before approval. If evidence is unclear, leave the request pending or reject it with a reason.</span></label>
      <RejectionReason id={`reject-${item.id}`} value={reason} onChange={(next) => { setReason(next); setReasonProblem(null) }} error={reasonProblem} required="Required to reject" placeholder="Explain why it can't be added, e.g. the photo doesn't show the pack" />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="destructive" onClick={() => void decide("rejected")}>{busy === "rejected" ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}Reject product</Button>
        <Button disabled={!checked} onClick={() => void decide("approved")}>{busy === "approved" ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Approve product</Button>
      </div>
    </fieldset>}
  </ReviewCard>
}

export function ProductRequestReview({ service }: { service: SubmissionService }) {
  const { user, getAccessToken } = useAuth()
  const [status, setStatus] = useState<ProductRequestStatus>("pending")
  const [items, setItems] = useState<ProductRequest[]>([])
  const [facets, setFacets] = useState<Facets>(emptyFacets)
  const [error, setError] = useState<string | null>(null)
  const loadId = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
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
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-xl font-extrabold">Review New Product Requests</h2><p className="mt-1 text-sm text-muted-foreground">Products contributors want added to the catalog, each with its first price. Check the pack picture and details, then approve or reject it.</p></div><Button variant="outline" size="icon" aria-label="Refresh request queue" title="Refresh request queue" disabled={refreshing}
      onClick={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)) }}><RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden="true" /></Button></div>
    <label className="flex max-w-xs flex-col gap-1.5 text-sm font-semibold">Request status<Select value={status} onChange={(e) => { setItems([]); setStatus(e.target.value as ProductRequestStatus) }} className="capitalize">{["pending", "approved", "rejected"].map((s) => <option key={s}>{s}</option>)}</Select></label>
    <FormAlert message={error} />
    {items.length === 0 && <p>No {status} product requests.</p>}
    {items.map((item) => <RequestReviewCard key={item.id} item={item} service={service} facets={facets} refresh={load} notify={setError} />)}
  </section>
}
