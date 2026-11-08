import { inputClass } from "../../lib/styles"
import { cn } from "../../lib/utils"
import { Label } from "../ui/label"

export const MAX_REASON_CHARACTERS = 500

/**
 * The reason an admin gives for rejecting a price or a product request. It's required, so the label
 * says so up front, and a problem with it is shown right under the field rather than at the top of
 * the page.
 */
export function RejectionReason({ id, value, onChange, error, required = "Required", placeholder, className }: {
  id: string
  value: string
  onChange: (value: string) => void
  /** Why the reason can't be used yet (empty, too long, hidden characters), or null. */
  error: string | null
  /** The pill beside the label: "Required", or e.g. "Required to reject" where it's only needed for one choice. */
  required?: string
  placeholder?: string
  className?: string
}) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return <div className={cn("space-y-2", className)}>
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={id}>Reason for rejection</Label>
      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{required}</span>
    </div>
    <textarea
      id={id}
      value={value}
      maxLength={MAX_REASON_CHARACTERS}
      aria-required="true"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      onChange={(event) => onChange(event.target.value)}
      className={cn(inputClass, "h-auto min-h-24 resize-y")}
      placeholder={placeholder}
    />
    <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
      <p id={hintId}>The contributor sees this reason, so say what needs correcting.</p>
      <span className="shrink-0 tabular-nums" aria-hidden="true">{value.length}/{MAX_REASON_CHARACTERS}</span>
    </div>
    {error && <p id={errorId} role="alert" className="text-sm font-medium text-destructive">{error}</p>}
  </div>
}
