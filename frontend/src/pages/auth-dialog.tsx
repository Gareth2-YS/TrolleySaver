import { AlertCircle, ArrowRight, ImageUp, LoaderCircle, Search, ShoppingBasket, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { Link, Navigate, useLocation, useNavigate, type Location } from "react-router-dom"
import { useAuth } from "../auth/auth-context"
import { Logo } from "../components/brand/logo"
import { Button } from "../components/ui/button"
import { usePageTitle } from "../lib/use-page-title"
import { cn } from "../lib/utils"
import { LoginForm } from "./login"
import { RegisterForm } from "./register"

/** Router state for /login and /register: the page the modal opened over, and a protected page to continue to. */
export interface AuthLocationState {
  background?: Location
  from?: string
}

const COPY = {
  login: { title: "Welcome back", description: "Your next good find could help someone save. Log in and share it with the community.", tab: "Log in" },
  register: { title: "Create your account", description: "A few details, and you’re ready to share your next good find.", tab: "Register" },
} as const

/**
 * Log in and Register as a modal over the page you were on. /login and /register keep working: opened
 * directly, or when a signed-out visitor reaches a protected page, the modal opens over Smart basket.
 */
export function AuthDialog({ mode }: { mode: "login" | "register" }) {
  const { user, loading, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as AuthLocationState
  const dialogRef = useRef<HTMLDialogElement>(null)
  usePageTitle(COPY[mode].tab)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // Signed in (just now, or already): continue to the protected page asked for, the review queue for
  // administrators, or back to the page underneath.
  if (!loading && user) {
    const background = state.background ? `${state.background.pathname}${state.background.search}${state.background.hash}` : null
    return <Navigate to={state.from ?? (user.role === "admin" ? "/contribute" : background ?? "/basket")} replace />
  }

  // ✕, Esc and a click outside all close the dialog; closing returns to the page underneath.
  function onClose() {
    if (state.background) navigate(-1)
    else navigate("/basket", { replace: true })
  }

  const copy = COPY[mode]
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close() }}
      className={cn(
        // Phones: the whole screen. Larger screens: a centred card, with the side panel from 900px wide.
        "m-0 h-full max-h-none w-full max-w-none overflow-y-auto bg-card p-0 text-card-foreground backdrop:bg-black/55",
        "sm:m-auto sm:h-auto sm:max-h-[calc(100%-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[460px] sm:rounded-[20px] sm:border sm:shadow-2xl min-[900px]:max-w-[960px]",
      )}
    >
      <div className="relative flex min-h-full flex-col min-[900px]:flex-row">
        <Button type="button" variant="ghost" size="icon" aria-label="Close" className="absolute right-3 top-3 z-10 text-muted-foreground" onClick={() => dialogRef.current?.close()}>
          <X className="size-5" />
        </Button>

        <SidePanel mode={mode} />

        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5 px-6 pb-8 pt-14 sm:px-9 sm:pt-10">
          <div className="flex justify-center"><Logo size="lg" /></div>

          {state.from === "/contribute" && (
            <p className="flex items-start gap-2 rounded-xl bg-accent px-3.5 py-3 text-[13px] text-accent-foreground">
              <ImageUp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Log in to share a price. You’ll go straight to Price &amp; image upload afterwards.
            </p>
          )}

          <nav aria-label="Account" className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            {(["login", "register"] as const).map((tab) => (
              <Link
                key={tab}
                to={tab === "login" ? "/login" : "/register"}
                replace
                state={location.state}
                aria-current={tab === mode ? "page" : undefined}
                className={cn(
                  "grid h-10 place-items-center rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === mode && "bg-card font-semibold text-foreground shadow-sm",
                )}
              >
                {COPY[tab].tab}
              </Link>
            ))}
          </nav>

          <div className="text-center">
            <h2 id="auth-title" className="font-display text-[28px] font-extrabold leading-tight tracking-tight">{copy.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
          </div>

          {loading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your session…</p>
          ) : error ? (
            <div role="alert" className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 text-destructive" aria-hidden="true" />Sign-in isn't available</p>
              <p className="text-muted-foreground">{error}</p>
              <p className="text-muted-foreground">Check the settings in frontend/.env.local, then reload the page.</p>
            </div>
          ) : mode === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </dialog>
  )
}

// The left half on wider screens: what TrolleySaver is for, with ways to keep browsing without an account.
function SidePanel({ mode }: { mode: "login" | "register" }) {
  return (
    <aside className="hidden min-w-0 flex-[1_1_440px] flex-col gap-3.5 border-r bg-accent/40 p-8 min-[900px]:flex">
      <p className="text-sm font-semibold text-accent-foreground">A little help with the everyday shop</p>
      <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight">Good finds are better shared.</h2>
      <p className="text-[15px] leading-relaxed text-muted-foreground">Find a better price for your basket, or share one you spotted. Your next small find could make someone else’s shop a little easier.</p>
      <p className="inline-flex items-center gap-2 self-start rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium">
        <ShoppingBasket className="size-[18px] text-primary" aria-hidden="true" />Just browsing? You’re welcome here too.
      </p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <ShortcutCard to="/basket" icon={ShoppingBasket} title="Build a smarter basket" text="Compare your grocery list across stores." action="Explore Smart Basket" />
        <ShortcutCard to="/search" icon={Search} title="Find your next good buy" text="Look up a product and see its prices." action="Explore prices" />
      </div>
      <div className="surface-card flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><ImageUp className="size-[18px]" aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-semibold">Spotted a price worth sharing?</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{mode === "login" ? "Log in" : "Create an account"} to pass it on to the community.</p>
        </div>
      </div>
      <p className="mt-auto pt-2 text-[13px] text-muted-foreground">Compare prices. Build a smarter basket. Spend less.</p>
    </aside>
  )
}

function ShortcutCard({ to, icon: Icon, title, text, action }: { to: string; icon: typeof Search; title: string; text: string; action: string }) {
  return (
    <Link to={to} className="surface-card flex flex-col gap-1 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Icon className="mb-1.5 size-6 text-primary" aria-hidden="true" />
      <strong className="font-display text-base font-extrabold leading-snug">{title}</strong>
      <span className="text-[13px] leading-relaxed text-muted-foreground">{text}</span>
      <span className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">{action}<ArrowRight className="size-3.5" aria-hidden="true" /></span>
    </Link>
  )
}
