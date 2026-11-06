import { LogIn, LogOut, Menu, UserRound, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../auth/auth-context"
import { cn } from "../../lib/utils"
import { Logo } from "../brand/logo"
import { Button } from "../ui/button"

const navigation = [
  ["Smart basket", "/basket"],
  ["Search & filter", "/search"],
  ["Price & image upload", "/contribute"],
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const visibleNavigation = user?.role === "admin" ? navigation.filter(([, path]) => path === "/contribute") : navigation
  const homePath = user?.role === "admin" ? "/contribute" : "/basket"
  // The log-in modal opens over the page you're on, which stays underneath it.
  const loginState = { background: location }

  async function leave() { await signOut(); navigate("/basket"); setOpen(false) }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-band text-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link to={homePath} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-band-accent">
            <Logo onBand />
          </Link>
          <nav className="hidden items-stretch gap-7 self-stretch md:flex" aria-label="Main navigation">
            {visibleNavigation.map(([label, path]) => (
              <NavLink key={path} to={path} className={({ isActive }) => cn(
                "band-link flex items-center border-y-[3px] border-transparent text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-band-accent",
                isActive && "border-b-band-accent font-semibold text-white",
              )}>{label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white/90" title={user.email}>
                  <UserRound className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{user.name?.trim() || user.email}</span>
                </span>
                <Button variant="band-outline" size="sm" onClick={leave}><LogOut className="size-4" />Sign out</Button>
              </>
            ) : (
              <Button asChild variant="band" size="sm"><Link to="/login" state={loginState}><LogIn className="size-4" />Log in</Link></Button>
            )}
          </div>
          <Button className="text-white hover:bg-white/10 hover:text-white md:hidden" variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open && (
          <nav className="rounded-b-[20px] border-t border-white/10 bg-band px-3 pb-5 pt-2 md:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1">
              {visibleNavigation.map(([label, path]) => (
                <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => cn(
                  "flex min-h-[52px] items-center rounded-lg px-3.5 text-base text-white/85",
                  isActive && "bg-white/10 font-semibold text-white",
                )}>{label}</NavLink>
              ))}
              {user ? (
                <Button className="mt-3 h-12 text-base" variant="band-outline" onClick={leave}><LogOut className="size-4" />Sign out</Button>
              ) : (
                <Button asChild className="mt-3 h-12 text-base" variant="band"><Link to="/login" state={loginState} onClick={() => setOpen(false)}><LogIn className="size-4" />Log in</Link></Button>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  )
}
