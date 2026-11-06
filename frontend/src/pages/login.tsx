import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { getAuthErrorMessage } from "../auth/errors"
import { loginSchema, type LoginValues } from "../auth/schemas"
import { FormAlert } from "../components/auth/form-alert"
import { FormField } from "../components/auth/form-field"
import { PasswordField } from "../components/auth/password-field"
import { Button } from "../components/ui/button"

// One form for everyone. Where you land afterwards depends on the account's role (see AuthDialog).
export function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const { signIn } = useAuth()
  const location = useLocation()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } })

  async function onSubmit(values: LoginValues) {
    setError(null)
    try {
      await signIn(values)
      toast.success("Welcome back")
    } catch (authError) { setError(getAuthErrorMessage(authError)) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <FormAlert message={error} />
      <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
      <PasswordField id="password" label="Password" registration={register("password")} error={errors.password} />
      <Button className="h-12 w-full text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}Log in<ArrowRight className="size-4" /></Button>
      <p className="text-center text-sm text-muted-foreground">New here? <Link to="/register" replace state={location.state} className="font-semibold text-primary underline-offset-4 hover:underline">Join the community</Link></p>
    </form>
  )
}
