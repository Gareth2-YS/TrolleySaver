import { isStale, type FacetOption } from "../lib/facets"
import { cn } from "../lib/utils"
import { Select } from "./ui/select"

/**
 * A filter dropdown whose options narrow to fit the other filters, each with its product count.
 * A choice that no longer fits anything is outlined in amber and says so underneath.
 */
export function FacetSelect({ id, value, options, allLabel, format = (text) => text, onChange, className }: {
  id: string
  value: string
  options: FacetOption[]
  allLabel: string
  format?: (value: string) => string
  onChange: (value: string) => void
  className?: string
}) {
  const stale = isStale(options, value)
  return (
    <div className="space-y-1">
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={stale ? `${id}-stale` : undefined}
        className={cn(value && (stale ? "border-amber-600 dark:border-amber-400" : "border-primary"), className)}
      >
        <option value="">{allLabel}</option>
        {options.map(({ value: option, count }) => (
          <option key={option} value={option}>{format(option)}{count === undefined ? "" : ` (${count})`}</option>
        ))}
      </Select>
      {stale && <p id={`${id}-stale`} className="text-xs text-amber-700 dark:text-amber-300">Nothing fits your other filters</p>}
    </div>
  )
}
