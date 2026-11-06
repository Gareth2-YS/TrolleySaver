import { AlertCircle, LoaderCircle } from "lucide-react"
import { Logo } from "../components/brand/logo"

export function SessionLoading() {
  return <main className="grid min-h-screen place-items-center bg-background"><div className="flex flex-col items-center gap-5 text-center"><Logo size="lg" /><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading your session" /><p className="text-sm text-muted-foreground">Loading your session…</p></div></main>
}

/** Shown on protected pages when sign-in can't start, e.g. Cognito settings are missing. */
export function SessionError({ message }: { message: string }) {
  return <main className="grid min-h-screen place-items-center bg-background px-4"><div className="flex max-w-md flex-col items-center gap-5 text-center"><Logo size="lg" /><AlertCircle className="size-6 text-destructive" aria-hidden="true" /><div role="alert" className="space-y-2"><p className="font-medium">Sign-in isn't available</p><p className="text-sm text-muted-foreground">{message}</p><p className="text-sm text-muted-foreground">Check the settings in frontend/.env.local, then reload the page.</p></div></div></main>
}
