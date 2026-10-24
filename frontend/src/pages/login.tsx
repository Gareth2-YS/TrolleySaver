import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ImageUp, LoaderCircle, Search, ShieldCheck, ShoppingBasket, UserRound } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "../auth/auth-context"
import { getAuthErrorMessage } from "../auth/errors"
import { loginSchema, type LoginValues } from "../auth/schemas"
import type { AuthRole } from "../auth/types"
import { AuthShell } from "../components/auth/auth-shell"
import { FormAlert } from "../components/auth/form-alert"
import { FormField } from "../components/auth/form-field"
import { PasswordField } from "../components/auth/password-field"
import { Button } from "../components/ui/button"
import { CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs"
import { cn } from "../lib/utils"

export function LoginPage() {
  const [role, setRole] = useState<AuthRole>("user")
  const [error, setError] = useState<string | null>(null)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } })

  async function onSubmit(values: LoginValues) {
    setError(null)
    try {
      await signIn(values, role)
      toast.success("Welcome back")
      const requested = (location.state as { from?: string } | null)?.from
      navigate(requested ?? "/contribute", { replace: true })
    } catch (authError) { setError(getAuthErrorMessage(authError)) }
  }

  return (
    <AuthShell aside={<aside className="hidden grid-cols-2 gap-4 lg:grid"><div className="glass-panel col-span-2 flex flex-col justify-between p-7"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Explore before signing in</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">Save smarter, at your own pace.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Smart Basket and Search stay open to everyone. Sign in only when you are ready to contribute.</p></div><ShoppingBasket className="mt-8 size-10 text-primary" /></div><Link to="/basket" className="glass-panel group p-6 transition-transform hover:-translate-y-1"><ShoppingBasket className="size-6 text-primary" /><strong className="mt-8 block">Smart basket</strong><span className="mt-1 block text-xs text-muted-foreground">Open public page</span></Link><Link to="/search" className="glass-panel group p-6 transition-transform hover:-translate-y-1"><Search className="size-6 text-primary" /><strong className="mt-8 block">Search & filter</strong><span className="mt-1 block text-xs text-muted-foreground">Open public page</span></Link><div className="glass-panel col-span-2 flex items-center gap-3 p-5"><span className="grid size-10 place-items-center rounded-lg bg-accent text-primary"><ImageUp className="size-5" /></span><div><strong className="text-sm">Price contributions</strong><p className="text-xs text-muted-foreground">Available after sign-in</p></div></div></aside>}>
      <CardHeader className="pb-5 text-center">
        <Button asChild variant="ghost" size="sm" className="mb-2 w-fit self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/basket"><ArrowLeft className="size-4" />Back to public features</Link></Button>
        <Tabs value="login" onValueChange={(value) => value === "register" && navigate("/register")} className="mb-5">
          <TabsList><TabsTrigger value="login">Log in</TabsTrigger><TabsTrigger value="register">Register</TabsTrigger></TabsList>
        </Tabs>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to save baskets and contribute prices.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-8">
        <div className="mb-5 space-y-2">
          <span className="text-sm font-medium">Sign in as</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Account type">
            {(["user", "admin"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={cn("flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium capitalize text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", role === value && "bg-primary text-primary-foreground shadow-sm")}>
                {value === "user" ? <UserRound className="size-4" /> : <ShieldCheck className="size-4" />}{value}
              </button>
            ))}
          </div>
          {role === "admin" && <p className="text-xs text-muted-foreground">Administrator access is verified from your account permissions.</p>}
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormAlert message={error} />
          <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
          <PasswordField id="password" label="Password" registration={register("password")} error={errors.password} />
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" className="size-4 rounded border-border accent-primary" />Remember me</label>
          </div>
          <Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}Log in as {role}</Button>
        </form>
      </CardContent>
    </AuthShell>
  )
}
