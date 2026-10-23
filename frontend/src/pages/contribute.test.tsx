import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import { ProtectedRoute } from "../auth/route-guards"
import type { AuthRole, AuthService } from "../auth/types"
import type { PriceSubmission, SubmissionService } from "../contributions/types"
import { ContributePage } from "./contribute"

afterEach(cleanup)

const pendingSubmission: PriceSubmission = {
  id: "submission-1",
  productId: "gardenia-white-600g",
  productName: "Gardenia Original Classic White Bread · 600 g",
  storeId: "fairprice",
  storeName: "FairPrice",
  price: 2.8,
  currency: "SGD",
  observedDate: "2026-10-19",
  status: "pending",
  submitterId: "user-1",
  submitterName: "Alex Tan",
  submitterEmail: "alex@example.com",
  submittedAt: "2026-10-20T10:00:00.000Z",
  photo: { fileName: "shelf.png", contentType: "image/png", sizeBytes: 1200, photoKey: "local-evidence/shelf.png", previewUrl: "blob:shelf", storage: "browser-object-url" },
}

function authService(role: AuthRole | null): AuthService {
  return {
    signIn: vi.fn().mockResolvedValue({ type: "DONE" }),
    signUp: vi.fn().mockResolvedValue({ type: "DONE" }),
    signOut: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(role ? { id: `${role}-1`, email: `${role}@example.com`, name: role === "admin" ? "Admin Lee" : "Alex Tan", role, groups: [role] } : null),
    getAccessToken: vi.fn().mockResolvedValue(role ? "test-token" : null),
  }
}

function submissionService(overrides: Partial<SubmissionService> = {}): SubmissionService {
  return {
    mode: "local",
    requestImageUpload: vi.fn().mockResolvedValue({ uploadUrl: "browser-object-url://test", photoKey: "local-evidence/test.png", expiresAt: "2026-10-21T00:00:00.000Z" }),
    uploadImage: vi.fn().mockImplementation(async (_target, file, onProgress) => { onProgress?.(100); return { fileName: file.name, contentType: file.type, sizeBytes: file.size, photoKey: "local-evidence/test.png", previewUrl: "blob:uploaded", storage: "browser-object-url" } }),
    createSubmission: vi.fn().mockImplementation(async (input) => ({ ...pendingSubmission, ...input })),
    listMySubmissions: vi.fn().mockResolvedValue([]),
    listPendingSubmissions: vi.fn().mockResolvedValue([pendingSubmission]),
    moderateSubmission: vi.fn().mockImplementation(async (_id, decision, reason) => ({ ...pendingSubmission, status: decision, rejectionReason: reason })),
    ...overrides,
  }
}

function renderContribution(role: AuthRole, service = submissionService()) {
  return render(<MemoryRouter initialEntries={["/contribute"]}><AuthProvider serviceOverride={authService(role)}><ContributePage serviceOverride={service} /></AuthProvider></MemoryRouter>)
}

async function completeRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Product"), "gardenia-white-600g")
  await user.selectOptions(screen.getByLabelText("Store"), "fairprice")
  const price = screen.getByLabelText("Price (SGD)")
  await user.clear(price)
  await user.type(price, "2.80")
}

describe("price and image contribution workflow", () => {
  it("redirects unauthenticated visitors through the existing login route", async () => {
    render(<MemoryRouter initialEntries={["/contribute"]}><AuthProvider serviceOverride={authService(null)}><Routes><Route element={<ProtectedRoute />}><Route path="/contribute" element={<p>Protected content</p>} /></Route><Route path="/login" element={<p>Login destination</p>} /></Routes></AuthProvider></MemoryRouter>)
    expect(await screen.findByText("Login destination")).toBeInTheDocument()
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument()
  })

  it("renders contributor controls without administrator actions", async () => {
    renderContribution("user")
    expect(await screen.findByRole("heading", { name: "Share a price you spotted" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Branch")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.queryByText("Local mock mode")).not.toBeInTheDocument()
  })

  it("renders only the focused administrator review experience", async () => {
    renderContribution("admin")
    expect(await screen.findByRole("heading", { name: "Review price evidence" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument()
    expect(screen.queryByText("Smart basket")).not.toBeInTheDocument()
    expect(screen.queryByText("Search & filter")).not.toBeInTheDocument()
  })

  it("shows clear required-field validation", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await user.click(screen.getByRole("button", { name: "Submit for review" }))
    expect(await screen.findByText("Choose a product")).toBeInTheDocument()
    expect(screen.getByText("Choose a store")).toBeInTheDocument()
    expect(screen.getByText("Price must be greater than $0")).toBeInTheDocument()
  })

  it("validates and previews a selected shelf image", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await user.upload(screen.getByLabelText(/Shelf-tag photo/), new File(["image"], "shelf.png", { type: "image/png" }))
    expect(screen.getByRole("img", { name: "Selected shelf-tag preview" })).toHaveAttribute("src", "blob:test-image")
    fireEvent.change(screen.getByLabelText(/Shelf-tag photo/), { target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } })
    expect(await screen.findByText("Choose a JPG or PNG image")).toBeInTheDocument()
  })

  it("submits locally and immediately renders the pending contribution", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.click(screen.getByRole("button", { name: "Submit for review" }))
    expect(await screen.findByText("$2.80")).toBeInTheDocument()
    expect(screen.getByText("pending")).toBeInTheDocument()
    expect(service.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ storeName: "FairPrice" }), "test-token")
  })

  it("shows service failures instead of reporting fake success", async () => {
    const user = userEvent.setup()
    const service = submissionService({ createSubmission: vi.fn().mockRejectedValue(new Error("Production submission is unavailable")) })
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.click(screen.getByRole("button", { name: "Submit for review" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Production submission is unavailable")
  })

  it("allows administrators to approve and requires a reason to reject", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("admin", service)
    await user.click(await screen.findByRole("button", { name: "Reject" }))
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a reason")
    await user.type(screen.getByLabelText("Reason for rejection"), "Shelf label is unreadable")
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }))
    await waitFor(() => expect(service.moderateSubmission).toHaveBeenCalledWith("submission-1", "rejected", "Shelf label is unreadable", { id: "admin-1", role: "admin" }, "test-token"))
    expect(await screen.findByText("Review queue is clear")).toBeInTheDocument()
  })

  it("allows administrators to approve pending submissions", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("admin", service)
    await user.click(await screen.findByRole("button", { name: "Approve" }))
    await waitFor(() => expect(service.moderateSubmission).toHaveBeenCalledWith("submission-1", "approved", undefined, { id: "admin-1", role: "admin" }, "test-token"))
  })
})
