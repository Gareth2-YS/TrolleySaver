import { z } from "zod"

export const emailSchema = z.string().trim().min(1, "Email is required").email("Enter a valid email address")
export const passwordSchema = z.string().min(8, "Use at least 8 characters").regex(/[a-z]/, "Add a lowercase letter").regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number").regex(/[^A-Za-z0-9]/, "Add a symbol")
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password is required") })
export const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80, "Name is too long"),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((values) => values.password === values.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] })
export type LoginValues = z.infer<typeof loginSchema>
export type RegistrationValues = z.infer<typeof registrationSchema>
