import { afterEach, expect, it, vi } from "vitest"
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
it.each(["typo", "", "MOCK"])("rejects unknown authentication mode %s instead of falling back", async (mode) => {
  vi.resetModules(); vi.stubEnv("VITE_AUTH_MODE", mode)
  await expect(import("./service")).rejects.toThrow("VITE_AUTH_MODE must be cognito or mock")
})
it("rejects mock authentication in production", async () => {
  vi.resetModules(); vi.stubEnv("PROD", true); vi.stubEnv("VITE_AUTH_MODE", "mock")
  await expect(import("./service")).rejects.toThrow("Mock authentication is disabled in production")
})
