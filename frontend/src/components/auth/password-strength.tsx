import { Check } from "lucide-react"
import { cn } from "../../lib/utils"

const rules = [
  ["8+ characters", (value: string) => value.length >= 8],
  ["Upper & lowercase", (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value)],
  ["A number", (value: string) => /[0-9]/.test(value)],
  ["A symbol", (value: string) => /[^A-Za-z0-9]/.test(value)],
] as const

export function PasswordStrength({ password }: { password: string }) {
  const passed = rules.filter(([, test]) => test(password)).length
  return (
    <div className="rounded-md bg-secondary/70 p-3" aria-label={`Password strength: ${passed} of ${rules.length} requirements met`}>
      <div className="mb-2 flex gap-1" aria-hidden="true">{rules.map((rule, index) => <span key={rule[0]} className={cn("h-1 flex-1 rounded-full transition-colors", index < passed ? "bg-primary" : "bg-border")} />)}</div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {rules.map(([label, test]) => <li key={label} className={cn("flex items-center gap-1", test(password) && "text-primary")}><Check className="size-3" />{label}</li>)}
      </ul>
    </div>
  )
}
