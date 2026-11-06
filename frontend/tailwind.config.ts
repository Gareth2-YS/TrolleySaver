import type { Config } from "tailwindcss"

export default {
  // `dark:` classes follow the `dark` class lib/theme.ts puts on <html> (the toggle, else the system setting).
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        band: "hsl(var(--band))",
        "band-accent": "hsl(var(--band-accent))",
        "band-accent-foreground": "hsl(var(--band-accent-foreground))"
      },
      fontFamily: {
        // Inter for text; Nunito, close to the logo's rounded lettering, for headings, product names and prices.
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Nunito Variable", "Nunito", "ui-rounded", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      // Buttons and inputs: 12px corners. Cards use rounded-2xl (16px).
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      }
    }
  },
  plugins: []
} satisfies Config
