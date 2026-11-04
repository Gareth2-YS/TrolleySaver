import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react"
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
      <CardHeader className="space-y-0 gap-5 pb-8 pt-8 text-center">
        <Button asChild variant="ghost" size="sm" className="mb-2 w-fit self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/basket"><ArrowLeft className="size-4" />Keep exploring prices</Link></Button>
        <Tabs value="register" onValueChange={(value) => value === "login" && navigate("/login")} className="mb-8"><TabsList><TabsTrigger value="login">Log in</TabsTrigger><TabsTrigger value="register">Register</TabsTrigger></TabsList></Tabs>
        <div className="space-y-3">
          <CardTitle className="text-3xl">Create your account</CardTitle>
          <CardDescription className="text-base leading-relaxed">A few details, and you’re ready to share your next good find.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormAlert message={error} />
          <FormField id="fullName" label="Full name" autoComplete="name" placeholder="Alex Tan" registration={register("fullName")} error={errors.fullName} />
          <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
          <PasswordField id="password" label="Password" autoComplete="new-password" registration={register("password")} error={errors.password} />
          <PasswordStrength password={watch("password")} />
          <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" registration={register("confirmPassword")} error={errors.confirmPassword} />
          <Button className="h-12 w-full text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}Create my account<ArrowRight className="size-4" /></Button>
          <p className="text-center text-sm text-muted-foreground">Already part of the community? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
        </form>
      </CardContent>
    </AuthShell>
  )
}
