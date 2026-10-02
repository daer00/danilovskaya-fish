export {}

type TgWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  initData?: string
  sendData?: (data: string) => void
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } }
  themeParams?: Record<string, string>
  colorScheme?: 'light' | 'dark'
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  onEvent?: (event: string, cb: () => void) => void
  offEvent?: (event: string, cb: () => void) => void
  MainButton: {
    text: string
    setText: (t: string) => void
    show: () => void
    hide: () => void
    enable: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
  }
  HapticFeedback?: {
    impactOccurred: (s: string) => void
    notificationOccurred?: (t: string) => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp }
  }
}
