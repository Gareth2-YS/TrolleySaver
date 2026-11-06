import { CheckCircle2, Clock3, XCircle } from "lucide-react"
import type { ProductRequestStatus, SubmissionStatus } from "../../contributions/types"
import { cn } from "../../lib/utils"

type Tone = "done" | "waiting" | "refused"

const TONES: Record<Tone, { icon: typeof CheckCircle2; className: string }> = {
  done: { icon: CheckCircle2, className: "border-primary/30 bg-primary/10 text-accent-foreground" },
  waiting: { icon: Clock3, className: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  refused: { icon: XCircle, className: "border-destructive/30 bg-destructive/10 text-destructive" },
}

// Price submissions and new product requests name their statuses differently in the API;
// on screen they share three badges, so "waiting", "done" and "refused" look the same everywhere.
export function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  const { icon: Icon, className } = TONES[tone]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-2 pr-2.5 text-xs font-semibold", className)}>
      <Icon aria-hidden="true" className="size-3.5" />{children}
    </span>
  )
}

export function PriceStatusBadge({ status }: { status: SubmissionStatus }) {
  if (status === "accepted") return <StatusBadge tone="done">Accepted</StatusBadge>
  if (status === "rejected") return <StatusBadge tone="refused">Rejected</StatusBadge>
  return <StatusBadge tone="waiting">Pending review</StatusBadge>
}

export function RequestStatusBadge({ status }: { status: ProductRequestStatus }) {
  if (status === "approved") return <StatusBadge tone="done">Added</StatusBadge>
  if (status === "rejected") return <StatusBadge tone="refused">Rejected</StatusBadge>
  return <StatusBadge tone="waiting">Pending review</StatusBadge>
}
