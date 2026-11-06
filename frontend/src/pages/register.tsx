import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { getAuthErrorMessage } from "../auth/errors"
import { registrationSchema, type RegistrationValues } from "../auth/schemas"
import { FormAlert } from "../components/auth/form-alert"
import { FormField } from "../components/auth/form-field"
import { PasswordField } from "../components/auth/password-field"
import { PasswordStrength } from "../components/auth/password-strength"
import { Button } from "../components/ui/button"

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegistrationValues>({ resolver: zodResolver(registrationSchema), defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" } })

  async function onSubmit(values: RegistrationValues) {
    setError(null)
    try {
      await signUp({ fullName: values.fullName, email: values.email, password: values.password })
      toast.success("Account created. You can log in now.")
      // Back to the Log in tab, still over the same page.
      navigate("/login", { replace: true, state: location.state })
    } catch (authError) { setError(getAuthErrorMessage(authError)) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
      <FormAlert message={error} />
      <FormField id="fullName" label="Full name" autoComplete="name" placeholder="Alex Tan" registration={register("fullName")} error={errors.fullName} />
      <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <PasswordField id="password" label="Password" autoComplete="new-password" registration={register("password")} error={errors.password} />
        <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" registration={register("confirmPassword")} error={errors.confirmPassword} />
      </div>
      <PasswordStrength password={watch("password")} />
      <Button className="h-12 w-full text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}Create my account<ArrowRight className="size-4" /></Button>
      <p className="text-center text-sm text-muted-foreground">Already part of the community? <Link to="/login" replace state={location.state} className="font-semibold text-primary underline-offset-4 hover:underline">Log in</Link></p>
    </form>
  )
}
