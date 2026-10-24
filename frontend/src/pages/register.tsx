import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { getAuthErrorMessage } from "../auth/errors"
import { registrationSchema, type RegistrationValues } from "../auth/schemas"
import { AuthShell } from "../components/auth/auth-shell"
import { FormAlert } from "../components/auth/form-alert"
import { FormField } from "../components/auth/form-field"
import { PasswordField } from "../components/auth/password-field"
import { PasswordStrength } from "../components/auth/password-strength"
import { Button } from "../components/ui/button"
import { CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs"

export function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegistrationValues>({ resolver: zodResolver(registrationSchema), defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" } })
  async function onSubmit(values: RegistrationValues) {
    setError(null)
    try {
      await signUp({ fullName: values.fullName, email: values.email, password: values.password })
      toast.success("Account created. You can log in now.")
      navigate("/login", { replace: true })
    } catch (authError) { setError(getAuthErrorMessage(authError)) }
  }
  return (
    <AuthShell>
      <CardHeader className="pb-5 text-center">
        <Tabs value="register" onValueChange={(value) => value === "login" && navigate("/login")} className="mb-5"><TabsList><TabsTrigger value="login">Log in</TabsTrigger><TabsTrigger value="register">Register</TabsTrigger></TabsList></Tabs>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Register to save baskets and contribute prices.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormAlert message={error} />
          <FormField id="fullName" label="Full name" autoComplete="name" placeholder="Alex Tan" registration={register("fullName")} error={errors.fullName} />
          <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
          <PasswordField id="password" label="Password" autoComplete="new-password" registration={register("password")} error={errors.password} />
          <PasswordStrength password={watch("password")} />
          <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" registration={register("confirmPassword")} error={errors.confirmPassword} />
          <Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}Create user account</Button>
          <p className="text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
        </form>
      </CardContent>
    </AuthShell>
  )
}
