import { ShoppingCart } from "lucide-react"
import { cn } from "../../lib/utils"

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2.5 text-lg font-semibold tracking-tight", className)}>
      <span className="grid size-9 place-items-center rounded-lg border-2 border-current"><ShoppingCart className="size-5" aria-hidden="true" /></span>
      <span>TrolleySaver</span>
    </div>
  )
}
