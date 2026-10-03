const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api/v1'
const TOKEN_KEY = 'fish:admin:token'
const REFRESH_KEY = 'fish:admin:refresh'
/** На мобильном интернете без таймаута fetch может висеть минутами → вечная «Загрузка…» */
const FETCH_MS = 25_000

export type Role = 'admin'

export interface AdminUser {
  id: number
  email: string
  full_name: string | null
  role: Role
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function getRefresh(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}
function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

function headers(): Record<string, string> {
  const t = getToken()
  return t
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }
    : { 'Content-Type': 'application/json' }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchApi(input: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_MS)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, 'Сервер не отвечает. Проверьте интернет и обновите страницу.')
    }
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и обновите страницу.')
  } finally {
    window.clearTimeout(timer)
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Ошибка ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      /* */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const rt = getRefresh()
  if (!rt) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const data = await handle<{ access_token: string; refresh_token: string }>(
          await fetchApi(`${BASE}/admin/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: rt }),
          }),
        )
        setTokens(data.access_token, data.refresh_token)
        return true
      } catch {
        clearToken()
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetchApi(`${BASE}${path}`, init)
  if (res.status !== 401 || path.includes('/admin/auth/')) return res
  if (!(await tryRefresh())) return res
  const h = { ...(init?.headers as Record<string, string> | undefined), ...headers() }
  return fetchApi(`${BASE}${path}`, { ...init, headers: h })
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await request(path, { headers: headers() }))
}
export async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await request(path, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

export async function apiUpload(path: string, file: File): Promise<{ url: string }> {
  const t = getToken()
  const fd = new FormData()
  fd.append('file', file)
  const once = async (token: string | null) =>
    fetchApi(`${BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    })
  let res = await once(t)
  if (res.status === 401 && (await tryRefresh())) res = await once(getToken())
  return handle<{ url: string }>(res)
}

export async function login(email: string, password: string): Promise<void> {
  const data = await handle<{ access_token: string; refresh_token: string }>(
    await fetchApi(`${BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  setTokens(data.access_token, data.refresh_token)
}

export async function fetchMe(): Promise<AdminUser> {
  return apiGet<AdminUser>('/admin/auth/me')
}
