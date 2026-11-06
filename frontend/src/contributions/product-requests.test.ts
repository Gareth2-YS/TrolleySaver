import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiSubmissionService, LocalSubmissionService } from "./service"
import { productCorrectionsSchema, productFieldsSchema, singaporeDateString, validateImage, validationMessages } from "./schema"
import type { CreateProductRequestInput } from "./types"

export const proposal: CreateProductRequestInput = { name: "Oat Milk", brand: "Oats", category: "milk", packQty: 1, packUnit: "L", packCount: 6, hcs: true, dietary: ["halal"], retailerId: "fairprice", priceCents: 350, observedAt: singaporeDateString(), productImageKey: "product-images/pending/u/p.png", photoKey: "price-evidence/u/new-product/e.png" }
const record = { ...proposal, id: "request/1", userId: "user", status: "pending", submittedAt: new Date().toISOString(), productImageUrl: "https://images.test/product", photoUrl: "https://images.test/private" }
const admin = { id: "admin", role: "admin" as const }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())

describe("product request contracts", () => {
  it("deletes with an encoded ID, bearer token and no body, accepting an empty 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.test")
    await expect(service.deleteProductRequest("request/1", { id: "user", role: "user" }, "token")).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.test/product-requests/request%2F1")
    expect(init.method).toBe("DELETE")
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token")
    await expect(service.deleteProductRequest("request/1", { id: "user", role: "user" }, "")).rejects.toMatchObject({ code: "SESSION_ENDED" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("retries deletion once with a refreshed token and accepts its 204", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ message: "expired" }, 401)).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token")
    const service = new ApiSubmissionService("https://api.test", { refreshAccessToken })
    await service.deleteProductRequest("request/1", { id: "user", role: "user" }, "old-token")
    expect(refreshAccessToken).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer fresh-token")
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" })
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined()
  })

  it.each([[404, "NOT_FOUND"], [409, "ALREADY_MODERATED"]])("preserves deletion error %s %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code, message: "The request changed." }, status)))
    await expect(new ApiSubmissionService("https://api.test").deleteProductRequest("request/1", { id: "user", role: "user" }, "token")).rejects.toMatchObject({ status, code, message: "The request changed." })
  })

  it("uses purpose-specific uploads, flat request payloads, integer cents and the product picture key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ uploadUrl: "https://upload.test", fields: { policy: "signed" }, productImageKey: proposal.productImageKey }))
      .mockResolvedValueOnce(response({ uploadUrl: "https://upload.test", fields: {}, photoKey: proposal.photoKey }))
      .mockResolvedValueOnce(response(record, 201))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.test")
    const image = new File(["picture"], "p.png", { type: "image/png" })
    expect(await service.requestProductImageUpload(image, "product-image", "token")).toMatchObject({ photoKey: proposal.productImageKey })
    await service.requestProductImageUpload(image, "evidence", "token")
    const result = await service.createProductRequest(proposal, "ignored", "token")
    expect(result.photoUrl).toBeUndefined()
    expect(result.productImageUrl).toBe(record.productImageUrl)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://api.test/product-requests/image-upload-url", "https://api.test/product-requests/image-upload-url", "https://api.test/product-requests"])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ purpose: "product-image", contentType: "image/png", sizeBytes: 7 })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).purpose).toBe("evidence")
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(proposal)
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization")).toBe("Bearer token")
  })

  it("paginates request history, removes contributor evidence URLs, and preserves admin evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ items: [record], nextToken: "next/+" }))
      .mockResolvedValueOnce(response({ items: [{ ...record, id: "approved", status: "approved", productId: "canonical" }], nextToken: null }))
      .mockResolvedValueOnce(response({ items: [record], nextToken: null }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.test")
    const mine = await service.listMyProductRequests("user", "token")
    expect(mine.map((r) => r.status)).toEqual(["pending", "approved"])
    expect(mine.every((r) => !r.photoUrl)).toBe(true)
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/product-requests/mine?nextToken=next%2F%2B")
    expect(await service.listProductRequests("pending", admin, "token")).toMatchObject([{ photoUrl: record.photoUrl }])
  })

  it("sends supported corrections and reason-required rejection without a tagsVerified field", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(record))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.test")
    await service.moderateProductRequest(record.id, "approved", undefined, { category: "milk", hcs: false, dietary: [], minCents: 100, maxCents: 500, searchTerms: ["oat"] }, admin, "token")
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/admin/product-requests/request%2F1")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "approved", changes: { category: "milk", hcs: false, dietary: [], minCents: 100, maxCents: 500, searchTerms: ["oat"] } })
    await service.moderateProductRequest(record.id, "rejected", "  Unreadable  ", undefined, admin, "token")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ decision: "rejected", reason: "Unreadable" })
  })

  it.each([[409, "PRODUCT_EXISTS"], [409, "PRODUCT_ALREADY_REQUESTED"], [429, "RATE_LIMITED"], [400, "VALIDATION_ERROR"], [400, "PHOTO_NOT_FOUND"], [400, "INVALID_PHOTO"], [409, "PRODUCT_IMAGE_MISSING"], [409, "ALREADY_MODERATED"]])("retains actionable %s %s errors", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code, message: "Action needed", productId: "canonical", fieldErrors: { productImageKey: "Missing picture" }, requestId: "ref" }, status)))
    await expect(new ApiSubmissionService("https://api.test").createProductRequest(proposal, "user", "token")).rejects.toMatchObject({ status, code, productId: "canonical", fieldErrors: { productImageKey: "Missing picture" }, requestId: "ref" })
  })

  it("never uses a contributor evidence URL even if an unexpected price response includes one, and never calls DELETE", async () => {
    const price = { id: "p", productId: "canonical", retailerId: "fairprice", userId: "user", priceCents: 350, observedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), status: "flagged", photoKey: "private-key", photoUrl: "https://private.test/evidence" }
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [price], nextToken: null }))
    vi.stubGlobal("fetch", fetchMock)
    const service = new ApiSubmissionService("https://api.test")
    expect(await service.listMySubmissions("user", "token")).toMatchObject([{ photo: { photoKey: "private-key", previewUrl: undefined } }])
    await expect(service.deleteSubmission("p", { id: "user", role: "user" }, "token")).rejects.toMatchObject({ code: "UNSUPPORTED" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe("local product request lifecycle", () => {
  beforeEach(() => localStorage.clear())
  it("keeps requests separate from prices and publishes structured corrected products on approval", async () => {
    const service = new LocalSubmissionService()
    const pending = await service.createProductRequest(proposal, "user", "token")
    expect(await service.listMySubmissions("user", "token")).toEqual([])
    expect(await service.listMyProductRequests("other", "token")).toEqual([])
    expect((await service.listProducts()).some((p) => p.name === proposal.name)).toBe(false)
    await expect(service.listProductRequests("pending", { id: "user", role: "user" }, "token")).rejects.toThrow("Administrator")
    const approved = await service.moderateProductRequest(pending.id, "approved", undefined, { minCents: 100, maxCents: 500, hcs: false }, admin, "token")
    expect(await service.listProducts()).toContainEqual(expect.objectContaining({ id: approved.productId, packQty: 1, packCount: 6, hcs: false, minCents: 100 }))
    await expect(service.moderateProductRequest(pending.id, "approved", undefined, {}, admin, "token")).rejects.toMatchObject({ code: "ALREADY_MODERATED" })
  })
  it("requires a rejection reason and retains it in contributor history", async () => {
    const service = new LocalSubmissionService()
    const pending = await service.createProductRequest(proposal, "user", "token")
    await expect(service.moderateProductRequest(pending.id, "rejected", "", undefined, admin, "token")).rejects.toThrow("reason")
    await service.moderateProductRequest(pending.id, "rejected", "Wrong picture", undefined, admin, "token")
    expect(await service.listMyProductRequests("user", "token")).toMatchObject([{ status: "rejected", rejectionReason: "Wrong picture" }])
    await expect(service.deleteProductRequest(pending.id, { id: "user", role: "user" }, "token")).rejects.toMatchObject({ code: "ALREADY_MODERATED" })
  })
  it("preserves local pending deletion with ownership checks", async () => {
    const service = new LocalSubmissionService()
    const pending = await service.createProductRequest(proposal, "user", "token")
    await expect(service.deleteProductRequest(pending.id, { id: "other", role: "user" }, "token")).rejects.toMatchObject({ code: "NOT_FOUND" })
    await service.deleteProductRequest(pending.id, { id: "user", role: "user" }, "token")
    expect(await service.listMyProductRequests("user", "token")).toEqual([])
  })
})

describe("backend product validation boundaries", () => {
  it.each([{ name: "x" }, { name: "a".repeat(121) }, { brand: "a".repeat(61) }, { category: "a".repeat(41) }, { packQty: 0 }, { packQty: 100001 }, { packCount: 1.5 }, { packCount: 101 }, { packUnit: "oz" }, { dietary: Array(6).fill("vegan") }, { dietary: ["a".repeat(31)] }])("rejects invalid product field %j", (override) => {
    expect(productFieldsSchema.safeParse({ ...proposal, ...override }).success).toBe(false)
  })
  it("accepts decimal quantity, canonical units and empty tags; enforces ordered cents and search term limits", () => {
    expect(productFieldsSchema.safeParse({ ...proposal, packQty: 32.5, dietary: [] }).success).toBe(true)
    expect(productCorrectionsSchema.safeParse({ ...proposal, minCents: 500, maxCents: 100, searchTerms: [] }).success).toBe(false)
    expect(productCorrectionsSchema.safeParse({ ...proposal, minCents: 1, maxCents: 100000, searchTerms: Array(11).fill("oat") }).success).toBe(false)
    expect(validateImage(new File([], "empty.png", { type: "image/png" }))).toBe("Choose a non-empty image")
  })
  it("explains each invalid product field in plain words, without field paths or library defaults", () => {
    const fields = productFieldsSchema.safeParse({ ...proposal, name: "x", packQty: "", packCount: 1.5, packUnit: "oz", dietary: Array(6).fill("vegan") })
    expect(fields.success).toBe(false)
    const text = validationMessages(fields.error!.issues)
    expect(text).toContain("Product name must be 2–120 characters")
    expect(text).toContain("Pack quantity must be more than 0 and at most 100000")
    expect(text).toContain("Units per pack must be a whole number from 1 to 100")
    expect(text).toContain("Choose a pack unit")
    expect(text).toContain("Choose up to five dietary tags")
    expect(text).not.toMatch(/packQty:|packCount:|Too small|Too big|Invalid/)
    expect(validationMessages(productFieldsSchema.safeParse({ ...proposal, packQty: "abc" }).error!.issues)).toBe("Enter the pack quantity as a number")
    expect(validationMessages(productCorrectionsSchema.safeParse({ ...proposal, minCents: 500, maxCents: 100, searchTerms: [] }).error!.issues))
      .toBe("Maximum cents must not be less than minimum cents")
    expect(validationMessages(productCorrectionsSchema.safeParse({ ...proposal, minCents: 1, maxCents: 100, searchTerms: ["oat", "", ""] }).error!.issues))
      .toBe("Each search term must be 1–30 characters (check for a stray comma)")
  })
})

describe("hidden characters in product fields", () => {
  it("names the field that has one", () => {
    const messages = (overrides: Partial<typeof proposal>) => validationMessages(productFieldsSchema.safeParse({ ...proposal, ...overrides }).error?.issues ?? [])
    expect(messages({ name: "Oat​Milk" })).toBe("Product name can't contain hidden or control characters")
    expect(messages({ brand: "Oa\u0000ts" })).toBe("Brand can't contain hidden or control characters")
    expect(messages({ category: "milk⁦" })).toBe("Category can't contain hidden or control characters")
    expect(messages({ dietary: ["veg​an"] })).toBe("Dietary tags can't contain hidden or control characters")
    expect(productCorrectionsSchema.safeParse({ ...proposal, minCents: 1, maxCents: 100, searchTerms: ["oat‮"] }).error?.issues[0].message)
      .toBe("Search terms can't contain hidden or control characters")
  })
})
