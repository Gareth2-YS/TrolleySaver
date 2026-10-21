import { LogIn, LogOut, Menu, ShoppingCart, UserRound, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "../../auth/auth-context"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

const navigation = [
  ["Smart basket", "/basket"],
  ["Search & filter", "/search"],
  ["Price & image upload", "/contribute"],
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth(); const navigate = useNavigate(); const [open, setOpen] = useState(false)
  async function leave() { await signOut(); navigate("/basket"); setOpen(false) }
  return (
    <main className="aurora-page min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-emerald-100/20 bg-card/45 shadow-[inset_0_-1px_0_hsl(0_0%_100%/0.06)] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/basket" className="flex items-center gap-2.5 font-semibold tracking-tight"><span className="grid size-9 place-items-center rounded-lg border-2 border-current bg-card/30"><ShoppingCart className="size-5" /></span>TrolleySaver</Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            {navigation.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => cn("border-b-2 border-transparent py-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", isActive && "border-primary text-foreground")}>{label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? <><span className="rounded-full border border-white/15 bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground"><UserRound className="mr-1 inline size-3.5" />{user.role}</span><Button variant="outline" size="sm" onClick={leave}><LogOut className="size-4" />Sign out</Button></> : <Button asChild size="sm"><Link to="/login"><LogIn className="size-4" />Log in</Link></Button>}
          </div>
          <Button className="md:hidden" variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</Button>
        </div>
        {open && <nav className="border-t border-emerald-100/15 bg-card/55 p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)] backdrop-blur-2xl md:hidden" aria-label="Mobile navigation"><div className="grid gap-1">{navigation.map(([label, path]) => <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => cn("rounded-md px-3 py-3 text-sm text-muted-foreground", isActive && "bg-secondary text-foreground")}>{label}</NavLink>)}{user ? <Button className="mt-2" variant="outline" onClick={leave}>Sign out</Button> : <Button asChild className="mt-2"><Link to="/login" onClick={() => setOpen(false)}>Log in</Link></Button>}</div></nav>}
      </header>
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
    </main>
  )
}
