import { CalendarDays, Image, Store } from "lucide-react"
import type { ReactNode } from "react"
import { formatDay, formatTimestamp } from "../../lib/format"
import { EnlargeableImage } from "../enlargeable-image"

/**
 * One picture on an admin review card: a thumbnail that enlarges on click, like the product pictures
 * on Search, or a dashed box saying why there's nothing to show.
 */
export function ReviewThumb({ label, url, name, missing, onExpired }: { label: string; url?: string; name: string; missing: string; onExpired: () => void }) {
  return (
    <figure className="w-24 shrink-0 sm:w-28">
      {url ? (
        <EnlargeableImage url={url} name={name} onExpired={onExpired} className="size-24 sm:size-28" />
      ) : (
        <div className="grid size-24 place-items-center rounded-lg border border-dashed bg-secondary/50 p-2 text-center text-muted-foreground sm:size-28">
          <div><Image aria-hidden="true" className="mx-auto size-5" /><span className="mt-1 block text-[11px] leading-tight">{missing}</span></div>
        </div>
      )}
      <figcaption className="mt-1.5 text-center text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

/**
 * The layout shared by both admin review queues (flagged prices and new product requests): pictures
 * on the left; product, status, price, store, dates and submitter on the right; then whatever the
 * card needs to decide it (`children`) across the full width.
 */
export function ReviewCard({ pictures, title, badge, price, store, observedDate, submitter, submittedAt, extra, rejectionReason, children }: {
  pictures: ReactNode
  title: string
  badge: ReactNode
  price: string
  store: string
  observedDate: string
  submitter: string
  submittedAt: string
  extra?: { label: string; value: string }
  rejectionReason?: string
  children?: ReactNode
}) {
  return (
    <article className="rounded-xl border bg-card/45 p-4 lg:p-5">
      <div className="flex gap-4 lg:gap-5">
        <div className="flex shrink-0 flex-col gap-3">{pictures}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display font-extrabold leading-snug">{title}</h3>
            {badge}
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">{price}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Store className="size-3.5" />{store}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Observed on {formatDay(observedDate)}</span>
          </div>
          <dl className="mt-4 grid gap-3 rounded-xl bg-secondary/55 p-4 text-xs sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Submitted by</dt><dd className="mt-1 break-words font-medium">{submitter}</dd></div>
            <div><dt className="text-muted-foreground">Submitted at</dt><dd className="mt-1 font-medium">{formatTimestamp(submittedAt)}</dd></div>
            {extra && <div className="sm:col-span-2"><dt className="text-muted-foreground">{extra.label}</dt><dd className="mt-1 break-all font-medium">{extra.value}</dd></div>}
          </dl>
          {rejectionReason && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <strong>Rejection reason:</strong> {rejectionReason}
            </p>
          )}
        </div>
      </div>
      {children}
    </article>
  )
}
