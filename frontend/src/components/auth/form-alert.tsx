import { AlertCircle } from "lucide-react"

export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null
  return <div role="alert" className="flex gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{message}</span></div>
}
