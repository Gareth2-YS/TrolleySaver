import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import { ProtectedRoute } from "../auth/route-guards"
import type { AuthRole, AuthService } from "../auth/types"
import type { PriceSubmission, SubmissionService } from "../contributions/types"
import { ContributePage } from "./contribute"
import { SubmissionServiceError } from "../contributions/service"
import { singaporeDateString } from "../contributions/schema"

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const flaggedSubmission: PriceSubmission = {
  id: "submission-1",
  productId: "gardenia-white-600g",
  productName: "Gardenia Original Classic White Bread · 600 g",
  storeId: "fairprice",
  storeName: "FairPrice",
  price: 2.8,
  currency: "SGD",
  observedDate: "2026-10-19",
  status: "flagged",
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
    listFacets: vi.fn().mockResolvedValue({ categories: ["milk", "bread"], dietary: ["halal", "vegetarian"] }),
    requestProductImageUpload: vi.fn().mockResolvedValue({ uploadUrl: "https://upload.test", fields: {}, photoKey: "product-images/pending/user/p.png" }),
    createProductRequest: vi.fn().mockImplementation(async (input) => ({ ...input, id: "request-1", status: "pending", userId: "user-1" })),
    listMyProductRequests: vi.fn().mockResolvedValue([]),
    deleteProductRequest: vi.fn().mockResolvedValue(undefined),
    listProductRequests: vi.fn().mockResolvedValue([]),
    moderateProductRequest: vi.fn().mockResolvedValue({}),
    deleteSubmission: vi.fn().mockResolvedValue(undefined),
    listProducts: vi.fn().mockResolvedValue([{ id: "gardenia-white-600g", name: "Gardenia Original Classic White Bread · 600 g" }]),
    listRetailers: vi.fn().mockResolvedValue([{ id: "fairprice", name: "FairPrice" }]),
    requestImageUpload: vi.fn().mockResolvedValue({ uploadUrl: "browser-object-url://test", fields: {}, photoKey: "local-evidence/test.png", expiresAt: "2026-10-21T00:00:00.000Z" }),
    uploadImage: vi.fn().mockImplementation(async (_target, file, onProgress) => { onProgress?.(100); return { fileName: file.name, contentType: file.type, sizeBytes: file.size, photoKey: "local-evidence/test.png", previewUrl: "blob:uploaded", storage: "browser-object-url" } }),
    createSubmission: vi.fn().mockImplementation(async (input) => ({ ...flaggedSubmission, ...input })),
    listMySubmissions: vi.fn().mockResolvedValue([]),
    listPendingSubmissions: vi.fn().mockResolvedValue([flaggedSubmission]),
    moderateSubmission: vi.fn().mockImplementation(async (_id, decision, reason) => ({ ...flaggedSubmission, status: decision, rejectionReason: reason })),
    ...overrides,
  }
}

function renderContribution(role: AuthRole, service = submissionService()) {
  return render(<MemoryRouter initialEntries={["/contribute"]}><AuthProvider serviceOverride={authService(role)}><ContributePage serviceOverride={service} /></AuthProvider></MemoryRouter>)
}

async function completeRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Product" }))
  await user.click(await screen.findByRole("option", { name: /Gardenia Original Classic White Bread/ }))
  await user.selectOptions(screen.getByLabelText("Store"), "fairprice")
  const price = screen.getByLabelText("Price (SGD)")
  await user.clear(price)
  await user.type(price, "2.80")
}

