import { useEffect } from "react"

// Names the browser tab after the page, e.g. "Search & filter · TrolleySaver". A dialog that sets its own
// title (the log-in modal) puts the page's title back when it closes.
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · TrolleySaver`
    return () => { document.title = previous }
  }, [title])
}
