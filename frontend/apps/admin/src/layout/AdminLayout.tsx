import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { SECTIONS } from '../sections'

export function AdminLayout() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Даниловская рыба</div>
        <nav>
          <NavLink to="/" end>
            Главная
          </NavLink>
          {SECTIONS.map((s) => (
            <NavLink key={s.path} to={s.path}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="logout" onClick={logout}>
          Выйти ({user.email})
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
