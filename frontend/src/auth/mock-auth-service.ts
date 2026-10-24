import type { AuthService, AuthUser, SignInInput, SignUpInput } from "./types"

const SESSION_KEY = "trolleysaver.mock.session"
const USERS_KEY = "trolleysaver.mock.users"
interface MockUser extends AuthUser { password: string }

export const DEMO_ACCOUNTS = {
  user: { email: "user@trolleysaver.local", password: "User123!", name: "Demo Shopper" },
  admin: { email: "admin@trolleysaver.local", password: "Admin123!", name: "Demo Moderator" },
} as const

const builtInUsers: MockUser[] = [
  { id: "demo-user", ...DEMO_ACCOUNTS.user, role: "user", groups: ["user"] },
  { id: "demo-admin", ...DEMO_ACCOUNTS.admin, role: "admin", groups: ["admin"] },
]

function readUsers(): MockUser[] {
  try { return [...builtInUsers, ...JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as MockUser[]] } catch { return builtInUsers }
}
function writeUsers(users: MockUser[]) { localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((user) => !user.id.startsWith("demo-")))) }

export class MockAuthService implements AuthService {
  async signIn({ email, password }: SignInInput) {
    await this.delay()
    const stored = readUsers().find((user) => user.email === email.toLowerCase())
    if (!stored || stored.password !== password) throw Object.assign(new Error("That email or password is not correct."), { name: "NotAuthorizedException" })
    const user: AuthUser = { id: stored.id, email: stored.email, name: stored.name, role: stored.role, groups: stored.groups }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
    return { type: "DONE" as const }
  }
  async signUp({ fullName, email, password }: SignUpInput) {
    await this.delay()
    const users = readUsers()
    if (users.some((user) => user.email === email.toLowerCase())) throw Object.assign(new Error("An account already exists for this email."), { name: "UsernameExistsException" })
    users.push({ id: crypto.randomUUID(), email: email.toLowerCase(), name: fullName, password, role: "user", groups: ["user"] })
    writeUsers(users)
    return { type: "DONE" as const }
  }
  async signOut() { sessionStorage.removeItem(SESSION_KEY) }
  async getCurrentUser() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as AuthUser | null } catch { return null } }
  async getAccessToken() { return (await this.getCurrentUser()) ? "mock-development-token" : null }
  private delay() { return new Promise((resolve) => setTimeout(resolve, 350)) }
}
