import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight, ImageUp, LoaderCircle, Search, ShieldCheck, ShoppingBasket, UserRound } from "lucide-react"
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
    <AuthShell aside={
      <aside className="hidden grid-cols-2 gap-4 lg:grid">
        <div className="glass-panel col-span-2 p-7">
          <span className="text-sm font-semibold text-primary">A little help with the everyday shop</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Good finds are better shared.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">Find a better price for your basket, or share one you spotted. Your next small find could make someone else’s shop a little easier.</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent/60 px-4 py-3 text-sm font-medium"><ShoppingBasket className="size-5 text-primary" />Just browsing? You’re welcome here too.</div>
        </div>
        <Link to="/basket" className="glass-panel group p-6 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ShoppingBasket className="size-7 text-primary" /><strong className="mt-5 block text-lg">Build a smarter basket</strong><span className="mt-2 block text-sm leading-relaxed text-muted-foreground">Compare your grocery list across stores.</span><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Explore Smart Basket <ArrowRight className="size-4" /></span>
        </Link>
        <Link to="/search" className="glass-panel group p-6 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Search className="size-7 text-primary" /><strong className="mt-5 block text-lg">Find your next good buy</strong><span className="mt-2 block text-sm leading-relaxed text-muted-foreground">Look up a product and see its prices.</span><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Explore prices <ArrowRight className="size-4" /></span>
        </Link>
        <div className="glass-panel col-span-2 flex items-start gap-3 p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><ImageUp className="size-5" /></span><div><strong className="text-base">Spotted a price worth sharing?</strong><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Log in to pass it on to the community.</p></div></div>
      </aside>
    }>
      <CardHeader className="space-y-0 gap-5 pb-8 pt-8 text-center">
        <Button asChild variant="ghost" size="sm" className="mb-2 w-fit self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"><Link to="/basket"><ArrowLeft className="size-4" />Keep exploring prices</Link></Button>
        <Tabs value="login" onValueChange={(value) => value === "register" && navigate("/register")} className="mb-8">
          <TabsList><TabsTrigger value="login">Log in</TabsTrigger><TabsTrigger value="register">Register</TabsTrigger></TabsList>
        </Tabs>
        <div className="space-y-3">
          <CardTitle className="text-3xl">Welcome back</CardTitle>
          <CardDescription className="text-base leading-relaxed">Your next good find could help someone save. Log in and share it with the community.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-8">
        <div className="mb-5 space-y-2">
          <span className="text-base font-semibold">Choose your space</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Account type">
            {(["user", "admin"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={cn("flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium capitalize text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", role === value && "bg-primary text-primary-foreground shadow-sm")}>
                {value === "user" ? <UserRound className="size-4" /> : <ShieldCheck className="size-4" />}{value}
              </button>
            ))}
          </div>
          {role === "admin" && <p className="rounded-lg bg-accent/50 p-3 text-sm leading-relaxed text-muted-foreground">Here to review community finds? Use your administrator account to keep shared prices trustworthy.</p>}
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormAlert message={error} />
          <FormField id="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" registration={register("email")} error={errors.email} />
          <PasswordField id="password" label="Password" registration={register("password")} error={errors.password} />
          <Button className="h-12 w-full text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{role === "admin" ? "Log in to review" : "Log in & start sharing"}<ArrowRight className="size-4" /></Button>
          <p className="pt-2 text-center text-sm text-muted-foreground">New here? <Link to="/register" className="font-semibold text-primary underline-offset-4 hover:underline">Join the community</Link></p>
        </form>
      </CardContent>
    </AuthShell>
  )
}
