export type AuthRole = "user" | "admin"

export interface AuthUser {
  id: string
  email: string
  name?: string
  role: AuthRole
  groups: string[]
}

export type AuthNextStep = { type: "DONE" }

export interface SignInInput { email: string; password: string }
export interface SignUpInput extends SignInInput { fullName: string }

export interface AuthService {
  signIn(input: SignInInput): Promise<AuthNextStep>
  signUp(input: SignUpInput): Promise<AuthNextStep>
  signOut(): Promise<void>
  getCurrentUser(): Promise<AuthUser | null>
  getAccessToken(forceRefresh?: boolean): Promise<string | null>
}
