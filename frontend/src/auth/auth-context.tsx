import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { createAuthService } from "./service"
import type { AuthNextStep, AuthRole, AuthService, AuthUser, SignInInput, SignUpInput } from "./types"

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  /** Set when sign-in can't start at all, e.g. missing Cognito settings. */
  error: string | null
  signIn(input: SignInInput, intendedRole: AuthRole): Promise<AuthNextStep & { authenticatedRole?: AuthRole }>
  signUp(input: SignUpInput): Promise<AuthNextStep>
  signOut(): Promise<void>
  getAccessToken(forceRefresh?: boolean): Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children, serviceOverride }: { children: ReactNode; serviceOverride?: AuthService }) {
  const [service, setService] = useState<AuthService | null>(serviceOverride ?? null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    async function restore() {
      try {
        const resolved = serviceOverride ?? await createAuthService()
        if (!current) return
        setService(resolved)
        setUser(await resolved.getCurrentUser())
      } catch (e) {
        // Without this the guarded pages would show "Loading your session…" forever.
        if (current) setError(e instanceof Error ? e.message : "Sign-in could not be set up.")
      } finally {
        if (current) setLoading(false)
      }
    }
    void restore()
    return () => { current = false }
  }, [serviceOverride])

  const refreshUser = useCallback(async () => {
    if (!service) return null
    const nextUser = await service.getCurrentUser()
    setUser(nextUser)
    return nextUser
  }, [service])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    async signIn(input, intendedRole) {
      if (!service) throw new Error("Authentication is still loading.")
      const next = await service.signIn(input)
      if (next.type === "DONE") {
        const nextUser = await refreshUser()
        if (nextUser?.role !== intendedRole) {
          await service.signOut(); setUser(null)
          const message = intendedRole === "admin"
            ? "This account does not have administrator access."
            : "Administrator accounts must log in through the Admin tab."
          throw Object.assign(new Error(message), { name: "UnauthorizedRoleError" })
        }
        return { ...next, authenticatedRole: nextUser?.role }
      }
      return next
    },
    async signUp(input) { if (!service) throw new Error("Authentication is still loading."); return service.signUp(input) },
    async signOut() { if (service) await service.signOut(); setUser(null) },
    async getAccessToken(forceRefresh = false) { return service?.getAccessToken(forceRefresh) ?? null },
  }), [error, loading, refreshUser, service, user])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const value = use(AuthContext)
  if (!value) throw new Error("useAuth must be used within AuthProvider")
  return value
}
