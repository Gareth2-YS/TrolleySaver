import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"
import { LoginPage } from "./login"
import { RegisterPage } from "./register"

afterEach(cleanup)

function service(role: "user" | "admin" = "user"): AuthService {
  return {
    signIn: vi.fn().mockResolvedValue({ type: "DONE" }),
    signUp: vi.fn().mockResolvedValue({ type: "DONE" }),
    signOut: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: "1", email: "alex@example.com", name: "Alex", role, groups: [role] }),
    getAccessToken: vi.fn().mockResolvedValue("token"),
  }
}

function renderAt(path: string, authService: AuthService) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider serviceOverride={authService}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/app" element={<p>User home</p>} /><Route path="/admin" element={<p>Admin home</p>} /><Route path="/verify" element={<p>Verify</p>} /></Routes></AuthProvider></MemoryRouter>)
}

describe("authentication pages", () => {
  it("never offers administrator registration", async () => {
    renderAt("/register", service())
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /admin/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create user account" })).toBeInTheDocument()
  })

  it("does not grant admin access based on the selected login mode", async () => {
    const user = userEvent.setup()
    const authService = service("user")
    renderAt("/login", authService)
    await screen.findByRole("heading", { name: "Welcome back" })
    await user.click(screen.getByRole("button", { name: /^admin$/i }))
    await user.type(screen.getByRole("textbox", { name: /Email address/i }), "alex@example.com")
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "password")
    await user.click(screen.getByRole("button", { name: "Log in as admin" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("does not have administrator access")
    expect(authService.signOut).toHaveBeenCalledOnce()
  })

  it("does not allow an administrator account through the user login tab", async () => {
    const user = userEvent.setup()
    const authService = service("admin")
    renderAt("/login", authService)
    await screen.findByRole("heading", { name: "Welcome back" })
    await user.type(screen.getByRole("textbox", { name: /Email address/i }), "admin@example.com")
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "password")
    await user.click(screen.getByRole("button", { name: "Log in as user" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("must log in through the Admin tab")
    expect(authService.signOut).toHaveBeenCalledOnce()
  })
})
