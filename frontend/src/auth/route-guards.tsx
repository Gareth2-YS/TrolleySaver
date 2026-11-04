import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "./auth-context"
import type { AuthRole } from "./types"
import { SessionError, SessionLoading } from "../pages/session-loading"

export function ProtectedRoute({ role }: { role?: AuthRole }) {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (role && user.role !== role) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, error } = useAuth()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (user) return <Navigate to="/contribute" replace />
  return <Outlet />
}
