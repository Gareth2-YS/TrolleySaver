import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ProtectedRoute } from "./auth/route-guards"
import { AuthDialog, type AuthLocationState } from "./pages/auth-dialog"
import { ContributePage } from "./pages/contribute"
import { UnauthorizedPage } from "./pages/unauthorized"
import { SearchProductsPage } from "./pages/search-products"
import { SmartBasketPage } from "./pages/smart-basket"

const AUTH_MODES = { "/login": "login", "/register": "register" } as const

export function App() {
  const location = useLocation()
  const authMode = AUTH_MODES[location.pathname as keyof typeof AUTH_MODES]
  // On /login and /register the page underneath stays: the one the modal was opened from, or Smart basket.
  const pageLocation = authMode ? (location.state as AuthLocationState | null)?.background ?? "/basket" : location

  return (
    <>
      <Routes location={pageLocation}>
        <Route path="/basket" element={<SmartBasketPage />} />
        <Route path="/search" element={<SearchProductsPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/contribute" element={<ContributePage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="/app" element={<Navigate to="/contribute" replace />} />
        <Route path="/admin" element={<Navigate to="/contribute" replace />} />
        <Route path="*" element={<Navigate to="/basket" replace />} />
      </Routes>
      {authMode && <AuthDialog mode={authMode} />}
    </>
  )
}
