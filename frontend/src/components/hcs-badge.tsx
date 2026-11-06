import { Leaf } from "lucide-react"
import { cn } from "../lib/utils"

// The one Healthier Choice badge, on every page and in the swap dialog.
export function HcsBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent py-1 pl-2 pr-2.5 text-xs font-semibold text-accent-foreground", className)}>
      <Leaf aria-hidden="true" className="size-3.5" />Healthier Choice
    </span>
  )
}
