import { beforeEach, describe, expect, it } from "vitest"
import { MockAuthService } from "./mock-auth-service"

describe("MockAuthService", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it("registers an immediately usable regular user", async () => {
    const service = new MockAuthService()
    const next = await service.signUp({ fullName: "Alex Tan", email: "alex@example.com", password: "Str0ng!Pass" })
    expect(next).toEqual({ type: "DONE" })
    expect(await service.signIn({ email: "alex@example.com", password: "Str0ng!Pass" })).toEqual({ type: "DONE" })
    expect((await service.getCurrentUser())?.role).toBe("user")
  })

  it("blocks duplicate email registration", async () => {
    const service = new MockAuthService()
    await service.signUp({ fullName: "Alex Tan", email: "alex@example.com", password: "Str0ng!Pass" })
    await expect(service.signUp({ fullName: "Another Alex", email: "alex@example.com", password: "An0ther!Pass" })).rejects.toMatchObject({ name: "UsernameExistsException" })
  })

  it("provides role-correct dummy user and admin accounts", async () => {
    const service = new MockAuthService()
    await service.signIn({ email: "user@trolleysaver.local", password: "User123!" })
    expect((await service.getCurrentUser())?.role).toBe("user")
    await service.signOut()
    await service.signIn({ email: "admin@trolleysaver.local", password: "Admin123!" })
    expect((await service.getCurrentUser())?.role).toBe("admin")
  })

  it("rejects login for an account that does not exist", async () => {
    const service = new MockAuthService()
    await expect(service.signIn({ email: "nobody@example.com", password: "anything" })).rejects.toMatchObject({ name: "NotAuthorizedException" })
  })

  it("clears the local session on sign out", async () => {
    const service = new MockAuthService()
    await service.signIn({ email: "user@trolleysaver.local", password: "User123!" })
    await service.signOut()
    expect(await service.getCurrentUser()).toBeNull()
  })
})
