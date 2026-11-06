import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import type { FieldError, UseFormRegisterReturn } from "react-hook-form"
import { MAX_PASSWORD_LENGTH } from "../../auth/schemas"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

export function PasswordField({ id, label, error, registration, autoComplete = "current-password" }: { id: string; label: string; error?: FieldError; registration: UseFormRegisterReturn; autoComplete?: string }) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} maxLength={MAX_PASSWORD_LENGTH} className="pr-11" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...registration} />
        <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-0.5 text-muted-foreground" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error.message}</p>}
    </div>
  )
}
