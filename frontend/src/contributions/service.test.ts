import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiSubmissionService, LocalSubmissionService, SubmissionServiceError } from "./service"

const input = {
  productId: "gardenia-white-600g",
  productName: "Gardenia Original Classic White Bread · 600 g",
  storeId: "fairprice",
  storeName: "FairPrice",
  price: 2.8,
  currency: "SGD" as const,
  observedDate: "2026-10-19",
  submitterId: "user-1",
  submitterName: "Alex Tan",
  submitterEmail: "alex@example.com",
}

describe("LocalSubmissionService", () => {
  beforeEach(() => localStorage.clear())

  it("stores local submissions and lists only the current user's records", async () => {
    const service = new LocalSubmissionService()
    const created = await service.createSubmission(input, "token")
    expect(created.status).toBe("accepted")
    expect(await service.listMySubmissions("user-1", "token")).toEqual([created])
    expect(await service.listMySubmissions("another-user", "token")).toEqual([])
  })

  it("enforces administrator role and a rejection reason in the local adapter", async () => {
    const service = new LocalSubmissionService()
    const created = await service.createSubmission({ ...input, price: 20 }, "token")
    await expect(service.listPendingSubmissions({ id: "user-1", role: "user" }, "token")).rejects.toThrow("Administrator permission")
    await expect(service.moderateSubmission(created.id, "rejected", "", { id: "admin-1", role: "admin" }, "token")).rejects.toThrow("Enter a reason")
    const rejected = await service.moderateSubmission(created.id, "rejected", "Image is unclear", { id: "admin-1", role: "admin" }, "token")
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Image is unclear", reviewedBy: "admin-1" })
  })
})

describe("ApiSubmissionService", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("loads the canonical public catalogs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "product-uuid", name: "Milk" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "fairprice", name: "FairPrice" }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.example.test/")
    expect(await service.listProducts()).toEqual([{ id: "product-uuid", name: "Milk" }])
    expect(await service.listRetailers()).toEqual([{ id: "fairprice", name: "FairPrice" }])
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.example.test/products", expect.anything())
  })

  it("requests and performs a presigned multipart POST with the file last", async () => {
    const target = { uploadUrl: "https://upload.example.test", fields: { key: "price-evidence/user/photo.png", policy: "opaque" }, photoKey: "price-evidence/user/photo.png", expiresAt: "2026-10-24T10:00:00Z" }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(target), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    let sentForm: FormData | undefined
    class FakeXhr {
      status = 204
      upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
      onload?: () => void
      onerror?: () => void
      onabort?: () => void
      open(method: string) { expect(method).toBe("POST") }
      send(form: FormData) { sentForm = form; this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 }); this.onload?.() }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    const service = new ApiSubmissionService("https://api.example.test")
    const file = new File(["image"], "shelf.png", { type: "image/png" })
    expect(await service.requestImageUpload(file, "token")).toEqual(target)
    const progress = vi.fn()
    const photo = await service.uploadImage(target, file, progress)
    expect([...sentForm!.keys()]).toEqual(["key", "policy", "file"])
    expect(progress).toHaveBeenCalledWith(50)
    expect(photo).toMatchObject({ photoKey: target.photoKey, storage: "private-s3" })
  })

  it("maps create and list records, including Singapore observed dates", async () => {
    const record = {
      id: "opaque-id", productId: "product-uuid", productName: "Milk", retailerId: "fairprice", retailerName: "FairPrice",
      userId: "user-1", priceCents: 363, observedAt: "2026-10-23T16:00:00.000Z", submittedAt: "2026-10-24T08:00:00.000Z", status: "accepted",
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [record], nextToken: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...record, status: "flagged" }], nextToken: null }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.example.test")
    const created = await service.createSubmission({ ...input, productId: "product-uuid", storeId: "fairprice", observedDate: "2026-10-24" }, "token")
    expect(created).toMatchObject({ storeId: "fairprice", price: 3.63, observedDate: "2026-10-24", status: "accepted" })
    const createBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(createBody).toEqual({ productId: "product-uuid", retailerId: "fairprice", priceCents: 280, observedAt: "2026-10-24" })
    expect(await service.listMySubmissions("ignored", "token")).toHaveLength(1)
    expect(await service.listPendingSubmissions({ id: "admin", role: "admin" }, "token")).toMatchObject([{ status: "flagged" }])
  })

  it("sends accepted moderation and exposes backend errors with request IDs", async () => {
    const accepted = { id: "opaque/id", productId: "p", productName: "Milk", retailerId: "r", retailerName: "Store", userId: "u", priceCents: 2000, observedAt: "2026-10-24T00:00:00Z", submittedAt: "2026-10-24T00:00:00Z", status: "accepted" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(accepted), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "DUPLICATE_SUBMISSION", message: "Already submitted.", requestId: "req-123" }), { status: 409 }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.example.test")
    await service.moderateSubmission("opaque/id", "accepted", undefined, { id: "admin", role: "admin" }, "token")
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/admin/price-submissions/opaque%2Fid")
    await expect(service.createSubmission(input, "token")).rejects.toMatchObject<Partial<SubmissionServiceError>>({ code: "DUPLICATE_SUBMISSION", requestId: "req-123" })
  })

  it("refreshes once after a 401 and clears a still-invalid session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "expired" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "revoked" }), { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const onSessionEnded = vi.fn()
    const service = new ApiSubmissionService("https://api.example.test", { refreshAccessToken: vi.fn().mockResolvedValue("fresh-token"), onSessionEnded })
    await expect(service.listMySubmissions("user", "old-token")).rejects.toMatchObject({ code: "SESSION_ENDED" })
    expect(onSessionEnded).toHaveBeenCalledOnce()
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get("Authorization")).toBe("Bearer fresh-token")
  })
})
