import { localProducts, localRetailers } from "./catalog"
import type { CatalogProduct, CatalogRetailer, CreateSubmissionInput, PriceSubmission, SubmissionActor, SubmissionPhoto, SubmissionService, SubmissionStatus, UploadTarget } from "./types"

const STORAGE_KEY = "trolleysaver.local.price-submissions.v1"

interface ApiErrorBody { code?: string; message?: string; fieldErrors?: Record<string, string>; requestId?: string }
interface ApiPage<T> { items: T[]; nextToken: string | null }
interface ApiServiceOptions { refreshAccessToken?: () => Promise<string | null>; onSessionEnded?: () => Promise<void> | void }
interface ApiSubmission {
  id: string
  productId: string
  productName: string | null
  retailerId: string
  retailerName: string | null
  userId: string
  priceCents: number
  observedAt: string
  submittedAt: string
  status: SubmissionStatus
  photoKey?: string
  photoContentType?: "image/jpeg" | "image/png"
  photoSizeBytes?: number
  photoUrl?: string
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
  submitterName?: string | null
  submitterEmail?: string | null
}

export class SubmissionServiceError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly fieldErrors?: Record<string, string>, readonly requestId?: string) {
    super(requestId ? `${message} (Reference: ${requestId})` : message)
    this.name = "SubmissionServiceError"
  }
}

function requireToken(token: string) {
  if (!token) throw new SubmissionServiceError("Your session has ended. Sign in again and retry.", 401, "SESSION_ENDED")
}

function readSubmissions(): PriceSubmission[] {
  try {
    const submissions = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<Omit<PriceSubmission, "status"> & { status: string }>
    return submissions.map((submission) => ({
      ...submission,
      status: submission.status === "pending" ? "flagged" : submission.status === "approved" ? "accepted" : submission.status as SubmissionStatus,
    }))
  } catch { return [] }
}

function writeSubmissions(submissions: PriceSubmission[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions)) }
function pause(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }

function singaporeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function mapSubmission(record: ApiSubmission): PriceSubmission {
  const photo = record.photoKey ? {
    fileName: record.photoKey.split("/").pop() ?? "Photo",
    contentType: record.photoContentType ?? "image/jpeg" as const,
    sizeBytes: record.photoSizeBytes ?? 0,
    photoKey: record.photoKey,
    previewUrl: record.photoUrl,
    storage: "private-s3" as const,
  } : undefined
  return {
    id: record.id,
    productId: record.productId,
    productName: record.productName ?? "Unknown product",
    storeId: record.retailerId,
    storeName: record.retailerName ?? "Unknown store",
    price: record.priceCents / 100,
    currency: "SGD",
    observedDate: singaporeDate(record.observedAt),
    status: record.status,
    submitterId: record.userId,
    submitterName: record.submitterName ?? "",
    submitterEmail: record.submitterEmail ?? "",
    submittedAt: record.submittedAt,
    photo,
    reviewedAt: record.reviewedAt,
    reviewedBy: record.reviewedBy,
    rejectionReason: record.rejectionReason,
  }
}

export class LocalSubmissionService implements SubmissionService {
  readonly mode = "local" as const
  async listProducts() { return localProducts }
  async listRetailers() { return localRetailers }

  async requestImageUpload(file: File, accessToken: string): Promise<UploadTarget> {
    requireToken(accessToken)
    await pause(120)
    const photoKey = `local-evidence/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`
    return { uploadUrl: `browser-object-url://${photoKey}`, fields: {}, photoKey, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }
  }

  async uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto> {
    onProgress?.(15); await pause(120); onProgress?.(65); await pause(120)
    const previewUrl = URL.createObjectURL(file)
    onProgress?.(100)
    return { fileName: file.name, contentType: file.type as SubmissionPhoto["contentType"], sizeBytes: file.size, photoKey: target.photoKey, previewUrl, storage: "browser-object-url" }
  }

  async createSubmission(input: CreateSubmissionInput, accessToken: string): Promise<PriceSubmission> {
    requireToken(accessToken); await pause(140)
    const product = localProducts.find((item) => item.id === input.productId)
    const cents = Math.round(input.price * 100)
    const outOfRange = product && ((product.minCents !== undefined && cents < product.minCents) || (product.maxCents !== undefined && cents > product.maxCents))
    const submission: PriceSubmission = { ...input, id: crypto.randomUUID(), status: outOfRange ? "flagged" : "accepted", submittedAt: new Date().toISOString() }
    writeSubmissions([submission, ...readSubmissions()])
    return submission
  }

  async listMySubmissions(userId: string, accessToken: string) { requireToken(accessToken); return readSubmissions().filter((item) => item.submitterId === userId) }
  async listPendingSubmissions(actor: SubmissionActor, accessToken: string) {
    requireToken(accessToken)
    if (actor.role !== "admin") throw new Error("Administrator permission is required to review submissions.")
    return readSubmissions().filter((item) => item.status === "flagged")
  }

  async moderateSubmission(id: string, decision: "accepted" | "rejected", reason: string | undefined, actor: SubmissionActor, accessToken: string) {
    requireToken(accessToken)
    if (actor.role !== "admin") throw new Error("Administrator permission is required to moderate submissions.")
    if (decision === "rejected" && !reason?.trim()) throw new Error("Enter a reason before rejecting this submission.")
    await pause(160)
    const submissions = readSubmissions()
    const index = submissions.findIndex((item) => item.id === id)
    if (index < 0) throw new Error("This submission could not be found.")
    if (submissions[index].status !== "flagged") throw new SubmissionServiceError(`This submission is already ${submissions[index].status}.`, 409, "ALREADY_MODERATED")
    const updated: PriceSubmission = { ...submissions[index], status: decision, rejectionReason: decision === "rejected" ? reason?.trim() : undefined, reviewedAt: new Date().toISOString(), reviewedBy: actor.id }
    submissions[index] = updated; writeSubmissions(submissions)
    return updated
  }
}

