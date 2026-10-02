import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 1
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function applyTheme() {
  const w = window.Telegram?.WebApp
  const scheme = w?.colorScheme
  let dark: boolean
  if (scheme === 'dark') dark = true
  else if (scheme === 'light') dark = false
  else {
    const bg = w?.themeParams?.bg_color
    dark = bg ? luminance(bg) < 0.45 : window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  // Шапка/фон Telegram в тон нашей палитре
  try {
    w?.setHeaderColor?.(dark ? '#121416' : '#f4f0e8')
    w?.setBackgroundColor?.(dark ? '#121416' : '#f4f0e8')
  } catch {
    /* старые клиенты */
  }
}


const tg = window.Telegram?.WebApp
tg?.ready()
tg?.expand()
applyTheme()
tg?.onEvent?.('themeChanged', applyTheme)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
