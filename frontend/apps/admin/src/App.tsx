import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { AdminLayout } from './layout/AdminLayout'
import { BatchSetup } from './pages/BatchSetup'
import { BotTexts } from './pages/BotTexts'
import { Catalog } from './pages/Catalog'
import { Clients } from './pages/Clients'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Messages } from './pages/Messages'
import { Money } from './pages/Money'
import { Orders } from './pages/Orders'

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
          <Route path="orders" element={<Orders />} />
          <Route path="clients" element={<Clients />} />
          <Route path="messages" element={<Messages />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="money" element={<Money />} />
          <Route path="bot-texts" element={<BotTexts />} />
          <Route path="batches" element={<Navigate to="/" replace />} />
          <Route path="batches/:id" element={<BatchSetup />} />
          <Route path="expenses" element={<Navigate to="/money" replace />} />
          <Route path="summary" element={<Navigate to="/" replace />} />
          <Route path="finance" element={<Navigate to="/money" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
