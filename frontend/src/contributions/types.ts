import type { AuthRole } from "../auth/types"

export type SubmissionStatus = "pending" | "approved" | "rejected"

export interface SubmissionPhoto {
  fileName: string
  contentType: "image/jpeg" | "image/png"
  sizeBytes: number
  photoKey: string
  previewUrl?: string
  storage: "browser-object-url" | "private-s3"
}

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
  photoKey: string
  expiresAt: string
}

export interface SubmissionActor {
  id: string
  role: AuthRole
}

export interface SubmissionService {
  readonly mode: "local" | "api-unavailable"
  requestImageUpload(file: File, accessToken: string): Promise<UploadTarget>
  uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto>
  createSubmission(input: CreateSubmissionInput, accessToken: string): Promise<PriceSubmission>
  listMySubmissions(userId: string, accessToken: string): Promise<PriceSubmission[]>
  listPendingSubmissions(actor: SubmissionActor, accessToken: string): Promise<PriceSubmission[]>
  moderateSubmission(id: string, decision: "approved" | "rejected", reason: string | undefined, actor: SubmissionActor, accessToken: string): Promise<PriceSubmission>
}
