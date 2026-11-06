import { describe, expect, it } from "vitest"
import { getAuthErrorMessage } from "./errors"

describe("getAuthErrorMessage", () => {
  it("shows only the sign-up trigger's own message when it refuses the details", () => {
    const error = Object.assign(new Error("PreSignUp failed with error Enter your full name (2–80 characters)."), { name: "UserLambdaValidationException" })
    expect(getAuthErrorMessage(error)).toBe("Enter your full name (2–80 characters).")
  })
})
