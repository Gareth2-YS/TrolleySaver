import { useRef, useState } from "react"

export function ProductImage({ url, fallback, name, onExpired, className }: { url?: string; fallback?: string; name: string; onExpired: () => void; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const retried = useRef(false)
  const showProduct = Boolean(url && failedUrl !== url)
  const src = showProduct ? url : fallback
  if (!src) return null
  return <img src={src} alt={showProduct ? name : ""} aria-hidden={!showProduct} className={className} onLoad={() => { if (showProduct) retried.current = false }} onError={() => {
    if (!showProduct) return
    setFailedUrl(url)
    if (!retried.current) { retried.current = true; onExpired() }
  }} />
}