describe("price and image contribution workflow", () => {
  it("keeps the chosen product when the type filter still fits, and clears the box with the choice when it doesn't", async () => {
    const user = userEvent.setup()
    const service = submissionService({ listProducts: vi.fn().mockResolvedValue([
      { id: "bread", name: "Gardenia bread", brand: "Gardenia", category: "bread" },
      { id: "milk", name: "Meiji milk", brand: "Meiji", category: "milk" },
    ]) })
    renderContribution("user", service)
    const search = await screen.findByRole("combobox", { name: "Product" })
    await waitFor(() => expect(search).toBeEnabled())
    await user.click(search)
    await user.click(await screen.findByRole("option", { name: /Meiji milk/ }))
    await user.selectOptions(screen.getByLabelText("Type (optional)"), "milk")
    expect(search).toHaveValue("Meiji milk")
    await user.selectOptions(screen.getByLabelText("Type (optional)"), "")
    expect(search).toHaveValue("Meiji milk")
    await user.selectOptions(screen.getByLabelText("Type (optional)"), "bread")
    expect(search).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Submit price" }))
    expect(await screen.findByText("Choose a product")).toBeInTheDocument()
    expect(service.createSubmission).not.toHaveBeenCalled()
  })

  it("shows a configuration message instead of a blank page when the API isn't configured", async () => {
    const createService = () => { throw new Error("API mode requires VITE_API_BASE_URL.") }
    render(<MemoryRouter initialEntries={["/contribute"]}><AuthProvider serviceOverride={authService("user")}><ContributePage createService={createService} /></AuthProvider></MemoryRouter>)
    expect(await screen.findByRole("alert")).toHaveTextContent("Price submissions are not configured. Set VITE_API_BASE_URL in frontend/.env.local, or set VITE_PRICE_SUBMISSION_MODE=local.")
  })

  it("keeps product search, category filtering and Clear alongside new-product uploads", async () => {
    const user = userEvent.setup()
    const service = submissionService({ listProducts: vi.fn().mockResolvedValue([
      { id: "bread", name: "Gardenia bread", brand: "Gardenia", category: "bread" },
      { id: "milk", name: "Meiji milk", brand: "Meiji", category: "milk" },
    ]) })
    renderContribution("user", service)
    const search = await screen.findByRole("combobox", { name: "Product" })
    await waitFor(() => expect(search).toBeEnabled())
    await user.type(search, "Meiji")
    expect(screen.getByRole("option", { name: /Meiji milk/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Gardenia bread/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(search).toHaveValue("")
    await user.selectOptions(screen.getByLabelText("Type (optional)"), "bread")
    expect(screen.getByRole("option", { name: /Gardenia bread/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Meiji milk/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.getByLabelText("Type (optional)")).toHaveValue("")
    await user.click(screen.getByRole("tab", { name: "New product" }))
    expect(screen.getByRole("tab", { name: "New product" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByLabelText("Product name")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit product for review" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("redirects unauthenticated visitors through the existing login route", async () => {
    render(<MemoryRouter initialEntries={["/contribute"]}><AuthProvider serviceOverride={authService(null)}><Routes><Route element={<ProtectedRoute />}><Route path="/contribute" element={<p>Protected content</p>} /></Route><Route path="/login" element={<p>Login destination</p>} /></Routes></AuthProvider></MemoryRouter>)
    expect(await screen.findByText("Login destination")).toBeInTheDocument()
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument()
  })

  it("renders contributor controls without administrator actions", async () => {
    renderContribution("user")
    expect(await screen.findByRole("heading", { name: "Share a price you spotted" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit price" })).toBeInTheDocument()
    expect(screen.getByLabelText("Price evidence photo")).toHaveAccessibleDescription(/Helps an admin check the price quickly/)
    expect(screen.getByRole("tab", { name: "Existing product" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByLabelText("Product picture")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Branch")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.queryByText("Local mock mode")).not.toBeInTheDocument()
  })

  it("renders only the focused administrator review experience", async () => {
    renderContribution("admin")
    expect(await screen.findByRole("heading", { name: "Review price evidence" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit price" })).not.toBeInTheDocument()
    expect(screen.queryByText("Smart basket")).not.toBeInTheDocument()
    expect(screen.queryByText("Search & filter")).not.toBeInTheDocument()
  })

  it("shows clear required-field validation", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await user.click(screen.getByRole("button", { name: "Submit price" }))
    expect(await screen.findByText("Choose a product")).toBeInTheDocument()
    expect(screen.getByText("Choose a store")).toBeInTheDocument()
    expect(screen.getByText("Price must be greater than $0")).toBeInTheDocument()
  })

  it("validates and previews a selected shelf image", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await user.upload(screen.getByLabelText(/Price evidence photo/), new File(["image"], "shelf.png", { type: "image/png" }))
    expect(screen.getByRole("img", { name: "Selected price evidence preview" })).toHaveAttribute("src", "blob:test-image")
    fireEvent.change(screen.getByLabelText(/Price evidence photo/), { target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } })
    expect(await screen.findByText("Choose a JPG or PNG image")).toBeInTheDocument()
  })

  it("refuses a 'photo' the browser can't read as an image, before anything is uploaded", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new DOMException("The source image could not be decoded.")))
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await user.upload(screen.getByLabelText(/Price evidence photo/), new File(["<html>"], "shelf.png", { type: "image/png" }))
    expect(await screen.findByText("This file isn't a readable JPG or PNG image")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Selected price evidence preview" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit price" })).toBeDisabled()
    expect(service.requestImageUpload).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("submits and immediately renders the backend status", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.click(screen.getByRole("button", { name: "Submit price" }))
    expect(await screen.findByText("$2.80")).toBeInTheDocument()
    expect(screen.getByText("Pending review")).toBeInTheDocument()
    expect(service.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ storeName: "FairPrice" }), "test-token")
  })

  it("shows service failures instead of reporting fake success", async () => {
    const user = userEvent.setup()
    const service = submissionService({ createSubmission: vi.fn().mockRejectedValue(new Error("Production submission is unavailable")) })
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.click(screen.getByRole("button", { name: "Submit price" }))
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

  it("allows administrators to accept flagged submissions", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("admin", service)
    await user.click(await screen.findByRole("button", { name: "Accept" }))
    await waitFor(() => expect(service.moderateSubmission).toHaveBeenCalledWith("submission-1", "accepted", undefined, { id: "admin-1", role: "admin" }, "test-token"))
  })
})

const requestRecord = {
  id: "request-1", userId: "user-1", name: "Oat milk", brand: "Oat Brand", category: "milk", packQty: 1, packUnit: "L" as const, packCount: 1,
  hcs: true, dietary: ["halal"], retailerId: "fairprice", retailerName: "FairPrice", priceCents: 350, observedAt: singaporeDateString(),
  submittedAt: new Date().toISOString(), status: "pending" as const, productImageKey: "picture", productImageUrl: "https://images.test/product.png",
  photoKey: "private", photoUrl: "https://images.test/evidence.png", suggestedMinCents: 175, suggestedMaxCents: 525,
}

describe("integrated product request screens", () => {
  it("does not replace a selected history filter with a late pending-queue response", async () => {
    const user = userEvent.setup()
    let resolvePending!: (items: typeof requestRecord[]) => void
    const delayed = new Promise<typeof requestRecord[]>((resolve) => { resolvePending = resolve })
    const service = submissionService({ listProductRequests: vi.fn().mockImplementation((status) => status === "pending" ? delayed : Promise.resolve([])) })
    renderContribution("admin", service)
    await user.selectOptions(await screen.findByLabelText("Request status"), "approved")
    await waitFor(() => expect(service.listProductRequests).toHaveBeenCalledWith("approved", expect.anything(), "test-token"))
    resolvePending([requestRecord])
    await waitFor(() => expect(screen.getByText("No approved product requests.")).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: "Approve product" })).not.toBeInTheDocument()
  })

  it("offers deletion only for pending requests and prices, and shows contributors their own evidence photos", async () => {
    renderContribution("user", submissionService({ mode: "api", listMySubmissions: vi.fn().mockResolvedValue([flaggedSubmission]), listMyProductRequests: vi.fn().mockResolvedValue([
      requestRecord, { ...requestRecord, id: "approved", status: "approved", productId: "canonical" }, { ...requestRecord, id: "rejected", status: "rejected", rejectionReason: "Wrong packaging" },
    ]) }))
    expect(await screen.findByText("Wrong packaging", { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Added to the catalog/)).toBeInTheDocument()
    // Contributors see the evidence photos they sent, on product requests and on prices.
    const requestPhotos = screen.getAllByRole("button", { name: "Enlarge image of Price evidence for Oat milk" })
    expect(requestPhotos).toHaveLength(3)
    expect(within(requestPhotos[0]).getByRole("img")).toHaveAttribute("src", requestRecord.photoUrl)
    expect(screen.getByRole("button", { name: `Enlarge image of Price evidence for ${flaggedSubmission.productName}` })).toBeInTheDocument()
    expect(screen.queryByText(/visible to administrators|admins only/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: /Product picture/ })).toHaveLength(3)
    expect(screen.getAllByRole("button", { name: "Delete request" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Delete price" })).toHaveLength(1)
  })

  it("sends selected product and retailer for an existing-product evidence upload", async () => {
    const user = userEvent.setup(); const service = submissionService()
    renderContribution("user", service)
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.upload(screen.getByLabelText("Price evidence photo"), new File(["image"], "e.png", { type: "image/png" }))
    await user.click(screen.getByRole("button", { name: "Submit price" }))
    await waitFor(() => expect(service.requestImageUpload).toHaveBeenCalledWith(expect.any(File), "gardenia-white-600g", "fairprice", "test-token"))
  })

  it("reviews corrections, ranges and claims through the product request contract and refreshes on concurrent decisions", async () => {
    const user = userEvent.setup()
    const service = submissionService({ listPendingSubmissions: vi.fn().mockResolvedValue([]), listProductRequests: vi.fn().mockResolvedValueOnce([requestRecord]).mockResolvedValue([]), moderateProductRequest: vi.fn().mockRejectedValue(new SubmissionServiceError("Another administrator already decided. Queue refreshed.", 409, "ALREADY_MODERATED")) })
    renderContribution("admin", service)
    const approve = await screen.findByRole("button", { name: "Approve product" })
    expect(approve).toBeDisabled()
    expect(screen.getByRole("img", { name: "Price evidence for Oat milk" })).toHaveAttribute("src", requestRecord.photoUrl)
    await user.clear(screen.getByLabelText("Category")); await user.type(screen.getByLabelText("Category"), "plant milk")
    await user.click(screen.getByLabelText("Healthier Choice Symbol"))
    await user.click(screen.getByRole("checkbox", { name: /I reviewed the packaging/ }))
    await user.click(approve)
    await waitFor(() => expect(service.moderateProductRequest).toHaveBeenCalledWith("request-1", "approved", "", expect.objectContaining({ category: "plant milk", hcs: false, minCents: 175, maxCents: 525 }), { id: "admin-1", role: "admin" }, "test-token"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Another administrator already decided")
    expect(screen.queryByRole("button", { name: "Approve product" })).not.toBeInTheDocument()
  })

  it("requires a product-request rejection reason and supports admin history", async () => {
    const user = userEvent.setup()
    const service = submissionService({ listPendingSubmissions: vi.fn().mockResolvedValue([]), listProductRequests: vi.fn().mockResolvedValueOnce([requestRecord]).mockResolvedValue([]) })
    renderContribution("admin", service)
    await user.click(await screen.findByRole("button", { name: "Reject product" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a reason")
    expect(service.moderateProductRequest).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText("Reason for rejection"), "Unclear packaging")
    await user.click(screen.getByRole("button", { name: "Reject product" }))
    await waitFor(() => expect(service.moderateProductRequest).toHaveBeenCalledWith("request-1", "rejected", "Unclear packaging", undefined, { id: "admin-1", role: "admin" }, "test-token"))
    await user.selectOptions(screen.getByLabelText("Request status"), "approved")
    await waitFor(() => expect(service.listProductRequests).toHaveBeenLastCalledWith("approved", { id: "admin-1", role: "admin" }, "test-token"))
  })

  it("switches to the existing product after a duplicate, keeping the shared fields, and uses separate product/evidence uploads", async () => {
    const user = userEvent.setup()
    const service = submissionService({ createProductRequest: vi.fn().mockRejectedValue(new SubmissionServiceError("Already in the catalog.", 409, "PRODUCT_EXISTS", undefined, undefined, "gardenia-white-600g")) })
    renderContribution("user", service)
    await user.click(await screen.findByRole("tab", { name: "New product" }))
    await user.type(screen.getByLabelText("Product name"), "Oat milk")
    await user.type(screen.getByLabelText("Brand"), "Oats")
    await user.type(screen.getByLabelText("Category"), "milk")
    await user.type(screen.getByLabelText("Pack quantity"), "1")
    await waitFor(() => expect(screen.getByLabelText("Store")).toBeEnabled())
    await user.selectOptions(screen.getByLabelText("Store"), "fairprice")
    await user.clear(screen.getByLabelText("Price (SGD)"))
    await user.type(screen.getByLabelText("Price (SGD)"), "3.50")
    const file = new File(["picture"], "p.png", { type: "image/png" })
    await user.upload(screen.getByLabelText("Product picture"), file)
    await user.upload(screen.getByLabelText("Price evidence photo"), file)
    await user.click(screen.getByRole("button", { name: "Submit product for review" }))
    expect(await screen.findByText("Already in the catalog. It's selected below, so you can send your price for it instead.")).toBeInTheDocument()
    expect(service.requestProductImageUpload).toHaveBeenNthCalledWith(1, expect.any(File), "product-image", "test-token")
    expect(service.requestProductImageUpload).toHaveBeenNthCalledWith(2, expect.any(File), "evidence", "test-token")
    expect(service.createSubmission).not.toHaveBeenCalled()
    expect(screen.getByRole("tab", { name: "Existing product" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue("Gardenia Original Classic White Bread · 600 g")
    expect(screen.getByLabelText("Store")).toHaveValue("fairprice")
    expect(screen.getByLabelText("Price (SGD)")).toHaveValue(3.5)
  })
})


describe("new products and deletion", () => {
  it.each(["local", "api"] as const)("confirms deletion in %s mode and leaves price submissions intact", async (mode) => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true)
    let finishDelete!: () => void
    const service = submissionService({ mode, listMyProductRequests: vi.fn().mockResolvedValue([requestRecord]), listMySubmissions: vi.fn().mockResolvedValue([flaggedSubmission]), deleteProductRequest: vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishDelete = resolve })) })
    renderContribution("user", service)
    const remove = await screen.findByRole("button", { name: "Delete request" })
    await user.click(remove)
    expect(service.deleteProductRequest).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith("Delete this request? Its product picture and price evidence photo will be removed too. This cannot be undone.")
    await user.click(remove)
    expect(service.deleteProductRequest).toHaveBeenCalledWith("request-1", { id: "user-1", role: "user" }, "test-token")
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled()
    finishDelete()
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deleting…" })).not.toBeInTheDocument())
    expect(screen.queryByRole("heading", { name: /Oat milk/ })).not.toBeInTheDocument()
    expect(screen.getByText(flaggedSubmission.productName)).toBeInTheDocument()
    expect(service.deleteSubmission).not.toHaveBeenCalled()
  })

  it("does not restore a deleted request when an older refresh finishes afterward", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    let finishRefresh!: (items: typeof requestRecord[]) => void
    const service = submissionService({ mode: "api", listMyProductRequests: vi.fn().mockResolvedValueOnce([requestRecord]).mockImplementation(() => new Promise<typeof requestRecord[]>((resolve) => { finishRefresh = resolve })) })
    renderContribution("user", service)
    await screen.findByRole("button", { name: "Delete request" })
    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await user.click(screen.getByRole("button", { name: "Delete request" }))
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Oat milk/ })).not.toBeInTheDocument())
    await act(async () => { finishRefresh([requestRecord]) })
    expect(screen.queryByRole("heading", { name: /Oat milk/ })).not.toBeInTheDocument()
  })

  it("shows the submissions as loading, not empty, until they arrive and while refreshing", async () => {
    const user = userEvent.setup()
    let finishLoad!: (items: typeof requestRecord[]) => void
    const pending = () => new Promise<typeof requestRecord[]>((resolve) => { finishLoad = resolve })
    const service = submissionService({ mode: "api", listMyProductRequests: vi.fn().mockImplementation(pending) })
    renderContribution("user", service)

    const section = await screen.findByRole("region", { name: "Your submissions" })
    expect(await within(section).findByText("Loading your submissions…")).toBeInTheDocument()
    expect(within(section).queryByText("Nothing here yet")).not.toBeInTheDocument()
    expect(within(section).getByRole("button", { name: "Refresh" })).toBeDisabled()
    await act(async () => { finishLoad([requestRecord]) })
    expect(await within(section).findByRole("heading", { name: /Oat milk/ })).toBeInTheDocument()
    expect(section).toHaveAttribute("aria-busy", "false")

    await user.click(within(section).getByRole("button", { name: "Refresh" }))
    expect(section).toHaveAttribute("aria-busy", "true")
    expect(within(section).getByRole("button", { name: "Refresh" })).toBeDisabled()
    // The list stays on screen while it refreshes.
    expect(within(section).getByRole("heading", { name: /Oat milk/ })).toBeInTheDocument()
    await act(async () => { finishLoad([requestRecord]) })
    await waitFor(() => expect(section).toHaveAttribute("aria-busy", "false"))
  })

  it.each([
    { status: 404, code: "NOT_FOUND", message: "This request no longer exists.", refreshed: [] },
    { status: 409, code: "ALREADY_MODERATED", message: "This product request is already approved.", refreshed: [{ ...requestRecord, status: "approved" as const }] },
  ])("refreshes after $code and preserves the message", async ({ status, code, message, refreshed }) => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const service = submissionService({ mode: "api", listMyProductRequests: vi.fn().mockResolvedValueOnce([requestRecord]).mockResolvedValue(refreshed), deleteProductRequest: vi.fn().mockRejectedValue(new SubmissionServiceError(message, status, code)) })
    renderContribution("user", service)
    await user.click(await screen.findByRole("button", { name: "Delete request" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    await waitFor(() => expect(service.listMyProductRequests).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole("button", { name: "Delete request" })).not.toBeInTheDocument()
    if (status === 409) expect(screen.getByText(/Added to the catalog/)).toBeInTheDocument()
  })

  it("retains the conflict message when the history refresh fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const service = submissionService({ mode: "api", listMyProductRequests: vi.fn().mockResolvedValueOnce([requestRecord]).mockRejectedValue(new Error("Offline")), deleteProductRequest: vi.fn().mockRejectedValue(new SubmissionServiceError("This product request is already rejected.", 409, "ALREADY_MODERATED")) })
    renderContribution("user", service)
    await user.click(await screen.findByRole("button", { name: "Delete request" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("This product request is already rejected. Could not refresh the list: Offline")
  })

  it("adds a new product from the New product tab, requiring a pack picture", async () => {
    const user = userEvent.setup()
    const service = submissionService()
    renderContribution("user", service)
    await user.click(await screen.findByRole("tab", { name: "New product" }))
    await user.type(screen.getByLabelText("Product name"), "New Milk")
    await user.type(screen.getByLabelText("Pack quantity"), "1")
    await user.selectOptions(screen.getByLabelText("Pack unit"), "L")
    await user.type(screen.getByLabelText("Brand"), "New Brand")
    await user.type(screen.getByLabelText("Category"), "milk")
    await user.click(screen.getByLabelText("Healthier Choice Symbol"))
    await user.click(screen.getByLabelText("halal"))
    await waitFor(() => expect(screen.getByLabelText("Store")).not.toBeDisabled())
    await user.selectOptions(screen.getByLabelText("Store"), "fairprice")
    await user.clear(screen.getByLabelText("Price (SGD)"))
    await user.type(screen.getByLabelText("Price (SGD)"), "3.00")
    await user.click(screen.getByRole("button", { name: "Submit product for review" }))
    expect(await screen.findByText("Add a picture of the pack. Every new product needs one.")).toBeInTheDocument()
    expect(service.createProductRequest).not.toHaveBeenCalled()
    expect(service.createSubmission).not.toHaveBeenCalled()
    await user.upload(screen.getByLabelText("Product picture"), new File(["image"], "new.png", { type: "image/png" }))
    await user.click(screen.getByRole("button", { name: "Submit product for review" }))
    await waitFor(() => expect(service.createProductRequest).toHaveBeenCalledWith(expect.objectContaining({ name: "New Milk", brand: "New Brand", category: "milk", packQty: 1, packUnit: "L", packCount: 1, hcs: true, dietary: ["halal"], productImageKey: "product-images/pending/user/p.png", priceCents: 300 }), "user-1", "test-token"))
    // The form is cleared for the next one, and the list reloads its product requests.
    await waitFor(() => expect(screen.getByLabelText("Product name")).toHaveValue(""))
    await waitFor(() => expect(service.listMyProductRequests).toHaveBeenCalledTimes(2))
    expect(service.createSubmission).not.toHaveBeenCalled()
  })

  it("offers deletion only for a pending price, not a decided one", async () => {
    const service = submissionService({ listMySubmissions: vi.fn().mockResolvedValue([
      flaggedSubmission,
      { ...flaggedSubmission, id: "accepted", status: "accepted" },
      { ...flaggedSubmission, id: "rejected", status: "rejected" },
    ]) })
    renderContribution("user", service)
    expect(await screen.findByRole("region", { name: "Your submissions" })).toBeInTheDocument()
    expect(await screen.findAllByRole("button", { name: "Delete price" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Delete request" })).not.toBeInTheDocument()
    expect(service.deleteSubmission).not.toHaveBeenCalled()
    expect(await screen.findByText("Accepted")).toBeInTheDocument()
    expect(screen.getByText("Rejected")).toBeInTheDocument()
    expect(screen.getByText("Pending review")).toBeInTheDocument()
  })
})

describe("withdrawing and viewing your own prices", () => {
  it("deletes a pending price after confirming, and keeps it if cancelled", async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true)
    const service = submissionService({ listMySubmissions: vi.fn().mockResolvedValue([flaggedSubmission]) })
    renderContribution("user", service)
    const remove = await screen.findByRole("button", { name: "Delete price" })
    await user.click(remove)
    expect(confirm).toHaveBeenCalledWith("Delete this price submission? Its photo will be removed too. This cannot be undone.")
    expect(service.deleteSubmission).not.toHaveBeenCalled()
    await user.click(remove)
    await waitFor(() => expect(service.deleteSubmission).toHaveBeenCalledWith("submission-1", { id: "user-1", role: "user" }, "test-token"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete price" })).not.toBeInTheDocument())
    expect(screen.queryByRole("heading", { name: flaggedSubmission.productName })).not.toBeInTheDocument()
  })

  it("explains when an admin decided the price before it could be deleted, and refreshes the list", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const service = submissionService({
      listMySubmissions: vi.fn().mockResolvedValueOnce([flaggedSubmission]).mockResolvedValue([{ ...flaggedSubmission, status: "accepted" }]),
      deleteSubmission: vi.fn().mockRejectedValue(new SubmissionServiceError("This submission is already accepted.", 409, "ALREADY_MODERATED")),
    })
    renderContribution("user", service)
    await user.click(await screen.findByRole("button", { name: "Delete price" }))
    expect(await screen.findByText("This submission is already accepted.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete price" })).not.toBeInTheDocument()
    expect(screen.getByText("Accepted")).toBeInTheDocument()
  })

  it("enlarges the contributor's own price photo from its thumbnail", async () => {
    const user = userEvent.setup()
    renderContribution("user", submissionService({ listMySubmissions: vi.fn().mockResolvedValue([flaggedSubmission]) }))
    const name = `Price evidence for ${flaggedSubmission.productName}`
    await user.click(await screen.findByRole("button", { name: `Enlarge image of ${name}` }))
    const preview = screen.getByRole("dialog", { name: `Enlarged image of ${name}` })
    expect(preview).toHaveProperty("open", true)
    expect(within(preview).getByRole("img", { name })).toHaveAttribute("src", "blob:shelf")
  })
})

describe("one form for existing and new products", () => {
  it("hands a search with no match over to New product, carrying the typed name", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    const search = await screen.findByRole("combobox", { name: "Product" })
    await waitFor(() => expect(search).toBeEnabled())
    await user.type(search, "oat milk")
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "No product matches “oat milk”.")).toHaveAttribute("role", "status")
    await user.click(screen.getByRole("button", { name: "Add “oat milk” as a new product" }))
    expect(screen.getByRole("tab", { name: "New product" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByLabelText("Product name")).toHaveValue("oat milk")
    expect(screen.getByLabelText("Product name")).toHaveFocus()
  })

  it("keeps store and price when switching modes, and restores the chosen product on the way back", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    await screen.findByRole("heading", { name: "Share a price you spotted" })
    await completeRequiredFields(user)
    await user.click(screen.getByRole("tab", { name: "New product" }))
    expect(screen.queryByRole("combobox", { name: "Product" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Store")).toHaveValue("fairprice")
    expect(screen.getByLabelText("Price (SGD)")).toHaveValue(2.8)
    await user.click(screen.getByRole("tab", { name: "Existing product" }))
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue("Gardenia Original Classic White Bread · 600 g")
    await user.click(screen.getByRole("button", { name: "Submit price" }))
    await waitFor(() => expect(screen.queryByText("Choose a product")).not.toBeInTheDocument())
  })

  it("moves between the tabs with the arrow keys", async () => {
    const user = userEvent.setup()
    renderContribution("user")
    const existing = await screen.findByRole("tab", { name: "Existing product" })
    existing.focus()
    await user.keyboard("{ArrowRight}")
    const added = screen.getByRole("tab", { name: "New product" })
    expect(added).toHaveFocus()
    expect(added).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("New product")
    await user.keyboard("{Home}")
    expect(existing).toHaveFocus()
    expect(existing).toHaveAttribute("aria-selected", "true")
  })

  it("lists prices and new products together, newest first, and filters by type", async () => {
    const user = userEvent.setup()
    renderContribution("user", submissionService({
      listMySubmissions: vi.fn().mockResolvedValue([flaggedSubmission]),
      listMyProductRequests: vi.fn().mockResolvedValue([{ ...requestRecord, submittedAt: "2026-10-21T10:00:00.000Z" }]),
    }))
    const section = await screen.findByRole("region", { name: "Your submissions" })
    await within(section).findByRole("heading", { name: /Oat milk/ })
    const names = within(section).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(["Oat milk", flaggedSubmission.productName])
    await user.click(within(section).getByRole("button", { name: /^Prices/ }))
    expect(within(section).queryByRole("heading", { name: /Oat milk/ })).not.toBeInTheDocument()
    expect(within(section).getByRole("heading", { name: flaggedSubmission.productName })).toBeInTheDocument()
    await user.click(within(section).getByRole("button", { name: /^New products/ }))
    expect(within(section).getByRole("heading", { name: /Oat milk/ })).toBeInTheDocument()
    expect(within(section).queryByRole("heading", { name: flaggedSubmission.productName })).not.toBeInTheDocument()
  })
})
