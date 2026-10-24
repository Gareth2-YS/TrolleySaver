import type { CreateSubmissionInput, PriceSubmission, SubmissionActor, SubmissionPhoto, SubmissionService, UploadTarget } from "./types"

const STORAGE_KEY = "trolleysaver.local.price-submissions.v1"

function requireToken(token: string) {
  if (!token) throw new Error("Your session is unavailable. Sign in again and retry.")
}

function readSubmissions(): PriceSubmission[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as PriceSubmission[] } catch { return [] }
}

function writeSubmissions(submissions: PriceSubmission[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions))
}

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class LocalSubmissionService implements SubmissionService {
  readonly mode = "local" as const

  async requestImageUpload(file: File, accessToken: string): Promise<UploadTarget> {
    requireToken(accessToken)
    await pause(120)
    const photoKey = `local-evidence/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`
    return { uploadUrl: `browser-object-url://${photoKey}`, photoKey, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }
  }

  async uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto> {
    onProgress?.(15)
    await pause(120)
    onProgress?.(65)
    await pause(120)
    const previewUrl = URL.createObjectURL(file)
    onProgress?.(100)
    return { fileName: file.name, contentType: file.type as SubmissionPhoto["contentType"], sizeBytes: file.size, photoKey: target.photoKey, previewUrl, storage: "browser-object-url" }
  }

  async createSubmission(input: CreateSubmissionInput, accessToken: string): Promise<PriceSubmission> {
    requireToken(accessToken)
    await pause(140)
    const submission: PriceSubmission = { ...input, id: crypto.randomUUID(), status: "pending", submittedAt: new Date().toISOString() }
    writeSubmissions([submission, ...readSubmissions()])
    return submission
  }

  async listMySubmissions(userId: string, accessToken: string) {
    requireToken(accessToken)
    return readSubmissions().filter((submission) => submission.submitterId === userId)
  }

  async listPendingSubmissions(actor: SubmissionActor, accessToken: string) {
    requireToken(accessToken)
    if (actor.role !== "admin") throw new Error("Administrator permission is required to review submissions.")
    return readSubmissions().filter((submission) => submission.status === "pending")
  }

  async moderateSubmission(id: string, decision: "approved" | "rejected", reason: string | undefined, actor: SubmissionActor, accessToken: string) {
    requireToken(accessToken)
    if (actor.role !== "admin") throw new Error("Administrator permission is required to moderate submissions.")
    if (decision === "rejected" && !reason?.trim()) throw new Error("Enter a reason before rejecting this submission.")
    await pause(160)
    const submissions = readSubmissions()
    const index = submissions.findIndex((submission) => submission.id === id)
    if (index < 0) throw new Error("This submission could not be found.")
    const updated: PriceSubmission = { ...submissions[index], status: decision, rejectionReason: decision === "rejected" ? reason?.trim() : undefined, reviewedAt: new Date().toISOString(), reviewedBy: actor.id }
    submissions[index] = updated
    writeSubmissions(submissions)
    return updated
  }
}

class UnavailableApiSubmissionService implements SubmissionService {
  readonly mode = "api-unavailable" as const
  private unavailable(): never { throw new Error("The production price-submission API is not connected. Switch to local mode for development testing.") }
  async requestImageUpload(file: File, accessToken: string): Promise<UploadTarget> { void file; void accessToken; return this.unavailable() }
  async uploadImage(target: UploadTarget, file: File, onProgress?: (percent: number) => void): Promise<SubmissionPhoto> { void target; void file; void onProgress; return this.unavailable() }
  async createSubmission(input: CreateSubmissionInput, accessToken: string): Promise<PriceSubmission> { void input; void accessToken; return this.unavailable() }
  async listMySubmissions(userId: string, accessToken: string): Promise<PriceSubmission[]> { void userId; void accessToken; return this.unavailable() }
  async listPendingSubmissions(actor: SubmissionActor, accessToken: string): Promise<PriceSubmission[]> { void actor; void accessToken; return this.unavailable() }
  async moderateSubmission(id: string, decision: "approved" | "rejected", reason: string | undefined, actor: SubmissionActor, accessToken: string): Promise<PriceSubmission> { void id; void decision; void reason; void actor; void accessToken; return this.unavailable() }
}

const configuredMode = import.meta.env.VITE_PRICE_SUBMISSION_MODE ?? (import.meta.env.DEV ? "local" : "api")
export const submissionMode = configuredMode

export function createSubmissionService(): SubmissionService {
  return configuredMode === "local" ? new LocalSubmissionService() : new UnavailableApiSubmissionService()
}
