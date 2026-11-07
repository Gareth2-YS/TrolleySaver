import { Check, ImageUp, LoaderCircle, X } from "lucide-react"
import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { prepareImage } from "../../contributions/image"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

/**
 * One chosen photo: the prepared file, a preview link and any validation message.
 * Each photo is checked and redrawn without its metadata (e.g. GPS location) before anything is uploaded.
 */
export function usePhoto() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const url = useRef<string | null>(null)
  // Only the latest choice counts if two are made while the first is still being prepared.
  const choice = useRef(0)
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  function replace(next: File | null) {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = next ? URL.createObjectURL(next) : null
    setFile(next)
    setPreviewUrl(url.current)
  }
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const next = input.files?.[0]
    if (!next) return
    const current = ++choice.current
    setPreparing(true)
    const prepared = await prepareImage(next)
    if (current !== choice.current) return
    setPreparing(false)
    if (prepared.error !== undefined) { replace(null); setError(prepared.error); input.value = ""; return }
    replace(prepared.file)
    setError(null)
  }
  function clear() { ++choice.current; setPreparing(false); replace(null); setError(null) }
  return { file, previewUrl, error, preparing, setError, select, clear }
}
export type Photo = ReturnType<typeof usePhoto>

/** A labelled drop zone for one photo, with a preview once chosen. */
export function PhotoDrop({ id, label, inputLabel, required = false, title, hint, previewAlt, reminders, photo }: {
  id: string
  label: string
  inputLabel: string
  required?: boolean
  title: string
  hint: string
  previewAlt: string
  reminders?: string[]
  photo: Photo
}) {
  const input = useRef<HTMLInputElement>(null)
  function remove() { photo.clear(); if (input.current) input.current.value = "" }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        {photo.file
          ? <Button type="button" variant="ghost" size="sm" className="h-8" onClick={remove}><X className="size-4" aria-hidden="true" />Remove</Button>
          : <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", required ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>{required ? "Required" : "Optional"}</span>}
      </div>
      <label
        htmlFor={id}
        className={cn(
          "grid min-h-40 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-secondary/40 text-center transition-colors hover:border-primary/50 hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
          photo.error ? "border-destructive/60" : required && !photo.file ? "border-primary/40" : "border-border",
        )}
      >
        {photo.previewUrl ? (
          <img src={photo.previewUrl} alt={previewAlt} className="max-h-72 w-full bg-white object-contain" />
        ) : (
          <span className="grid justify-items-center gap-1.5 p-5">
            <span className="grid size-11 place-items-center rounded-full bg-accent text-primary"><ImageUp className="size-5" aria-hidden="true" /></span>
            <strong className="mt-1 text-[15px] font-semibold">{title}</strong>
            <span className="text-sm text-muted-foreground">{hint}</span>
          </span>
        )}
        <input ref={input} id={id} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label={inputLabel} aria-describedby={`${id}-help`} aria-invalid={Boolean(photo.error)} disabled={photo.preparing} onChange={(event) => void photo.select(event)} />
      </label>
      <p id={`${id}-help`} className="sr-only">{hint}. JPG or PNG, up to 5 MB.</p>
      {photo.preparing && <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite"><LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden="true" />Preparing image…</p>}
      {reminders && !photo.file && (
        <ul className="flex flex-wrap gap-2" aria-label="Photo reminders">
          {reminders.map((reminder) => <li key={reminder} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium"><Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />{reminder}</li>)}
        </ul>
      )}
      {photo.error && <p role="alert" className="text-xs font-medium text-destructive">{photo.error}</p>}
    </div>
  )
}
