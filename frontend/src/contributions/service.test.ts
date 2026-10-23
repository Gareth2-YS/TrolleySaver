import { beforeEach, describe, expect, it } from "vitest"
import { LocalSubmissionService } from "./service"

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
    expect(created.status).toBe("pending")
    expect(await service.listMySubmissions("user-1", "token")).toEqual([created])
    expect(await service.listMySubmissions("another-user", "token")).toEqual([])
  })

  it("enforces administrator role and a rejection reason in the local adapter", async () => {
    const service = new LocalSubmissionService()
    const created = await service.createSubmission(input, "token")
    await expect(service.listPendingSubmissions({ id: "user-1", role: "user" }, "token")).rejects.toThrow("Administrator permission")
    await expect(service.moderateSubmission(created.id, "rejected", "", { id: "admin-1", role: "admin" }, "token")).rejects.toThrow("Enter a reason")
    const rejected = await service.moderateSubmission(created.id, "rejected", "Image is unclear", { id: "admin-1", role: "admin" }, "token")
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Image is unclear", reviewedBy: "admin-1" })
  })
})
