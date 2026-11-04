import type { AuthRole } from "../auth/types"

export type SubmissionStatus = "accepted" | "flagged" | "rejected"

export interface CatalogProduct {
  id: string
  name: string
  brand?: string
  category?: string
  searchTerms?: string[]
  dietary?: string[]
  minCents?: number
  maxCents?: number
}

export interface CatalogRetailer {
  id: string
  name: string
}

export interface SubmissionPhoto {
  fileName: string
  contentType: "image/jpeg" | "image/png"
  sizeBytes: number
  photoKey: string
  previewUrl?: string
  storage: "browser-object-url" | "private-s3"
}

export interface ProductFields {
  hcs: boolean
  dietary: string[]
  name: string
  brand: string
  category: string
  packQty: number
  packUnit: "ml" | "L" | "g" | "kg" | "pcs" | "rolls"
  packCount: number
}

export interface CreateProductRequestInput extends ProductFields {
  retailerId: string
  priceCents: number
  observedAt: string
  productImageKey: string
  photoKey?: string
}
export type ProductRequestStatus = "pending" | "approved" | "rejected"
export interface ProductRequest extends CreateProductRequestInput {
  minCents?: number
  maxCents?: number
  id: string
  userId: string
  status: ProductRequestStatus
  submittedAt: string
  retailerName?: string
  productId?: string
  productImageUrl?: string
  photoUrl?: string
  suggestedMinCents?: number
  suggestedMaxCents?: number
  submitterName?: string
  submitterEmail?: string
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
}
export type ProductCorrections = Partial<ProductFields> & { minCents?: number; maxCents?: number; searchTerms?: string[] }

export interface PriceSubmission {
  id: string
  productId: string
  productName: string
  storeId: string
  storeName: string
  price: number
  currency: "SGD"
  observedDate: string
  status: SubmissionStatus
  submitterId: string
  submitterName: string
  submitterEmail: string
  submittedAt: string
  photo?: SubmissionPhoto
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
}

export interface CreateSubmissionInput {
  productId: string
  productName: string
  storeId: string
  storeName: string
  price: number
  currency: "SGD"
  observedDate: string
  submitterId: string
  submitterName: string
  submitterEmail: string
  photo?: SubmissionPhoto
}

export interface UploadTarget {
  uploadUrl: string
  fields: Record<string, string>
  photoKey: string
  expiresAt: string
}

export interface SubmissionActor {
  id: string
  role: AuthRole
}

export interface SubmissionService {
  readonly mode: "local" | "api"
  listProducts(): Promise<CatalogProduct[]>
  listRetailers(): Promise<CatalogRetailer[]>
  requestImageUpload(file: File, productId: string, retailerId: string, accessToken: string): Promise<UploadTarget>
  listFacets(): Promise<{ categories: string[]; dietary: string[] }>
  requestProductImageUpload(file: File, purpose: "product-image" | "evidence", accessToken: string): Promise<UploadTarget>
  createProductRequest(input: CreateProductRequestInput, userId: string, accessToken: string): Promise<ProductRequest>
  listMyProductRequests(userId: string, accessToken: string): Promise<ProductRequest[]>
  deleteProductRequest(id: string, actor: SubmissionActor, accessToken: string): Promise<void>
  listProductRequests(status: ProductRequestStatus, actor: SubmissionActor, accessToken: string): Promise<ProductRequest[]>
  moderateProductRequest(id: string, decision: "approved" | "rejected", reason: string | undefined, changes: ProductCorrections | undefined, actor: SubmissionActor, accessToken: string): Promise<ProductRequest>
  uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto>
  createSubmission(input: CreateSubmissionInput, accessToken: string): Promise<PriceSubmission>
  deleteSubmission(id: string, actor: SubmissionActor, accessToken: string): Promise<void>
  listMySubmissions(userId: string, accessToken: string): Promise<PriceSubmission[]>
  listPendingSubmissions(actor: SubmissionActor, accessToken: string): Promise<PriceSubmission[]>
  moderateSubmission(id: string, decision: "accepted" | "rejected", reason: string | undefined, actor: SubmissionActor, accessToken: string): Promise<PriceSubmission>
}
