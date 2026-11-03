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
  Search,
  ShieldCheck,
  Store,
  X,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { ProductRequestForm, ProductRequestHistory, ProductRequestReview } from "./product-requests"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { FormAlert } from "../components/auth/form-alert"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import {
  contributionSchema,
  earliestObservedDate,
  singaporeDateString,
  validateImage,
  type ContributionInput,
  type ContributionValues,
} from "../contributions/schema"
import { createSubmissionService, SubmissionServiceError } from "../contributions/service"
import type { CatalogProduct, CatalogRetailer, PriceSubmission, SubmissionService, SubmissionStatus } from "../contributions/types"
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
  const Icon = status === "accepted" ? CheckCircle2 : status === "rejected" ? XCircle : Clock3
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
      status === "accepted" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      status === "rejected" && "border-destructive/25 bg-destructive/10 text-destructive",
      status === "flagged" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    )}>
      <Icon className="size-3.5" />{status === "flagged" ? "Pending review" : status}
    </span>
  )
}

function PhotoView({ submission, large = false, onExpired }: { submission: PriceSubmission; large?: boolean; onExpired?: () => void }) {
  if (!submission.photo) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed bg-secondary/50 text-center text-muted-foreground", large ? "min-h-52" : "size-20 shrink-0")}>
        <div><Image className="mx-auto size-5" /><span className="mt-1 block text-[11px]">No image</span></div>
      </div>
    )
  }
  if (!large || !submission.photo.previewUrl) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed bg-secondary/50 p-3 text-center text-muted-foreground", large ? "min-h-52" : "size-20 shrink-0")}>
        <div><Image className="mx-auto size-5" /><span className="mt-1 block text-[11px]">Photo attached · visible to administrators</span></div>
      </div>
    )
  }
  return (
    <figure className={large ? "min-w-0 space-y-3" : "size-20 shrink-0"}>
      <figcaption className={large ? "text-sm font-semibold" : "sr-only"}>
        Price evidence
      </figcaption>
      <img
      src={submission.photo.previewUrl}
      alt={`$Price evidence for ${submission.productName}`}
      className={cn("rounded-xl border", large ? "max-h-96 w-full bg-secondary/40 object-contain" : "size-20 object-cover")}
      onError={() => { if (submission.photo?.storage === "private-s3") onExpired?.() }}
      />
      {large && <div className="rounded-xl border border-primary/20 bg-accent/50 p-4">
        <p className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-5 shrink-0 text-primary" />Help shoppers trust this price</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Match the product name and price on the shelf label or receipt to the details beside it.
        </p>
      </div>}
    </figure>
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

function NewProductDialog({ service, onClose, onExisting }: { service: SubmissionService; onClose: () => void; onExisting: (id: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="new-product-title" className="m-auto max-h-[90vh] w-[min(1280px,95vw)] overflow-y-auto rounded-2xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="mb-5 flex items-center justify-between"><h2 id="new-product-title" className="text-xl font-semibold">Upload a new product</h2><Button variant="ghost" onClick={() => dialog.current?.close()} aria-label="Close new product upload"><X className="size-4" /></Button></div>
    <ProductRequestForm service={service} onDone={() => dialog.current?.close()} onExisting={onExisting} />
  </dialog>
}

function ContributorWorkspace({ service }: { service: SubmissionService }) {
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<PriceSubmission[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [productCategory, setProductCategory] = useState("")
  const [productListOpen, setProductListOpen] = useState(false)
  const [activeProductIndex, setActiveProductIndex] = useState(-1)
  const [stores, setStores] = useState<CatalogRetailer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const fieldId = (name: string) => name
  const today = singaporeDateString()
  const earliestDate = earliestObservedDate()
  const {
    register,
    handleSubmit,
    reset,
    clearErrors,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContributionInput, unknown, ContributionValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: { productId: "", storeId: "", price: 0, observedDate: today },
  })
  const selectedProductId = watch("productId")

  const productCategories = useMemo(
    () => [...new Set(products.map((product) => product.category?.trim()).filter((category): category is string => Boolean(category)))].sort((a, b) => a.localeCompare(b)),
    [products],
  )
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase()
    const category = productCategory.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesCategory = !category || product.category?.trim().toLocaleLowerCase() === category
      const searchableText = [product.name, product.brand, ...(product.searchTerms ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
      return matchesCategory && (!query || searchableText.includes(query))
    })
  }, [productCategory, productSearch, products])
  const showProductOptions = productListOpen

  function chooseProduct(product: CatalogProduct) {
    setValue("productId", product.id, { shouldDirty: true, shouldValidate: true })
    clearErrors("productId")
    setProductSearch(product.name)
    setProductListOpen(false)
    setActiveProductIndex(-1)
  }

  const loadMine = useCallback(async () => {
    if (!user) return
    const token = await getAccessToken()
    if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
    setSubmissions(await service.listMySubmissions(user.id, token))
  }, [getAccessToken, service, user])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [nextProducts, nextStores] = await Promise.all([service.listProducts(), service.listRetailers()])
        if (active) { setProducts(nextProducts); setStores(nextStores) }
        await loadMine()
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load contribution data.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [loadMine, service])

  useEffect(() => {
    if (!submissions.some((item) => item.photo?.storage === "private-s3")) return
    const timer = window.setTimeout(() => void loadMine().catch(() => undefined), 4 * 60_000)
    return () => window.clearTimeout(timer)
  }, [loadMine, submissions])

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setImageError(null)
    setProgress(null)
  }

  function clearForm() {
    reset({ productId: "", storeId: "", price: 0, observedDate: today })
    setProductSearch("")
    setProductCategory("")
    setProductListOpen(false)
    setActiveProductIndex(-1)
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
    clearErrors()
    setProgress(file ? 0 : null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
      let photo
      if (file) {
        const target = await service.requestImageUpload(file, values.productId, values.storeId, token)
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
      toast.success(created.status === "accepted" ? "Price accepted; public prices update after nightly aggregation" : "Submission sent for administrator review")
    } catch (error) {
      if (error instanceof SubmissionServiceError && error.fieldErrors) {
        const fieldMap = { productId: "productId", retailerId: "storeId", priceCents: "price", observedAt: "observedDate" } as const
        Object.entries(fieldMap).forEach(([apiField, formField]) => {
          const message = error.fieldErrors?.[apiField]
          if (message) setError(formField, { message })
        })
        const photoMessage = error.fieldErrors.photo ?? error.fieldErrors.photoKey
        if (photoMessage) setImageError(photoMessage)
      }
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
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Found a price worth sharing? Pass it on and help another shopper make their next grocery trip a little easier.
          </p>
        </div>
        <ReviewPathCard />
      </header>
      <div className="glass-panel flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Found something new?</h2><p className="mt-1 text-sm text-muted-foreground">Help fellow shoppers discover it. Add a product we don’t have yet.</p></div><Button variant="outline" onClick={() => setShowNewProduct(true)}><ImageUp className="size-4" />Upload a new product</Button></div>
      {showNewProduct && <NewProductDialog onExisting={async (id) => {
        const catalog = await service.listProducts()
        const canonical = catalog.find((p) => p.id === id)
        if (!canonical) throw new Error("The canonical product is not available yet. Reload the catalog and retry.")
        setProducts(catalog); chooseProduct(canonical); setShowNewProduct(false)
      }} service={service} onClose={() => { setShowNewProduct(false); void loadMine().catch(() => setLoadError("Could not refresh submissions.")) }} />}
      <FormAlert message={loadError} />
      <form onSubmit={handleSubmit(submit)} noValidate className="grid items-stretch gap-5 lg:grid-cols-12">
        <div className="contents">
        <section className="glass-panel p-5 sm:p-7 lg:col-span-7">
          <div className="flex items-center gap-3 border-b border-border/70 pb-5">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Store className="size-5" /></span>
            <div><h2 className="text-xl font-semibold">Price details</h2><p className="mt-1 text-sm text-muted-foreground">What did you spot, and where?</p></div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">

            <div
              className="space-y-2 sm:col-span-2"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProductListOpen(false)
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
                <div className="space-y-2">
                  <Label htmlFor="product-search">Product · search by name or brand</Label>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="product-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showProductOptions}
                      aria-controls={filteredProducts.length > 0 ? "product-options" : undefined}
                      aria-activedescendant={showProductOptions && activeProductIndex >= 0 ? `product-option-${filteredProducts[activeProductIndex]?.id}` : undefined}
                      aria-invalid={Boolean(errors.productId)}
                      aria-describedby={errors.productId ? "product-error" : undefined}
                      autoComplete="off"
                      placeholder="Start typing a product or brand"
                      className="pl-9"
                      value={productSearch}
                      onFocus={() => {
                        setProductListOpen(true)
                        setActiveProductIndex(-1)
                      }}
                      onChange={(event) => {
                        const query = event.target.value
                        setProductSearch(query)
                        setValue("productId", "")
                        setProductListOpen(true)
                        setActiveProductIndex(-1)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" && filteredProducts.length > 0) {
                          event.preventDefault()
                          setProductListOpen(true)
                          setActiveProductIndex((current) => Math.min(current + 1, filteredProducts.length - 1))
                        } else if (event.key === "ArrowUp" && filteredProducts.length > 0) {
                          event.preventDefault()
                          setProductListOpen(true)
                          setActiveProductIndex((current) => current <= 0 ? filteredProducts.length - 1 : current - 1)
                        } else if (event.key === "Enter" && showProductOptions && filteredProducts.length > 0) {
                          event.preventDefault()
                          chooseProduct(filteredProducts[activeProductIndex >= 0 ? activeProductIndex : 0])
                        } else if (event.key === "Escape") {
                          setProductListOpen(false)
                          setActiveProductIndex(-1)
                        }
                      }}
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-category">Optional type filter</Label>
                  <select
                    id="product-category"
                    className={selectClass}
                    value={productCategory}
                    disabled={loading || productCategories.length === 0}
                    onChange={(event) => {
                      const category = event.target.value
                      setProductCategory(category)
                      setValue("productId", "")
                      setProductListOpen(true)
                      setActiveProductIndex(-1)
                    }}
                  >
                    <option value="">All types</option>
                    {productCategories.map((category) => (
                      <option key={category} value={category}>{category.charAt(0).toLocaleUpperCase() + category.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {showProductOptions && (
                <div className="overflow-hidden rounded-md border bg-popover shadow-lg">
                  {filteredProducts.length > 0 ? (
                    <div id="product-options" role="listbox" aria-label="Matching products" className="max-h-64 overflow-y-auto py-1">
                      {filteredProducts.map((product, index) => (
                        <div
                          id={`product-option-${product.id}`}
                          key={product.id}
                          role="option"
                          aria-selected={product.id === selectedProductId}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm",
                            index === activeProductIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveProductIndex(index)}
                          onClick={() => chooseProduct(product)}
                        >
                          <span>{product.name}</span>
                          {product.category && <span className="shrink-0 text-xs text-muted-foreground">{product.category}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p role="status" className="px-3 py-3 text-sm text-muted-foreground">No products match. Try another name or product type.</p>
                  )}
                </div>
              )}

              <input type="hidden" {...register("productId")} />
              {!loading && products.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {productSearch.trim() || productCategory
                    ? `Showing ${filteredProducts.length} of ${products.length} products. Select a suggestion from the list.`
                    : `${products.length} products available. Type to search, or choose a suggestion from the full list.`}
                </p>
              )}
              {errors.productId && <p id="product-error" role="alert" className="text-xs font-medium text-destructive">{errors.productId.message}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={fieldId("store")}>Store</Label>
              <select id={fieldId("store")} className={selectClass} disabled={loading} aria-invalid={Boolean(errors.storeId)} {...register("storeId")}>
                <option value="">{loading ? "Loading stores…" : "Select a store"}</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
              <FieldError>{errors.storeId?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("price")}>Price (SGD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id={fieldId("price")} type="number" min="0.01" max="1000" step="0.01" className="pl-7" aria-invalid={Boolean(errors.price)} {...register("price")} />
              </div>
              <FieldError>{errors.price?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("observedDate")}>Observed date</Label>
              <Input id={fieldId("observedDate")} type="date" min={earliestDate} max={today} aria-invalid={Boolean(errors.observedDate)} {...register("observedDate")} />
              <FieldError>{errors.observedDate?.message}</FieldError>
            </div>
          </div>
        </section>


        </div>

        <section className="glass-panel flex min-w-0 flex-col p-5 sm:p-7 lg:col-span-5">
          <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Camera className="size-5" /></span>
              <div><h2 className="text-xl font-semibold">Show the price you spotted</h2><p className="mt-2 inline-flex rounded-full bg-accent px-3 py-1 text-sm font-medium text-primary">Photo optional</p></div>
            </div>
            {file && <Button type="button" variant="ghost" size="sm" onClick={clearImage}><X className="size-4" />Remove</Button>}
          </div>
          <div id={fieldId("evidence-help")} className="mt-5 rounded-xl border border-primary/20 bg-accent/40 p-4">
            <h3 className="text-lg font-semibold">A clear price helps everyone.</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">Share a shelf label or receipt with the product name and price in focus, so the next shopper can buy with confidence.</p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Photo reminders">
              {["Product name", "Readable price"].map((reminder) => <li key={reminder} className="inline-flex items-center gap-1.5 rounded-lg bg-card/65 px-2.5 py-2 text-sm font-medium"><Check className="size-4 shrink-0 text-primary" />{reminder}</li>)}
            </ul>
          </div>
          <Label htmlFor={fieldId("evidence")} className="sr-only">Price evidence photo</Label>
          <label
            htmlFor={fieldId("evidence")}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); photoInput.current?.click() } }}
            className={cn(
              "mt-5 grid min-h-56 flex-1 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-secondary/35 text-center transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              imageError ? "border-destructive/50" : "border-border",
            )}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Selected price evidence preview" className="max-h-80 w-full object-contain" />
            ) : (
              <span className="p-6">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-primary"><ImageUp className="size-7" /></span>
                <strong className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"><ImageUp className="size-5" />Add a price photo</strong>
                <span className="mt-3 block text-sm text-muted-foreground">Choose from your device · JPG or PNG · Up to 5 MB</span>
              </span>
            )}
          </label>
          <input ref={photoInput} id={fieldId("evidence")} aria-describedby={fieldId("evidence-help")} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={onImageChange} />
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
            <span className="grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /></span>
            <span><strong className="block text-base">Small contribution. Shared savings.</strong><span className="mt-1 block text-sm text-muted-foreground">Usual prices are accepted automatically. Unusual prices get an administrator review. Public prices update after nightly aggregation.</span></span>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={clearForm}>Clear</Button>
            <Button type="submit" disabled={isSubmitting || Boolean(imageError)}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {isSubmitting ? "Saving..." : "Submit price"}
            </Button>
          </div>
        </div>
      </form>

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <ProductRequestHistory service={service} refreshKey={showNewProduct} />
      <section className="glass-panel min-w-0 p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Clock3 className="size-5" /></span>
            <div><h2 className="text-xl font-semibold">Your price submissions</h2><p className="text-xs text-muted-foreground">Track every price contribution from newest to oldest</p></div>
          </div>
          <span className="w-fit rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{submissions.length} total</span>
        </div>
        <div className="mt-6 grid gap-4" aria-live="polite">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your submissions…</div>
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center md:col-span-2 xl:col-span-3">
              <Camera className="mx-auto size-7 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Nothing submitted yet</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your price contributions will appear here immediately after submission.</p>
            </div>
          ) : submissions.map((submission) => (
            <article key={submission.id} className="rounded-xl border bg-card/45 p-4">
              <div className="flex gap-4"><PhotoView submission={submission} onExpired={() => void loadMine().catch(() => setLoadError("The photo link expired and could not be refreshed."))} /><SubmissionDetails submission={submission} /></div>
              <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">Submitted {formatTimestamp(submission.submittedAt)}</p>
            </article>
          ))}
        </div>
      </section>
      </div>
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

  const loadFlagged = useCallback(async () => {
    if (!user) return
    const token = await getAccessToken()
    if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
    setSubmissions(await service.listPendingSubmissions({ id: user.id, role: user.role }, token))
  }, [getAccessToken, service, user])

  useEffect(() => {
    let active = true
    async function load() {
      try { await loadFlagged() }
      catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load flagged submissions.") }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [loadFlagged])

  useEffect(() => {
    if (!submissions.some((item) => item.photo?.storage === "private-s3")) return
    const timer = window.setTimeout(() => void loadFlagged().catch(() => undefined), 4 * 60_000)
    return () => window.clearTimeout(timer)
  }, [loadFlagged, submissions])

  async function decide(submission: PriceSubmission, decision: "accepted" | "rejected") {
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
      toast.success(decision === "accepted" ? "Flagged price accepted" : "Flagged price rejected")
    } catch (decisionError) {
      if (decisionError instanceof SubmissionServiceError && decisionError.code === "ALREADY_MODERATED") {
        await loadFlagged().catch(() => undefined)
      }
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
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Help the community shop with confidence. Match each price to its photo, and give new finds a careful first look.
          </p>
        </div>
        <aside className="glass-panel flex items-center justify-between p-5">
          <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><ShieldCheck className="size-6" /></span>
          <div className="text-right"><strong className="block text-3xl font-semibold tabular-nums">{loading ? "—" : submissions.length}</strong><span className="text-xs text-muted-foreground">Awaiting review</span></div>
        </aside>
      </header>

      <FormAlert message={error} />
      <ProductRequestReview service={service} />

      <section className="glass-panel p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-xl font-semibold">Products and prices awaiting review</h2><p className="mt-1 text-sm text-muted-foreground">Follow the evidence from left to right, then record a decision.</p></div>
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
              <PhotoView submission={submission} large onExpired={() => void loadFlagged().catch(() => setError("The photo link expired and could not be refreshed."))} />
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
                      maxLength={500}
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
                      <Button disabled={Boolean(workingId)} onClick={() => void decide(submission, "accepted")}>
                        {workingId === submission.id ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Accept
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
  const { user, getAccessToken, signOut } = useAuth()
  const service = useMemo(() => serviceOverride ?? createSubmissionService({
    refreshAccessToken: () => getAccessToken(true),
    onSessionEnded: signOut,
  }), [getAccessToken, serviceOverride, signOut])
  return <AppShell>{user?.role === "admin" ? <AdminWorkspace service={service} /> : <ContributorWorkspace service={service} />}</AppShell>
}
