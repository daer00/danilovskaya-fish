import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { NAV } from '../sections'

export function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!user) return null

  return (
    <div className={`crm${open ? ' crm--open' : ''}`}>
      <aside className="crm-side" id="crm-menu">
        <div className="crm-side__brand">
          <b>Даниловская рыба</b>
          <span>CRM</span>
        </div>
        <nav className="crm-side__nav">
          {NAV.map((s) => (
            <NavLink key={s.path} to={s.path} end={'end' in s ? s.end : false}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="crm-side__out" onClick={logout}>
          Выйти
        </button>
      </aside>

      <div className="crm-main">
        <header className="crm-top">
          <button
            type="button"
            className="crm-burger"
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={open}
            aria-controls="crm-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="crm-top__title">
            <b>Даниловская рыба</b>
            <span>Админка</span>
          </div>
        </header>
        <button
          type="button"
          className="crm-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
        <div className="crm-page">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
