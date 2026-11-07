import type { FieldError, UseFormRegisterReturn } from "react-hook-form"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

interface FormFieldProps {
  id: string
  label: string
  error?: FieldError
  registration: UseFormRegisterReturn
  type?: string
  autoComplete?: string
  placeholder?: string
  maxLength?: number
}

export function FormField({ id, label, error, registration, ...props }: FormFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} {...registration} />
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error.message}</p>}
    </div>
  )
}
