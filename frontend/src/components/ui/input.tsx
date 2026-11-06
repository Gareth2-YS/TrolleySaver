import * as React from "react"
import { inputClass } from "../../lib/styles"
import { cn } from "../../lib/utils"

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(inputClass, className)}
      {...props}
    />
  ),
)
Input.displayName = "Input"
