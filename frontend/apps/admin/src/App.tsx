import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { AdminLayout } from './layout/AdminLayout'
import { Batches } from './pages/Batches'
import { BotTexts } from './pages/BotTexts'
import { Catalog } from './pages/Catalog'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Orders } from './pages/Orders'
import { Summary } from './pages/Summary'

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="boot">Загрузка…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="batches" element={<Batches />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="orders" element={<Orders />} />
          <Route path="summary" element={<Summary />} />
          <Route path="bot-texts" element={<BotTexts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
