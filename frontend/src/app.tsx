import { Navigate, Route, Routes } from "react-router-dom"
import { PublicOnlyRoute, ProtectedRoute } from "./auth/route-guards"
import { ContributePage } from "./pages/contribute"
import { LoginPage } from "./pages/login"
import { RegisterPage } from "./pages/register"
import { UnauthorizedPage } from "./pages/unauthorized"
import { SearchProductsPage } from "./pages/search-products"
import { SmartBasketPage } from "./pages/smart-basket"

export function App() {
  return (
    <Routes>
      <Route path="/basket" element={<SmartBasketPage />} />
      <Route path="/search" element={<SearchProductsPage />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/contribute" element={<ContributePage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
      </Route>
      <Route path="/app" element={<Navigate to="/contribute" replace />} />
      <Route path="/admin" element={<Navigate to="/contribute" replace />} />
      <Route path="*" element={<Navigate to="/basket" replace />} />
    </Routes>
  )
}
