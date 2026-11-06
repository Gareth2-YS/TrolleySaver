import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "../app"
import { AuthProvider } from "../auth/auth-context"
import type { AuthService } from "../auth/types"

beforeEach(() => {
  // The pages behind the modal load their data; nothing here needs the network.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline in tests")))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function service(role: "user" | "admin" = "user", signedIn = false): AuthService {
  const account = { id: "1", email: "alex@example.com", name: "Alex", role, groups: [role] }
  let current = signedIn ? account : null
  return {
    signIn: vi.fn().mockImplementation(async () => { current = account; return { type: "DONE" } }),
    signUp: vi.fn().mockResolvedValue({ type: "DONE" }),
    signOut: vi.fn().mockImplementation(async () => { current = null }),
    getCurrentUser: vi.fn().mockImplementation(async () => current),
    getAccessToken: vi.fn().mockResolvedValue("token"),
  }
}

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

function renderApp(path: string, authService: AuthService) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider serviceOverride={authService}><App /><CurrentPath /></AuthProvider>
    </MemoryRouter>,
  )
}

const path = () => screen.getByRole("status", { name: "Current path" }).textContent

async function logIn(user: ReturnType<typeof userEvent.setup>) {
  const dialog = within(await screen.findByRole("dialog", { name: "Welcome back" }))
  await user.type(dialog.getByRole("textbox", { name: /Email address/i }), "alex@example.com")
  await user.type(dialog.getByLabelText("Password", { selector: "input" }), "password")
  await user.click(dialog.getByRole("button", { name: "Log in" }))
}

describe("log in and register modal", () => {
  it("opens over Smart basket when /login is visited directly, and names the tab", async () => {
    renderApp("/login", service())
    expect(await screen.findByRole("dialog", { name: "Welcome back" })).toHaveProperty("open", true)
    expect(screen.getByRole("heading", { name: "Smart basket comparison" })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe("Log in · TrolleySaver"))
  })

  it("explains a sign-in setup problem instead of loading forever", async () => {
    const broken = { ...service(), getCurrentUser: vi.fn().mockRejectedValue(new Error("Cognito mode requires the AWS region, User Pool ID, and App Client ID environment variables.")) }
    renderApp("/login", broken)
    const dialog = within(await screen.findByRole("dialog", { name: "Welcome back" }))
    expect(await dialog.findByText("Sign-in isn't available")).toBeInTheDocument()
    expect(dialog.getByText(/Cognito mode requires the AWS region/)).toBeInTheDocument()
    expect(dialog.queryByText("Loading your session…")).not.toBeInTheDocument()
  })

  it("has one log-in form for everyone, with no account type or Remember me", async () => {
    renderApp("/login", service())
    const dialog = within(await screen.findByRole("dialog", { name: "Welcome back" }))
    expect(dialog.queryByText("Choose your space")).not.toBeInTheDocument()
    expect(dialog.queryByRole("button", { name: /admin/i })).not.toBeInTheDocument()
    expect(dialog.queryByText("Remember me")).not.toBeInTheDocument()
  })

  it("keeps a user on the page underneath after logging in", async () => {
    const user = userEvent.setup()
    renderApp("/search", service("user"))
    await user.click(await screen.findByRole("link", { name: "Log in" }))
    expect(path()).toBe("/login")
    expect(screen.getByRole("heading", { name: "Search and filter groceries" })).toBeInTheDocument()

    await logIn(user)
    await waitFor(() => expect(path()).toBe("/search"))
    expect(screen.queryByRole("dialog", { name: "Welcome back" })).not.toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument()
  })

  it("takes an administrator to the review page, whatever page they logged in from", async () => {
    const user = userEvent.setup()
    renderApp("/login", service("admin"))
    await logIn(user)
    await waitFor(() => expect(path()).toBe("/contribute"))
  })

  it("continues to a protected page after logging in", async () => {
    const user = userEvent.setup()
    renderApp("/contribute", service("user"))
    const dialog = within(await screen.findByRole("dialog", { name: "Welcome back" }))
    expect(dialog.getByText(/You’ll go straight to Price & image upload afterwards/)).toBeInTheDocument()
    await logIn(user)
    await waitFor(() => expect(path()).toBe("/contribute"))
  })

  it("closes back to the page it opened over", async () => {
    const user = userEvent.setup()
    renderApp("/search", service())
    await user.click(await screen.findByRole("link", { name: "Log in" }))
    await user.click(within(screen.getByRole("dialog", { name: "Welcome back" })).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(path()).toBe("/search"))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe("Search & filter · TrolleySaver"))
  })

  it("switches to Register in place and back to Log in after an account is created", async () => {
    const user = userEvent.setup()
    const authService = service()
    renderApp("/login", authService)
    await user.click(within(await screen.findByRole("navigation", { name: "Account" })).getByRole("link", { name: "Register" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Create your account" }))
    // Administrator accounts are never created here.
    expect(dialog.queryByRole("button", { name: /admin/i })).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe("Register · TrolleySaver"))

    await user.type(dialog.getByRole("textbox", { name: /Full name/i }), "Alex Tan")
    await user.type(dialog.getByRole("textbox", { name: /Email address/i }), "alex@example.com")
    await user.type(dialog.getByLabelText("Password", { selector: "input" }), "Str0ng!Pass")
    await user.type(dialog.getByLabelText("Confirm password", { selector: "input" }), "Str0ng!Pass")
    await user.click(dialog.getByRole("button", { name: "Create my account" }))

    expect(await screen.findByRole("dialog", { name: "Welcome back" })).toBeInTheDocument()
    expect(authService.signUp).toHaveBeenCalledWith({ fullName: "Alex Tan", email: "alex@example.com", password: "Str0ng!Pass" })
  })
})

describe("sign-in field limits", () => {
  it("stops typing at the longest name, email and password the backend accepts", async () => {
    renderApp("/register", service())
    const dialog = within(await screen.findByRole("dialog", { name: "Create your account" }))
    expect(dialog.getByRole("textbox", { name: /Full name/i })).toHaveAttribute("maxLength", "80")
    expect(dialog.getByRole("textbox", { name: /Email address/i })).toHaveAttribute("maxLength", "254")
    expect(dialog.getByLabelText("Password", { selector: "input" })).toHaveAttribute("maxLength", "256")
    expect(dialog.getByLabelText("Confirm password", { selector: "input" })).toHaveAttribute("maxLength", "256")
  })

  it("shows the sign-up trigger's message when it refuses the details", async () => {
    const user = userEvent.setup()
    const authService = service()
    authService.signUp = vi.fn().mockRejectedValue(Object.assign(new Error("PreSignUp failed with error Your name can't contain hidden or control characters."), { name: "UserLambdaValidationException" }))
    renderApp("/register", authService)
    const dialog = within(await screen.findByRole("dialog", { name: "Create your account" }))
    await user.type(dialog.getByRole("textbox", { name: /Full name/i }), "Alex Tan")
    await user.type(dialog.getByRole("textbox", { name: /Email address/i }), "alex@example.com")
    await user.type(dialog.getByLabelText("Password", { selector: "input" }), "Str0ng!Pass")
    await user.type(dialog.getByLabelText("Confirm password", { selector: "input" }), "Str0ng!Pass")
    await user.click(dialog.getByRole("button", { name: /Create my account/ }))
    expect(await dialog.findByRole("alert")).toHaveTextContent(/^Your name can't contain hidden or control characters\.$/)
  })
})
