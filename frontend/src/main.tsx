import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { Toaster } from "sonner"
import { App } from "./app"
import { AuthProvider } from "./auth/auth-context"
import { startTheme, useTheme } from "./lib/theme"
import "@fontsource-variable/inter"
import "@fontsource-variable/nunito"
import "./styles.css"

startTheme()

function ThemedToaster() {
  return <Toaster position="top-center" richColors closeButton theme={useTheme()} />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ThemedToaster />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
