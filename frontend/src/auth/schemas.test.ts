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

describe("sign-in field limits", () => {
  const registration = { fullName: "Alex Tan", email: "alex@example.com", password: "Str0ng!pass", confirmPassword: "Str0ng!pass" }

  it("refuses a name with hidden characters, as the sign-up trigger does", () => {
    const result = registrationSchema.safeParse({ ...registration, fullName: "Alex‮Tan" })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Your name can't contain hidden or control characters"])
    expect(registrationSchema.safeParse({ ...registration, fullName: "陈伟明" }).success).toBe(true)
  })

  it("refuses emails and passwords longer than Cognito accepts", () => {
    expect(loginSchema.safeParse({ email: `${"a".repeat(250)}@x.co`, password: "x" }).error?.issues[0].message).toBe("Email address is too long")
    expect(loginSchema.safeParse({ email: "alex@example.com", password: "x".repeat(257) }).error?.issues[0].message).toBe("Use at most 256 characters")
  })
})
