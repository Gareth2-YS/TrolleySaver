import { ChevronDown } from "lucide-react"
import * as React from "react"
import { inputClass } from "../../lib/styles"
import { cn } from "../../lib/utils"

// The one drop-down style: the browser's own select, drawn like an input, with a single chevron.
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <span className="relative block">
      <select ref={ref} className={cn(inputClass, "cursor-pointer appearance-none pr-10 font-normal", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  ),
)
Select.displayName = "Select"