export class ApiSubmissionService implements SubmissionService {
  readonly mode = "api" as const
  private readonly baseUrl: string

  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL, private readonly options: ApiServiceOptions = {}) {
    if (!baseUrl?.trim()) throw new Error("API mode requires VITE_API_BASE_URL.")
    this.baseUrl = baseUrl.replace(/\/+$/, "")
  }

  private async parseError(response: Response): Promise<SubmissionServiceError> {
    let body: ApiErrorBody = {}
    try { body = await response.json() as ApiErrorBody } catch { /* Gateway and S3 failures may not be JSON. */ }
    const code = body.code ?? (response.status === 401 ? "SESSION_ENDED" : `HTTP_${response.status}`)
    const message = response.status === 401 ? "Your session has ended. Sign in again and retry." : body.message ?? (response.status >= 500 ? "The service could not complete the request. Please retry." : "The request could not be completed.")
    return new SubmissionServiceError(message, response.status, code, body.fieldErrors, body.requestId)
  }

  private async request<T>(path: string, init: RequestInit = {}, token?: string, mayRetry = true): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body) headers.set("Content-Type", "application/json")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    if (response.status === 401 && token && mayRetry && this.options.refreshAccessToken) {
      try {
        const refreshedToken = await this.options.refreshAccessToken()
        if (refreshedToken) return this.request<T>(path, init, refreshedToken, false)
      } catch { /* Clear the unusable session below. */ }
    }
    if (!response.ok) {
      if (response.status === 401) await this.options.onSessionEnded?.()
      throw await this.parseError(response)
    }
    return await response.json() as T
  }

  async listProducts() { return (await this.request<{ items: CatalogProduct[] }>("/products")).items }
  async listRetailers() { return (await this.request<{ items: CatalogRetailer[] }>("/retailers")).items }

  async requestImageUpload(file: File, accessToken: string): Promise<UploadTarget> {
    requireToken(accessToken)
    return this.request("/price-submissions/image-upload-url", { method: "POST", body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }) }, accessToken)
  }

  async uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto> {
    const form = new FormData()
    Object.entries(target.fields).forEach(([key, value]) => form.append(key, value))
    form.append("file", file)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", target.uploadUrl)
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)) }
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new SubmissionServiceError("The photo upload failed or expired. Choose the image and try again.", xhr.status, "UPLOAD_FAILED"))
      xhr.onerror = () => reject(new SubmissionServiceError("The photo upload failed. Check your connection and try again.", undefined, "UPLOAD_FAILED"))
      xhr.onabort = () => reject(new SubmissionServiceError("The photo upload was cancelled.", undefined, "UPLOAD_FAILED"))
      xhr.send(form)
    })
    onProgress?.(100)
    return { fileName: file.name, contentType: file.type as SubmissionPhoto["contentType"], sizeBytes: file.size, photoKey: target.photoKey, previewUrl: URL.createObjectURL(file), storage: "private-s3" }
  }

  async createSubmission(input: CreateSubmissionInput, accessToken: string) {
    requireToken(accessToken)
    const body = { productId: input.productId, retailerId: input.storeId, priceCents: Math.round(input.price * 100), observedAt: input.observedDate, ...(input.photo?.photoKey ? { photoKey: input.photo.photoKey } : {}) }
    return mapSubmission(await this.request<ApiSubmission>("/price-submissions", { method: "POST", body: JSON.stringify(body) }, accessToken))
  }

  private async listAll(path: string, accessToken: string) {
    requireToken(accessToken)
    const records: ApiSubmission[] = []
    let nextToken: string | null = null
    do {
      const separator = path.includes("?") ? "&" : "?"
      const pagePath = nextToken ? `${path}${separator}nextToken=${encodeURIComponent(nextToken)}` : path
      const page: ApiPage<ApiSubmission> = await this.request(pagePath, {}, accessToken)
      records.push(...page.items); nextToken = page.nextToken
    } while (nextToken)
    return records.map(mapSubmission)
  }

  async listMySubmissions(_userId: string, accessToken: string) { return this.listAll("/price-submissions/mine", accessToken) }
  async listPendingSubmissions(_actor: SubmissionActor, accessToken: string) { return this.listAll("/admin/price-submissions?status=flagged", accessToken) }
  async moderateSubmission(id: string, decision: "accepted" | "rejected", reason: string | undefined, _actor: SubmissionActor, accessToken: string) {
    requireToken(accessToken)
    const body = { decision, ...(decision === "rejected" ? { reason: reason?.trim() } : {}) }
    return mapSubmission(await this.request<ApiSubmission>(`/admin/price-submissions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, accessToken))
  }
}

const configuredMode = import.meta.env.VITE_PRICE_SUBMISSION_MODE ?? (import.meta.env.DEV ? "local" : "api")
export const submissionMode = configuredMode
export function createSubmissionService(options: ApiServiceOptions = {}): SubmissionService { return configuredMode === "local" ? new LocalSubmissionService() : new ApiSubmissionService(undefined, options) }
