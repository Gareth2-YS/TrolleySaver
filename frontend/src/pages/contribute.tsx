import { zodResolver } from "@hookform/resolvers/zod"
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Image,
  ImageUp,
  ListChecks,
  LoaderCircle,
  ShieldCheck,
  Store,
  X,
  XCircle,
} from "lucide-react"
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { FormAlert } from "../components/auth/form-alert"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { products, stores } from "../contributions/catalog"
import {
  contributionSchema,
  localDateString,
  validateImage,
  type ContributionInput,
  type ContributionValues,
} from "../contributions/schema"
import { createSubmissionService } from "../contributions/service"
import type { PriceSubmission, SubmissionService, SubmissionStatus } from "../contributions/types"
import { cn } from "../lib/utils"

const selectClass = "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`))
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="text-xs font-medium text-destructive">{children}</p>
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const Icon = status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : Clock3
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
      status === "approved" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      status === "rejected" && "border-destructive/25 bg-destructive/10 text-destructive",
      status === "pending" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    )}>
      <Icon className="size-3.5" />{status}
    </span>
  )
}

function PhotoView({ submission, large = false }: { submission: PriceSubmission; large?: boolean }) {
  if (!submission.photo) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed bg-secondary/50 text-center text-muted-foreground", large ? "min-h-52" : "size-20 shrink-0")}>
        <div><Image className="mx-auto size-5" /><span className="mt-1 block text-[11px]">No image</span></div>
      </div>
    )
  }
  if (!submission.photo.previewUrl) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed bg-secondary/50 p-3 text-center text-muted-foreground", large ? "min-h-52" : "size-20 shrink-0")}>
        <div><Image className="mx-auto size-5" /><span className="mt-1 block text-[11px]">Private image</span></div>
      </div>
    )
  }
  return (
    <img
      src={submission.photo.previewUrl}
      alt={`Shelf-tag evidence for ${submission.productName}`}
      className={cn("rounded-xl border object-cover", large ? "max-h-80 w-full bg-secondary/40" : "size-20 shrink-0")}
    />
  )
}

function SubmissionDetails({ submission }: { submission: PriceSubmission }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug">{submission.productName}</h3>
        <StatusBadge status={submission.status} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
        ${submission.price.toFixed(2)} <span className="text-xs font-medium text-muted-foreground">SGD</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Store className="size-3.5" />{submission.storeName}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Observed {formatDate(submission.observedDate)}</span>
      </div>
      {submission.rejectionReason && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <strong>Rejection reason:</strong> {submission.rejectionReason}
        </p>
      )}
    </div>
  )
}

