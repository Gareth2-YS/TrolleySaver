import { describe, expect, it } from "vitest"
import { loginSchema, registrationSchema } from "./schemas"

describe("authentication schemas", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.safeParse({ email: "shopper@example.com", password: "anything" }).success).toBe(true)
  })

  it("rejects malformed login details", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "" })
    expect(result.success).toBe(false)
  })

  it("requires a strong matching registration password", () => {
    const weak = registrationSchema.safeParse({ fullName: "Alex Tan", email: "alex@example.com", password: "weak", confirmPassword: "different" })
    expect(weak.success).toBe(false)
    const valid = registrationSchema.safeParse({ fullName: "Alex Tan", email: "alex@example.com", password: "Str0ng!Pass", confirmPassword: "Str0ng!Pass" })
    expect(valid.success).toBe(true)
  })
})
