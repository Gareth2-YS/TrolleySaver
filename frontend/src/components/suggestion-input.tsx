import { Check, Plus } from "lucide-react"
import { useEffect, useState, type ComponentProps, type MouseEvent } from "react"
import { isSuggested, matchRange, matchSuggestions, tidy, type Suggestion } from "../lib/suggestions"
import { cn } from "../lib/utils"
import { Input } from "./ui/input"

type SuggestionInputProps = Omit<ComponentProps<"input">, "id" | "value" | "onChange" | "list" | "role"> & {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: Suggestion[]
  /** Names a value that isn't listed yet: "New category: “Oat Milk”". */
  noun: string
  /** One line under that row, saying what happens to a new value. */
  newHint: string
  /** Names the list for screen readers, such as "Categories". */
  listLabel: string
}

/**
 * A text field that suggests values already in the catalogue as you type, without limiting you to
 * them. When what you typed isn't listed, a "New …" row at the top says it will be added. ↑ and ↓
 * move through the list, Enter picks, Esc closes; the field keeps focus throughout.
 */
export function SuggestionInput({ id, value, onChange, suggestions, noun, newHint, listLabel, ...inputProps }: SuggestionInputProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = tidy(value)
  const matches = matchSuggestions(suggestions, value)
  const offerNew = Boolean(typed) && !isSuggested(suggestions, value)
  // What each row sets the field to: the "New …" row first, when there is one, then the matches.
  const choices = [...(offerNew ? [typed] : []), ...matches.map((suggestion) => suggestion.label)]
  const showing = open && choices.length > 0
  const listId = `${id}-suggestions`
  const optionId = (index: number) => `${id}-suggestion-${index}`

  useEffect(() => {
    if (showing && active >= 0) document.getElementById(`${id}-suggestion-${active}`)?.scrollIntoView?.({ block: "nearest" })
  }, [showing, active, id])

  function close() { setOpen(false); setActive(-1) }
  function choose(next: string) { onChange(next); close() }
  // Each row keeps focus in the field when pressed, so the list doesn't close before the click lands.
  const rowProps = (index: number) => ({
    id: optionId(index),
    role: "option" as const,
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onMouseEnter: () => setActive(index),
    onClick: () => choose(choices[index]),
  })
  const row = (isActive: boolean) => cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm", isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent")
  const quiet = (isActive: boolean) => isActive ? "text-primary-foreground/85" : "text-muted-foreground"

  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }}>
    <Input
      {...inputProps}
      id={id}
      value={value}
      role="combobox"
      autoComplete="off"
      aria-autocomplete="list"
      aria-expanded={showing}
      aria-controls={showing ? listId : undefined}
      aria-activedescendant={showing && active >= 0 ? optionId(active) : undefined}
      onFocus={() => { setOpen(true); setActive(-1) }}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1) }}
      onKeyDown={(event) => {
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length > 0) {
          event.preventDefault()
          const down = event.key === "ArrowDown"
          setOpen(true)
          setActive((current) => down ? (current + 1) % choices.length : current <= 0 ? choices.length - 1 : current - 1)
        } else if (event.key === "Enter" && showing) {
          // Enter picks the highlighted row; with none, it just closes the list rather than sending the form.
          event.preventDefault()
          if (active >= 0) choose(choices[active]); else close()
        } else if (event.key === "Escape" && showing) {
          event.preventDefault()
          close()
        }
      }}
    />
    {showing && <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      <div id={listId} role="listbox" aria-label={listLabel} className="max-h-64 overflow-y-auto overscroll-contain p-1">
        {offerNew && <div {...rowProps(0)} aria-selected={false} className={cn(row(active === 0), "py-2")}>
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", active === 0 ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground")}><Plus className="size-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="font-semibold">New {noun}: “{typed}”</span>
            <span className={cn("block text-xs", quiet(active === 0))}>{newHint}</span>
          </span>
        </div>}
        {offerNew && matches.length > 0 && <div aria-hidden="true" className="mx-1.5 my-1 h-px bg-border" />}
        {matches.map((suggestion, position) => {
          const index = position + (offerNew ? 1 : 0)
          const isActive = index === active
          const selected = suggestion.label.toLocaleLowerCase() === typed.toLocaleLowerCase()
          return <div key={suggestion.label} {...rowProps(index)} aria-selected={selected} className={cn(row(isActive), "min-h-9 py-1.5")}>
            <span className="grid w-4 shrink-0 place-items-center">{selected && <Check className="size-4" aria-hidden="true" />}</span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><Highlighted label={suggestion.label} typed={value} /></span>
            {suggestion.count !== undefined && <span className={cn("shrink-0 text-xs tabular-nums", quiet(isActive))}>
              {suggestion.count}<span className="sr-only"> {suggestion.count === 1 ? "product" : "products"}</span>
            </span>}
          </div>
        })}
      </div>
    </div>}
  </div>
}

/** The label, with the part matching what was typed in bold. */
function Highlighted({ label, typed }: { label: string; typed: string }) {
  const range = matchRange(label, typed)
  if (!range) return <>{label}</>
  const [start, end] = range
  return <>{label.slice(0, start)}<strong className="font-bold">{label.slice(start, end)}</strong>{label.slice(end)}</>
}
