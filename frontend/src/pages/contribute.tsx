import { zodResolver } from "@hookform/resolvers/zod"
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Image,
  Info,
  LoaderCircle,
  Package,
  PackagePlus,
  Search,
  Send,
  ShieldCheck,
  Store,
  Tag,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { FormAlert } from "../components/auth/form-alert"
import { PhotoDrop, usePhoto } from "../components/contribute/photo-drop"
import { RejectionReason } from "../components/contribute/rejection-reason"
import { PriceStatusBadge } from "../components/contribute/status-badge"
import { YourSubmissions } from "../components/contribute/your-submissions"
import { AppShell } from "../components/layout/app-shell"
import { PageHeader } from "../components/layout/page-header"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select } from "../components/ui/select"
import {
  contributionSchema,
  earliestObservedDate,
  productFieldsSchema,
  reasonError,
  singaporeDateString,
  validationMessages,
  type ContributionInput,
  type ContributionValues,
} from "../contributions/schema"
import { createSubmissionService, errorText, SubmissionServiceError } from "../contributions/service"
import type { CatalogProduct, CatalogRetailer, PriceSubmission, ProductFields, SubmissionService } from "../contributions/types"
import { getCategoryIcon } from "../lib/category-icons"
import { formatDay, formatDollars, formatTimestamp, limitToCents, packLabel } from "../lib/format"
import { usePageTitle } from "../lib/use-page-title"
import { cn } from "../lib/utils"
import { emptyFacets, emptyProduct, ProductEditor, ProductRequestReview, type Facets } from "./product-requests"
import { titleCase } from "../lib/suggestions"

// Whether the price is for a product already on TrolleySaver, or for one being added.
type Mode = "existing" | "new"

const MODES: { value: Mode; label: string; icon: typeof Search }[] = [
  { value: "existing", label: "Existing product", icon: Search },
  { value: "new", label: "New product", icon: PackagePlus },
]

// Shown beside Submit: what happens to what you send, in the order it happens.
type Rule = { icon: typeof Search; tone: "done" | "waiting"; text: string }
const PRICE_RULES: Rule[] = [
  { icon: CheckCircle2, tone: "done", text: "Most prices are accepted straight away, and show on TrolleySaver after the nightly update." },
  { icon: Clock3, tone: "waiting", text: "A price far from the usual range is checked by an admin first." },
]
const NEW_PRODUCT_RULES: Rule[] = [
  { icon: Clock3, tone: "waiting", text: "An admin checks every new product before it goes live." },
  { icon: CheckCircle2, tone: "done", text: "Once approved, it appears in Search and Smart Basket. Its price shows after the nightly update." },
]

function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null
  return <p id={id} role="alert" className="text-xs font-medium text-destructive">{children}</p>
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Search; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" aria-hidden="true" /></span>
      <div>
        <h2 className="font-display text-lg font-extrabold leading-tight sm:text-xl">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// The evidence photo beside a flagged price, for administrators.
function PhotoView({ submission, onExpired }: { submission: PriceSubmission; onExpired?: () => void }) {
  if (!submission.photo?.previewUrl) {
    return (
      <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-secondary/50 p-3 text-center text-muted-foreground">
        <div><Image className="mx-auto size-5" /><span className="mt-1 block text-[11px]">{submission.photo ? "Photo attached" : "No image"}</span></div>
      </div>
    )
  }
  return (
    <figure className="min-w-0 space-y-3">
      <figcaption className="text-sm font-semibold">Price evidence</figcaption>
      <img
        src={submission.photo.previewUrl}
        alt={`Price evidence for ${submission.productName}`}
        className="max-h-96 w-full rounded-xl border bg-secondary/40 object-contain"
        onError={() => { if (submission.photo?.storage === "private-s3") onExpired?.() }}
      />
      <div className="rounded-xl border border-primary/20 bg-accent/50 p-4">
        <p className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-5 shrink-0 text-primary" />Help shoppers trust this price</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Match the product name and price on the shelf label or receipt to the details beside it.</p>
      </div>
    </figure>
  )
}

