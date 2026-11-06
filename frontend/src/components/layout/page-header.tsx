import type { ReactNode } from "react"
import { pageTitleClass } from "../../lib/styles"

// Every page opens the same way: a title, a short description and, optionally, something on the right.
export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex-[999_1_480px]">
        <h1 className={pageTitleClass}>{title}</h1>
        {description && <p className="mt-2 max-w-[62ch] text-base leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </header>
  )
}
