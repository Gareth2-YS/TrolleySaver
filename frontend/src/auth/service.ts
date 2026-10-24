import type { AuthService } from "./types"
import { MockAuthService } from "./mock-auth-service"

const requestedMode = import.meta.env.VITE_AUTH_MODE ?? "mock"
if (import.meta.env.PROD && requestedMode === "mock") throw new Error("Mock authentication is disabled in production. Configure Cognito before building for production.")

export async function createAuthService(): Promise<AuthService> {
  if (requestedMode === "cognito") {
    const { CognitoAuthService } = await import("./cognito-auth-service")
    return new CognitoAuthService()
  }
  return new MockAuthService()
}
export const authMode = requestedMode
