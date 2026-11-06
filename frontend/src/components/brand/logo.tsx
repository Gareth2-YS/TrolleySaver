import { cn } from "../../lib/utils"

// The trolley from the TrolleySaver logo (assets/brand/trolley.svg, also the tab icon), drawn inline so it can change colour.
const TROLLEY = "M68 157H131C162 157 180 174 188 202L195 227L428 216C442 215 453 219 463 229L544 301C553 310 559 318 559 329C559 340 552 349 544 358L477 434C466 447 458 453 443 453H246C241 453 238 456 238 461C238 466 241 469 246 469H464C477 469 487 477 487 489C487 501 477 509 464 509H218C200 509 188 498 184 481L134 225C133 218 129 214 121 214H68C51 214 39 203 39 187C39 170 51 157 68 157ZM515 330A21 21 0 1 0 473 330A21 21 0 1 0 515 330Z"

/**
 * `onBand`: the light version for the dark-green header, where the trolley is light green and the tick
 * takes the band's colour (a white tick on light green is too faint). Otherwise the logo's own colours,
 * with a light "Trolley" in dark mode.
 */
export function TrolleyIcon({ onBand = false, className }: { onBand?: boolean; className?: string }) {
  return (
    <svg viewBox="16 132 566 482" aria-hidden="true" className={cn("w-auto shrink-0", className)}>
      <g className={onBand ? "fill-band-accent" : "fill-primary"}>
        <path fillRule="evenodd" d={TROLLEY} />
        <circle cx="216" cy="548" r="42" />
        <circle cx="411" cy="548" r="42" />
      </g>
      <path d="M262 345L305 387L403 292" fill="none" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round"
        className={onBand ? "stroke-band" : "stroke-[hsl(var(--logo-tick))]"} />
    </svg>
  )
}

export function Logo({ onBand = false, size = "md", className }: { onBand?: boolean; size?: "md" | "lg"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", size === "lg" ? "gap-3" : "gap-2.5", className)}>
      <TrolleyIcon onBand={onBand} className={size === "lg" ? "h-11" : "h-8"} />
      <span className={cn("font-display font-black leading-none tracking-tight", size === "lg" ? "text-[30px]" : "text-[22px]")}>
        <span className={onBand ? "text-white" : "text-[hsl(var(--logo-trolley))]"}>Trolley</span>
        <span className={onBand ? "text-band-accent" : "text-primary"}>Saver</span>
      </span>
    </span>
  )
}
