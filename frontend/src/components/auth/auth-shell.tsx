import { motion } from "motion/react"
import type { ReactNode } from "react"
import { Card } from "../ui/card"
import { Brand } from "./brand"

export function AuthShell({ children, wide = false, aside }: { children: ReactNode; wide?: boolean; aside?: ReactNode }) {
  return (
    <main className="aurora-page flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className={aside ? "relative grid w-full max-w-5xl items-stretch gap-5 lg:grid-cols-[1fr_440px]" : wide ? "relative w-full max-w-2xl" : "relative w-full max-w-[440px]"}>
        {aside}
        <Card className="glass-panel overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary/40 via-primary to-emerald-300/50" />
          <div className="px-6 pt-7 sm:px-8"><Brand /></div>
          {children}
        </Card>
        <p className={aside ? "text-center text-sm leading-relaxed text-muted-foreground lg:col-start-2" : "mt-5 text-center text-sm leading-relaxed text-muted-foreground"}>Compare prices. Build a smarter basket. Spend less.</p>
      </motion.div>
    </main>
  )
}
