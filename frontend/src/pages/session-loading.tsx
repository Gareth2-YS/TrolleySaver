import { LoaderCircle } from "lucide-react"
import { Brand } from "../components/auth/brand"

export function SessionLoading() {
  return <main className="grid min-h-screen place-items-center bg-background"><div className="space-y-5 text-center"><Brand /><LoaderCircle className="mx-auto size-6 animate-spin text-primary" aria-label="Loading your session" /><p className="text-sm text-muted-foreground">Loading your session…</p></div></main>
}
