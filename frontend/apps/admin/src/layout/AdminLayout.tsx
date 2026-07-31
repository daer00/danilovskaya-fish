import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { SECTIONS } from '../sections'

export function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [location.pathname])

  if (!user) return null
  return (
    <div className={`layout${open ? ' layout--nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__bar">
          <div className="brand">Даниловская рыба</div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <nav className="sidebar__nav">
          <NavLink to="/" end>
            Главная
          </NavLink>
          {SECTIONS.map((s) => (
            <NavLink key={s.path} to={s.path}>
              {s.label}
            </NavLink>
          ))}
          <button type="button" className="logout" onClick={logout}>
            Выйти
            <span className="logout__email">{user.email}</span>
          </button>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
