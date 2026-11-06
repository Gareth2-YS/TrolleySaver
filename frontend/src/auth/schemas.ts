import { z } from "zod"
import { hasHiddenCharacters, hiddenCharactersMessage } from "../lib/text"

// The longest values Cognito and the sign-up trigger accept (backend/lambdas/handlers/cognito_pre_signup.py).
export const MAX_EMAIL_LENGTH = 254
export const MAX_PASSWORD_LENGTH = 256
export const MAX_NAME_LENGTH = 80

export const emailSchema = z.string().trim().min(1, "Email is required").max(MAX_EMAIL_LENGTH, "Email address is too long").email("Enter a valid email address")
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`).regex(/[a-z]/, "Add a lowercase letter").regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number").regex(/[^A-Za-z0-9]/, "Add a symbol")
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password is required").max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`) })
export const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(MAX_NAME_LENGTH, "Name is too long").refine((value) => !hasHiddenCharacters(value), hiddenCharactersMessage("Your name")),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((values) => values.password === values.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] })
export type LoginValues = z.infer<typeof loginSchema>
export type RegistrationValues = z.infer<typeof registrationSchema>
