import { Amplify } from "aws-amplify"
import { fetchAuthSession, getCurrentUser, signIn, signOut, signUp } from "aws-amplify/auth"
import type { AuthService, AuthUser, SignInInput, SignUpInput } from "./types"

const region = import.meta.env.VITE_AWS_REGION
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID
if (!region || !userPoolId || !userPoolClientId) throw new Error("Cognito mode requires the AWS region, User Pool ID, and App Client ID environment variables.")

Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId } } })

export class CognitoAuthService implements AuthService {
  async signIn({ email, password }: SignInInput) { const result = await signIn({ username: email, password }); if (!result.isSignedIn) throw new Error("This Cognito client must use direct sign-in without MFA or additional challenges."); return { type: "DONE" as const } }
  async signUp({ fullName, email, password }: SignUpInput) { const result = await signUp({ username: email, password, options: { userAttributes: { email, name: fullName } } }); if (!result.isSignUpComplete) throw new Error("Cognito must auto-confirm public user registrations."); return { type: "DONE" as const } }
  async signOut() { await signOut() }
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession()])
      const payload = session.tokens?.accessToken.payload
      const groups = Array.isArray(payload?.["cognito:groups"]) ? payload["cognito:groups"] as string[] : []
      const role = groups.includes("admin") ? "admin" : "user"
      return { id: user.userId, email: user.signInDetails?.loginId ?? user.username, name: typeof payload?.name === "string" ? payload.name : undefined, role, groups }
    } catch { return null }
  }
  async getAccessToken() { const session = await fetchAuthSession(); return session.tokens?.accessToken.toString() ?? null }
}