function ReviewPathCard() {
  return (
    <aside className="glass-panel p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><ListChecks className="size-5" /></span>
        <div><h2 className="font-semibold">From shelf to review</h2><p className="text-xs text-muted-foreground">A simple three-step flow</p></div>
      </div>
      <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
        {[["1", "Add details"], ["2", "Attach proof"], ["3", "Track status"]].map(([step, label]) => (
          <li key={step} className="rounded-xl border bg-card/35 px-2 py-3">
            <span className="mx-auto grid size-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{step}</span>
            <span className="mt-2 block">{label}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function ContributorWorkspace({ service }: { service: SubmissionService }) {
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<PriceSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const today = localDateString()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContributionInput, unknown, ContributionValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: { productId: "", storeId: "", price: 0, observedDate: today },
  })

  useEffect(() => {
    let active = true
    async function load() {
      if (!user) return
      try {
        const token = await getAccessToken()
        if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
        const result = await service.listMySubmissions(user.id, token)
        if (active) setSubmissions(result)
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load your submissions.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [getAccessToken, service, user])

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setImageError(null)
    setProgress(null)
  }

  function clearForm() {
    reset({ productId: "", storeId: "", price: 0, observedDate: today })
    clearImage()
    setLoadError(null)
  }

  function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    if (!next) return
    const validationError = validateImage(next)
    if (validationError) {
      clearImage()
      setImageError(validationError)
      event.target.value = ""
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(next)
    setPreviewUrl(URL.createObjectURL(next))
    setImageError(null)
  }

  async function submit(values: ContributionValues) {
    if (!user || imageError) return
    setLoadError(null)
    setProgress(file ? 0 : null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
      let photo
      if (file) {
        const target = await service.requestImageUpload(file, token)
        photo = await service.uploadImage(target, file, setProgress)
      }
      const product = products.find((item) => item.id === values.productId)
      const store = stores.find((item) => item.id === values.storeId)
      if (!product || !store) throw new Error("Choose a valid product and store.")
      const created = await service.createSubmission({
        ...values,
        price: Number(values.price),
        currency: "SGD",
        productName: product.name,
        storeName: store.name,
        submitterId: user.id,
        submitterName: user.name ?? user.email,
        submitterEmail: user.email,
        photo,
      }, token)
      setSubmissions((current) => [created, ...current])
      clearForm()
      toast.success("Price submitted for administrator review")
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The submission could not be saved.")
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="pb-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Contributor workspace</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Share a price you spotted</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Add the essential price details and optional shelf-label evidence. Every contribution stays pending until an administrator reviews it.
          </p>
        </div>
        <ReviewPathCard />
      </header>

      <FormAlert message={loadError} />

      <form onSubmit={handleSubmit(submit)} noValidate className="grid items-stretch gap-5 lg:grid-cols-12">
        <section className="glass-panel p-5 sm:p-7 lg:col-span-7">
          <div className="flex items-center gap-3 border-b border-border/70 pb-5">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Store className="size-5" /></span>
            <div><h2 className="text-xl font-semibold">Price details</h2><p className="text-xs text-muted-foreground">Tell us what you saw and where</p></div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="product">Product</Label>
              <select id="product" className={selectClass} aria-invalid={Boolean(errors.productId)} {...register("productId")}>
                <option value="">Select a product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <FieldError>{errors.productId?.message}</FieldError>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="store">Store</Label>
              <select id="store" className={selectClass} aria-invalid={Boolean(errors.storeId)} {...register("storeId")}>
                <option value="">Select a store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
              <FieldError>{errors.storeId?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (SGD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="price" type="number" min="0.01" max="10000" step="0.01" className="pl-7" aria-invalid={Boolean(errors.price)} {...register("price")} />
              </div>
              <FieldError>{errors.price?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observedDate">Observed date</Label>
              <Input id="observedDate" type="date" max={today} aria-invalid={Boolean(errors.observedDate)} {...register("observedDate")} />
              <FieldError>{errors.observedDate?.message}</FieldError>
            </div>
          </div>
        </section>

        <section className="glass-panel flex flex-col p-5 sm:p-7 lg:col-span-5">
          <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Camera className="size-5" /></span>
              <div><h2 className="text-xl font-semibold">Shelf evidence</h2><p className="text-xs text-muted-foreground">Optional · JPG or PNG · 5 MB max</p></div>
            </div>
            {file && <Button type="button" variant="ghost" size="sm" onClick={clearImage}><X className="size-4" />Remove</Button>}
          </div>
          <Label htmlFor="evidence" className="sr-only">Shelf-tag photo</Label>
          <label
            htmlFor="evidence"
            className={cn(
              "mt-6 grid min-h-64 flex-1 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-secondary/35 text-center transition-colors hover:border-primary/50 hover:bg-accent/50",
              imageError ? "border-destructive/50" : "border-border",
            )}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Selected shelf-tag preview" className="max-h-80 w-full object-contain" />
            ) : (
              <span className="p-6">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-primary"><ImageUp className="size-7" /></span>
                <strong className="mt-4 block text-sm">Choose a clear shelf-label photo</strong>
                <span className="mt-1 block text-xs text-muted-foreground">Click to browse your device</span>
              </span>
            )}
          </label>
          <input id="evidence" className="sr-only" type="file" accept="image/jpeg,image/png" onChange={onImageChange} />
          <FieldError>{imageError}</FieldError>
          {progress !== null && (
            <div className="mt-4" aria-live="polite">
              <div className="mb-2 flex justify-between text-xs"><span>Preparing image</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </section>

        <div className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
          <div className="flex items-center gap-3 text-sm">
            <span className="grid size-9 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"><Clock3 className="size-4" /></span>
            <span><strong className="block">Pending until reviewed</strong><span className="text-xs text-muted-foreground">Your contribution will not appear publicly straight away.</span></span>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={clearForm}>Clear</Button>
            <Button type="submit" disabled={isSubmitting || Boolean(imageError)}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {isSubmitting ? "Saving…" : "Submit for review"}
            </Button>
          </div>
        </div>
      </form>

      <section className="glass-panel p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Clock3 className="size-5" /></span>
            <div><h2 className="text-xl font-semibold">Your submissions</h2><p className="text-xs text-muted-foreground">Track every contribution from newest to oldest</p></div>
          </div>
          <span className="w-fit rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{submissions.length} total</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your submissions…</div>
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center md:col-span-2 xl:col-span-3">
              <Camera className="mx-auto size-7 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Nothing submitted yet</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your pending price contributions will appear here immediately after submission.</p>
            </div>
          ) : submissions.map((submission) => (
            <article key={submission.id} className="rounded-xl border bg-card/45 p-4">
              <div className="flex gap-4"><PhotoView submission={submission} /><SubmissionDetails submission={submission} /></div>
              <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">Submitted {formatTimestamp(submission.submittedAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function AdminWorkspace({ service }: { service: SubmissionService }) {
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<PriceSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      if (!user) return
      try {
        const token = await getAccessToken()
        if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
        const result = await service.listPendingSubmissions({ id: user.id, role: user.role }, token)
        if (active) setSubmissions(result)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load pending submissions.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [getAccessToken, service, user])

  async function decide(submission: PriceSubmission, decision: "approved" | "rejected") {
    if (!user) return
    if (decision === "rejected" && !reason.trim()) {
      setError("Enter a reason before rejecting this submission.")
      return
    }
    setError(null)
    setWorkingId(submission.id)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
      await service.moderateSubmission(
        submission.id,
        decision,
        decision === "rejected" ? reason : undefined,
        { id: user.id, role: user.role },
        token,
      )
      setSubmissions((current) => current.filter((item) => item.id !== submission.id))
      setRejectingId(null)
      setReason("")
      toast.success(decision === "approved" ? "Submission approved" : "Submission rejected")
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "The moderation decision could not be saved.")
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="pb-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Administrator workspace</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Review price evidence</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Verify each price and shelf-label image before approving it. This workspace contains moderation tools only.
          </p>
        </div>
        <aside className="glass-panel flex items-center justify-between p-5">
          <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><ShieldCheck className="size-6" /></span>
          <div className="text-right"><strong className="block text-3xl font-semibold tabular-nums">{loading ? "—" : submissions.length}</strong><span className="text-xs text-muted-foreground">Awaiting review</span></div>
        </aside>
      </header>

      <FormAlert message={error} />

      <section className="glass-panel p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-xl font-semibold">Pending submissions</h2><p className="mt-1 text-sm text-muted-foreground">Follow the evidence from left to right, then record a decision.</p></div>
          <span className="w-fit rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">Administrator only</span>
        </div>
        <div className="mt-6 space-y-5" aria-live="polite">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading review queue…</div>
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <CheckCircle2 className="mx-auto size-8 text-primary" />
              <h3 className="mt-3 font-semibold">Review queue is clear</h3>
              <p className="mt-1 text-sm text-muted-foreground">New submissions will appear here.</p>
            </div>
          ) : submissions.map((submission) => (
            <article key={submission.id} className="grid gap-5 rounded-xl border bg-card/45 p-4 lg:grid-cols-[minmax(220px,.75fr)_minmax(0,1.25fr)] lg:p-5">
              <PhotoView submission={submission} large />
              <div className="min-w-0">
                <SubmissionDetails submission={submission} />
                <dl className="mt-4 grid gap-3 rounded-xl bg-secondary/55 p-4 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Submitted by</dt><dd className="mt-1 font-medium">{submission.submitterName} · {submission.submitterEmail}</dd></div>
                  <div><dt className="text-muted-foreground">Submitted at</dt><dd className="mt-1 font-medium">{formatTimestamp(submission.submittedAt)}</dd></div>
                  {submission.photo && <div className="sm:col-span-2"><dt className="text-muted-foreground">Evidence file</dt><dd className="mt-1 break-all font-medium">{submission.photo.fileName} · {(submission.photo.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div>}
                </dl>
                {rejectingId === submission.id && (
                  <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                    <Label htmlFor={`reason-${submission.id}`}>Reason for rejection</Label>
                    <textarea
                      id={`reason-${submission.id}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2 min-h-24 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Explain what needs to be corrected"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">This helps the contributor understand the decision.</p>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  {rejectingId === submission.id ? (
                    <>
                      <Button variant="ghost" onClick={() => { setRejectingId(null); setReason(""); setError(null) }}>Cancel</Button>
                      <Button variant="destructive" disabled={workingId === submission.id} onClick={() => void decide(submission, "rejected")}>
                        {workingId === submission.id ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}Confirm rejection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" disabled={Boolean(workingId)} onClick={() => { setRejectingId(submission.id); setReason("") }}><X className="size-4" />Reject</Button>
                      <Button disabled={Boolean(workingId)} onClick={() => void decide(submission, "approved")}>
                        {workingId === submission.id ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Approve
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function ContributePage({ serviceOverride }: { serviceOverride?: SubmissionService }) {
  const { user } = useAuth()
  const [service] = useState(() => serviceOverride ?? createSubmissionService())
  return <AppShell>{user?.role === "admin" ? <AdminWorkspace service={service} /> : <ContributorWorkspace service={service} />}</AppShell>
}
