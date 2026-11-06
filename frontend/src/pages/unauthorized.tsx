import { ArrowLeft, ShieldX } from "lucide-react"
import { Link } from "react-router-dom"
import { AppShell } from "../components/layout/app-shell"
import { Button } from "../components/ui/button"
import { usePageTitle } from "../lib/use-page-title"

export function UnauthorizedPage() {
  usePageTitle("Access not available")
  return (
    <AppShell>
      <section className="surface-card mx-auto max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><ShieldX /></span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">Access not available</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your account is signed in, but it does not have permission to view this area. Administrator access is assigned securely by the TrolleySaver team.</p>
        <Button asChild className="mt-6 w-full"><Link to="/basket"><ArrowLeft className="size-4" />Return to smart basket</Link></Button>
      </section>
    </AppShell>
  )
}
