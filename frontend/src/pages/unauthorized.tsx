import { ArrowLeft, ShieldX } from "lucide-react"
import { Link } from "react-router-dom"
import { AuthShell } from "../components/auth/auth-shell"
import { Button } from "../components/ui/button"
import { CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

export function UnauthorizedPage() {
  return <AuthShell><CardHeader className="items-center text-center"><span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><ShieldX /></span><CardTitle>Access not available</CardTitle><CardDescription>Your account is signed in, but it does not have permission to view this area. Administrator access is assigned securely by the TrolleySaver team.</CardDescription></CardHeader><CardContent className="pb-8"><Button asChild className="w-full"><Link to="/basket"><ArrowLeft className="size-4" />Return to smart basket</Link></Button></CardContent></AuthShell>
}
