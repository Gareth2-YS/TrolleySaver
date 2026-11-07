import { X } from "lucide-react"
import { useRef } from "react"
import { cn } from "../lib/utils"
import { ProductImage } from "./product-image"
import { Button } from "./ui/button"

/**
 * A thumbnail that opens the full picture in a dialog, like the product pictures on Search: an
 * "Enlarge image of …" button, then an "Enlarged image of …" dialog that closes with its button,
 * Esc or a click on the backdrop. `onExpired` is called once if the signed link has expired, so the
 * caller can fetch a fresh one.
 */
export function EnlargeableImage({ url, name, onExpired, fallback, className }: { url: string; name: string; onExpired: () => void; fallback?: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  // The thumbnail and the enlarged copy load the same link, so an expired one is reported once, not twice.
  const reported = useRef<string | null>(null)
  function expired() {
    if (reported.current === url) return
    reported.current = url
    onExpired()
  }
  return (
    <>
      <button
        type="button"
        className="shrink-0 cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Enlarge image of ${name}`}
        title="Click to enlarge image"
        onClick={() => dialog.current?.showModal()}
      >
        <ProductImage url={url} fallback={fallback} name={name} onExpired={expired} className={cn("product-tile", className)} />
      </button>
      <dialog
        ref={dialog}
        aria-label={`Enlarged image of ${name}`}
        className="max-h-[95vh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-2xl backdrop:bg-black/75"
        onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="truncate font-medium">{name}</p>
          <Button type="button" variant="ghost" size="icon" aria-label={`Close enlarged image of ${name}`} onClick={() => dialog.current?.close()}>
            <X className="size-4" />
          </Button>
        </div>
        <ProductImage url={url} fallback={fallback} name={name} onExpired={expired} className="mx-auto max-h-[82vh] max-w-full rounded-lg bg-white object-contain" />
      </dialog>
    </>
  )
}