function SubmissionDetails({ submission }: { submission: PriceSubmission }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display font-extrabold leading-snug">{submission.productName}</h3>
        <PriceStatusBadge status={submission.status} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">{formatDollars(submission.price)}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Store className="size-3.5" />{submission.storeName}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Observed {formatDay(submission.observedDate)}</span>
      </div>
      {submission.rejectionReason && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <strong>Rejection reason:</strong> {submission.rejectionReason}
        </p>
      )}
    </div>
  )
}

function ContributorWorkspace({ service }: { service: SubmissionService }) {
  usePageTitle("Price & image upload")
  const { user, getAccessToken } = useAuth()
  const [mode, setMode] = useState<Mode>("existing")
  const [submissions, setSubmissions] = useState<PriceSubmission[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [stores, setStores] = useState<CatalogRetailer[]>([])
  const [facets, setFacets] = useState<Facets>(emptyFacets)
  const [productSearch, setProductSearch] = useState("")
  const [productCategory, setProductCategory] = useState("")
  const [productListOpen, setProductListOpen] = useState(false)
  const [activeProductIndex, setActiveProductIndex] = useState(-1)
  const [newProduct, setNewProduct] = useState<ProductFields>(emptyProduct)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  // Bumped after a new product is sent, so the list reloads its product requests.
  const [historyKey, setHistoryKey] = useState(0)
  // Bumped by Clear, so the photo inputs start empty again.
  const [formKey, setFormKey] = useState(0)
  const evidence = usePhoto()
  const picture = usePhoto()
  // The product chosen before switching to New, restored when switching back.
  const savedProductId = useRef("")
  const focusNameOnSwitch = useRef(false)
  const tabs = useRef<Record<Mode, HTMLButtonElement | null>>({ existing: null, new: null })
  const today = singaporeDateString()
  const earliestDate = earliestObservedDate()
  const {
    register,
    handleSubmit,
    reset,
    clearErrors,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContributionInput, unknown, ContributionValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: { productId: "", storeId: "", price: "", observedDate: today },
  })
  const selectedProductId = watch("productId")
  const priceField = register("price")

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
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
  const typed = productSearch.trim()

  function chooseProduct(product: CatalogProduct) {
    setValue("productId", product.id, { shouldDirty: true, shouldValidate: true })
    clearErrors("productId")
    setProductSearch(product.name)
    setProductListOpen(false)
    setActiveProductIndex(-1)
  }

  // Store, price, date and the price photo are shared, so they keep their values when the mode changes.
  function switchMode(next: Mode) {
    if (next === mode) return
    if (next === "new") {
      const current = getValues("productId")
      savedProductId.current = current === "new" ? "" : current
      setValue("productId", "new")
      clearErrors("productId")
    } else {
      setValue("productId", savedProductId.current)
    }
    setProductListOpen(false)
    setNotice(null)
    setMode(next)
  }

  // From a search that found nothing: carry what was typed over as the new product's name.
  function addAsNewProduct() {
    if (typed && !selectedProductId) setNewProduct((current) => (current.name ? current : { ...current, name: typed }))
    focusNameOnSwitch.current = true
    switchMode("new")
  }

  useEffect(() => {
    if (mode !== "new" || !focusNameOnSwitch.current) return
    focusNameOnSwitch.current = false
    document.getElementById("new-product-name")?.focus()
  }, [mode])

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const next: Mode = event.key === "Home" ? "existing" : event.key === "End" ? "new" : mode === "existing" ? "new" : "existing"
    switchMode(next)
    tabs.current[next]?.focus()
  }

  const loadMine = useCallback(async () => {
    if (!user) return
    const token = await getAccessToken()
    if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
    setSubmissions(await service.listMySubmissions(user.id, token))
  }, [getAccessToken, service, user])

  useEffect(() => {
    let active = true
    // The labels and categories for new products; the price form works without them.
    service.listFacets().then((next) => { if (active) setFacets(next) }).catch(() => undefined)
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

  function clearForm() {
    reset({ productId: mode === "new" ? "new" : "", storeId: "", price: "", observedDate: today })
    savedProductId.current = ""
    setProductSearch("")
    setProductCategory("")
    setProductListOpen(false)
    setActiveProductIndex(-1)
    setNewProduct(emptyProduct)
    evidence.clear()
    picture.clear()
    setFormKey((key) => key + 1)
    setProgress(null)
    setLoadError(null)
    setNotice(null)
  }

  async function submit(values: ContributionValues) {
    if (!user || evidence.error) return
    setLoadError(null)
    setNotice(null)
    clearErrors()

    if (mode === "new") {
      const fields = productFieldsSchema.safeParse(newProduct)
      if (!fields.success) { setLoadError(validationMessages(fields.error.issues)); return }
      if (!picture.file) { picture.setError("Add a picture of the pack. Every new product needs one."); return }
      setProgress(0)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
        const target = await service.requestProductImageUpload(picture.file, "product-image", token)
        await service.uploadImage(target, picture.file, evidence.file ? undefined : setProgress)
        let photoKey: string | undefined
        if (evidence.file) {
          const photo = await service.requestProductImageUpload(evidence.file, "evidence", token)
          await service.uploadImage(photo, evidence.file, setProgress)
          photoKey = photo.photoKey
        }
        await service.createProductRequest({
          ...fields.data,
          retailerId: values.storeId,
          priceCents: Math.round(values.price * 100),
          observedAt: values.observedDate,
          productImageKey: target.photoKey,
          ...(photoKey ? { photoKey } : {}),
        }, user.id, token)
        clearForm()
        setHistoryKey((key) => key + 1)
        toast.success("New product sent for review")
      } catch (error) {
        // Already on TrolleySaver: switch to that product, keeping the store, price, date and photo.
        if (error instanceof SubmissionServiceError && error.code === "PRODUCT_EXISTS" && error.productId) {
          try {
            const catalog = await service.listProducts()
            const canonical = catalog.find((product) => product.id === error.productId)
            if (!canonical) throw new Error("The canonical product is not available yet. Reload the catalog and retry.", { cause: error })
            setProducts(catalog)
            switchMode("existing")
            chooseProduct(canonical)
            setNotice(`${error.message} It’s now selected below, with your store, price and photos kept.`)
          } catch (recoveryError) { setLoadError(errorText(recoveryError)) }
        } else setLoadError(errorText(error))
      } finally {
        setProgress(null)
      }
      return
    }

    setProgress(evidence.file ? 0 : null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
      let photo
      if (evidence.file) {
        const target = await service.requestImageUpload(evidence.file, values.productId, values.storeId, token)
        photo = await service.uploadImage(target, evidence.file, setProgress)
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
      if (created.status === "accepted") toast.success("Price accepted. It shows on TrolleySaver after the nightly update.")
      else if (created.status === "flagged") toast.success("Price sent to an admin to check, as it’s far from the usual range.")
      else toast.error("This price wasn’t accepted. Check it against the shelf label and try again.")
    } catch (error) {
      if (error instanceof SubmissionServiceError && error.fieldErrors) {
        const fieldMap = { productId: "productId", retailerId: "storeId", priceCents: "price", observedAt: "observedDate" } as const
        Object.entries(fieldMap).forEach(([apiField, formField]) => {
          const message = error.fieldErrors?.[apiField]
          if (message) setError(formField, { message })
        })
        const photoMessage = error.fieldErrors.photo ?? error.fieldErrors.photoKey
        if (photoMessage) evidence.setError(photoMessage)
      }
      setLoadError(error instanceof Error ? error.message : "The submission could not be saved.")
    } finally {
      setProgress(null)
    }
  }

  const existingPanel = (
    <div
      className="space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProductListOpen(false)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.45fr)]">
        <div className="space-y-2">
          <Label htmlFor="product-search">Product</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="product-search"
              type="search"
              maxLength={100}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={productListOpen}
              aria-controls={filteredProducts.length > 0 ? "product-options" : undefined}
              aria-activedescendant={productListOpen && activeProductIndex >= 0 ? `product-option-${filteredProducts[activeProductIndex]?.id}` : undefined}
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
                setProductSearch(event.target.value)
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
                } else if (event.key === "Enter" && productListOpen && filteredProducts.length > 0) {
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
          <Label htmlFor="product-category">Type <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Select
            id="product-category"
            value={productCategory}
            disabled={loading || productCategories.length === 0}
            onChange={(event) => {
              const category = event.target.value
              setProductCategory(category)
              // Keep the chosen product if it belongs to the new type; otherwise clear the
              // selection and the box together, so the box never shows an unselected product.
              const selected = products.find((product) => product.id === selectedProductId)
              const stillFits = selected && (!category || selected.category?.trim().toLocaleLowerCase() === category.trim().toLocaleLowerCase())
              if (!stillFits) {
                setValue("productId", "")
                setProductSearch("")
              }
              setProductListOpen(true)
              setActiveProductIndex(-1)
            }}
          >
            <option value="">All types</option>
            {productCategories.map((category) => (
              <option key={category} value={category}>{titleCase(category)}</option>
            ))}
          </Select>
        </div>
      </div>

      {productListOpen && (
        <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          {filteredProducts.length > 0 && (
            <div id="product-options" role="listbox" aria-label="Matching products" className="max-h-64 overflow-y-auto py-1">
              {filteredProducts.map((product, index) => {
                const icon = getCategoryIcon(product.category)
                return (
                  <div
                    id={`product-option-${product.id}`}
                    key={product.id}
                    role="option"
                    aria-selected={product.id === selectedProductId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                      index === activeProductIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveProductIndex(index)}
                    onClick={() => chooseProduct(product)}
                  >
                    {icon
                      ? <img src={icon} alt="" className="product-tile size-8" />
                      : <span className="product-tile grid size-8 place-items-center text-muted-foreground"><Package className="size-4" aria-hidden="true" /></span>}
                    <span className="min-w-0 flex-1">
                      {product.name}
                      {packLabel(product) && <span className="block text-xs text-muted-foreground">{[product.brand, packLabel(product)].filter(Boolean).join(" · ")}</span>}
                    </span>
                    {product.category && <span className="shrink-0 text-xs capitalize text-muted-foreground">{product.category}</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className={cn("grid gap-2.5 bg-secondary/60 p-3", filteredProducts.length > 0 && "border-t")}>
            {filteredProducts.length === 0
              ? <p role="status" className="text-sm">{typed ? <>No product matches “<strong>{typed}</strong>”.</> : "No products of this type yet."}</p>
              : <p className="text-sm text-muted-foreground">Can’t find it?</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit max-w-full border-primary/50 text-primary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addAsNewProduct}
            >
              <PackagePlus className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{filteredProducts.length === 0 && typed ? `Add “${typed}” as a new product` : "Add it as a new product"}</span>
            </Button>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {typed || productCategory
            ? `Showing ${filteredProducts.length} of ${products.length} products.`
            : `${products.length} products. Type to search, or pick from the list.`}
        </p>
      )}
      <FieldError id="product-error">{errors.productId?.message}</FieldError>
    </div>
  )

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Share a Price You Spotted"
        description="Add a price you saw on the shelf, with a photo if you have one. You can also add a product that isn’t on TrolleySaver yet."
      />
      <FormAlert message={loadError} />
      {notice && (
        <p role="status" className="flex gap-2 rounded-xl border border-primary/30 bg-accent/60 p-3 text-sm text-accent-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{notice}
        </p>
      )}

      <form onSubmit={handleSubmit(submit)} noValidate className="grid items-start gap-5 lg:grid-cols-12">
        <input type="hidden" {...register("productId")} />

        <section className="surface-card min-w-0 lg:col-span-7" aria-label="Product, store and price">
          <div role="tablist" aria-label="Which product?" className="flex gap-1.5 border-b px-3 sm:px-5">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                ref={(element) => { tabs.current[value] = element }}
                type="button"
                role="tab"
                id={`mode-tab-${value}`}
                aria-selected={mode === value}
                aria-controls="product-panel"
                tabIndex={mode === value ? 0 : -1}
                onClick={() => switchMode(value)}
                onKeyDown={onTabKeyDown}
                className={cn(
                  "-mb-px inline-flex h-14 items-center gap-2 border-b-[3px] border-transparent px-2.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  mode === value && "border-primary text-foreground",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-4", mode === value && "text-primary")} />{label}
              </button>
            ))}
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            <div id="product-panel" role="tabpanel" aria-labelledby={`mode-tab-${mode}`} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {mode === "existing"
                  ? products.length ? `Search the ${products.length} products already on TrolleySaver.` : "Search the products already on TrolleySaver."
                  : "Describe it as it appears on the pack. An admin checks new products before they go live."}
              </p>
              {mode === "existing" ? existingPanel : <ProductEditor value={newProduct} onChange={setNewProduct} facets={facets} prefix="new-product" />}
            </div>

            <div className="space-y-5 border-t pt-6">
              <SectionHeading icon={Tag} title="Where and How Much" description="The same for existing and new products" />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="store">Store</Label>
                  <Select id="store" disabled={loading} aria-invalid={Boolean(errors.storeId)} {...register("storeId")}>
                    <option value="">{loading ? "Loading stores…" : "Select a store"}</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </Select>
                  <FieldError>{errors.storeId?.message}</FieldError>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price (SGD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input id="price" type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" placeholder="0.00" className="pl-7" aria-invalid={Boolean(errors.price)} {...priceField} onChange={(event) => { event.target.value = limitToCents(event.target.value); void priceField.onChange(event) }} />
                  </div>
                  <FieldError>{errors.price?.message}</FieldError>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observedDate">Date seen</Label>
                  <Input id="observedDate" type="date" min={earliestDate} max={today} aria-invalid={Boolean(errors.observedDate)} aria-describedby="observed-help" {...register("observedDate")} />
                  <p id="observed-help" className="text-xs text-muted-foreground">Within the last 30 days</p>
                  <FieldError>{errors.observedDate?.message}</FieldError>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card flex min-w-0 flex-col gap-6 p-5 sm:p-7 lg:col-span-5" aria-label="Photos">
          <SectionHeading icon={Camera} title="Photos" description="JPG or PNG, up to 5 MB each" />
          {mode === "new" && (
            <PhotoDrop
              key={`picture-${formKey}`}
              id="product-picture"
              label="Product picture"
              inputLabel="Product picture"
              required
              title="Add a picture of the pack"
              hint="The front of the pack, so shoppers recognise it"
              previewAlt="Selected product picture preview"
              photo={picture}
            />
          )}
          <PhotoDrop
            key={`evidence-${formKey}`}
            id="evidence"
            label="Price photo"
            inputLabel="Price evidence photo"
            title="Add a shelf label or receipt"
            hint="Helps an admin check the price quickly"
            previewAlt="Selected price evidence preview"
            reminders={["Product name in view", "Price readable"]}
            photo={evidence}
          />
          {progress !== null && (
            <div aria-live="polite">
              <div className="mb-2 flex justify-between text-xs"><span>Uploading photo</span><span className="tabular-nums">{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </section>

        <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:pl-6 lg:col-span-12">
          {/* What happens after Submit, one rule per line, with the icons of the badges each outcome gets in Your submissions */}
          <ul className="grid gap-1.5 text-sm" aria-label="What happens next">
            {(mode === "new" ? NEW_PRODUCT_RULES : PRICE_RULES).map(({ icon: Icon, tone, text }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", tone === "done" ? "text-primary" : "text-amber-700 dark:text-amber-300")} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={clearForm}>Clear</Button>
            <Button type="submit" disabled={isSubmitting || evidence.preparing || picture.preparing || Boolean(evidence.error)}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              {isSubmitting ? "Sending…" : mode === "new" ? "Submit product for review" : "Submit price"}
            </Button>
          </div>
        </div>
      </form>

      <YourSubmissions
        service={service}
        priceSubmissions={submissions}
        pricesLoading={loading}
        refreshPrices={loadMine}
        onPriceDeleted={(id) => setSubmissions((current) => current.filter((item) => item.id !== id))}
        packOf={(productId) => packLabel(productById.get(productId) ?? {})}
        refreshKey={historyKey}
      />
    </div>
  )
}

function AdminWorkspace({ service }: { service: SubmissionService }) {
  usePageTitle("Review price evidence")
  const { user, getAccessToken } = useAuth()
  const [submissions, setSubmissions] = useState<PriceSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  // What's wrong with the reason being typed, shown under its field.
  const [reasonProblem, setReasonProblem] = useState<string | null>(null)

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
      setReasonProblem("Enter a reason before rejecting this submission.")
      return
    }
    const invalidReason = decision === "rejected" ? reasonError(reason) : null
    if (invalidReason) {
      setReasonProblem(invalidReason)
      return
    }
    setReasonProblem(null)
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
      <PageHeader title="Review Price Evidence" description="Help the community shop with confidence. Match each price to its photo, and give new finds a careful first look.">
        <aside className="surface-card flex flex-[1_1_280px] items-center justify-between p-5">
          <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><ShieldCheck className="size-6" /></span>
          <div className="text-right"><strong className="block font-display text-4xl font-extrabold tabular-nums">{loading ? "—" : submissions.length}</strong><span className="text-xs text-muted-foreground">Awaiting review</span></div>
        </aside>
      </PageHeader>

      <FormAlert message={error} />
      <ProductRequestReview service={service} />

      <section className="surface-card p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-display text-xl font-extrabold">Review Flagged Price Submissions</h2><p className="mt-1 text-sm text-muted-foreground">Prices for products already in the catalog that fell outside the usual range. Check each against its photo, then accept or reject it.</p></div>
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
              <PhotoView submission={submission} onExpired={() => void loadFlagged().catch(() => setError("The photo link expired and could not be refreshed."))} />
              <div className="min-w-0">
                <SubmissionDetails submission={submission} />
                <dl className="mt-4 grid gap-3 rounded-xl bg-secondary/55 p-4 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Submitted by</dt><dd className="mt-1 font-medium">{submission.submitterName} · {submission.submitterEmail}</dd></div>
                  <div><dt className="text-muted-foreground">Submitted at</dt><dd className="mt-1 font-medium">{formatTimestamp(submission.submittedAt)}</dd></div>
                  {submission.photo && <div className="sm:col-span-2"><dt className="text-muted-foreground">Evidence file</dt><dd className="mt-1 break-all font-medium">{submission.photo.fileName} · {(submission.photo.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div>}
                </dl>
                {rejectingId === submission.id && (
                  <RejectionReason
                    id={`reason-${submission.id}`}
                    value={reason}
                    onChange={(next) => { setReason(next); setReasonProblem(null) }}
                    error={reasonProblem}
                    placeholder="Explain what needs to be corrected"
                    className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
                  />
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  {rejectingId === submission.id ? (
                    <>
                      <Button variant="ghost" onClick={() => { setRejectingId(null); setReason(""); setReasonProblem(null); setError(null) }}>Cancel</Button>
                      <Button variant="destructive" disabled={workingId === submission.id} onClick={() => void decide(submission, "rejected")}>
                        {workingId === submission.id ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}Confirm rejection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="destructive" disabled={Boolean(workingId)} onClick={() => { setRejectingId(submission.id); setReason(""); setReasonProblem(null) }}><X className="size-4" />Reject</Button>
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

export const SUBMISSIONS_NOT_CONFIGURED = "Price submissions are not configured. Set VITE_API_BASE_URL in frontend/.env.local, or set VITE_PRICE_SUBMISSION_MODE=local."

export function ContributePage({ serviceOverride, createService = createSubmissionService }: { serviceOverride?: SubmissionService; createService?: typeof createSubmissionService }) {
  const { user, getAccessToken, signOut } = useAuth()
  // A missing API setting throws while creating the service; show it instead of a blank page.
  const { service, configError } = useMemo(() => {
    try {
      return { service: serviceOverride ?? createService({ refreshAccessToken: () => getAccessToken(true), onSessionEnded: signOut }), configError: null }
    } catch {
      return { service: null, configError: SUBMISSIONS_NOT_CONFIGURED }
    }
  }, [createService, getAccessToken, serviceOverride, signOut])
  if (!service) return <AppShell><div className="mx-auto max-w-3xl px-4 py-10"><FormAlert message={configError} /></div></AppShell>
  return <AppShell>{user?.role === "admin" ? <AdminWorkspace service={service} /> : <ContributorWorkspace service={service} />}</AppShell>
}
