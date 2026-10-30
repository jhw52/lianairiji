import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState
} from 'react'
import type { ReactNode } from 'react'
import { api } from './api'

export interface User {
  id: string
  username: string
  displayName: string
  role: string
  avatar?: string | null
}

export interface Settings {
  name: string
  startDate: string | null
  motto: string
  heroMediaId: string | null
  heroOpacity: number
  bgMediaId: string | null
  bgUrl: string | null
  bgOpacity: number
  logo: string | null
  logoMediaId: string | null
  timezone: string
  ai: { enabled: boolean; baseUrl: string; model: string; vision: boolean; dailyLimit: number; hasKey: boolean }
  privacy: { extraAuthCalendar: boolean }
  ui: { sidebarWidth: number; sidebarCollapsed: boolean }
}

interface Ctx {
  ready: boolean
  user: User | null
  settings: Settings | null
  version: number
  live: boolean
  welcome: boolean
  dismissWelcome: () => void
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  patchSettings: (patch: any) => Promise<Settings>
}

const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState(0)
  const [live, setLive] = useState(false)
  const [welcome, setWelcome] = useState(false)

  const refresh = useCallback(async () => {
    const d = await api('/api/bootstrap')
    setUser(d.user)
    setSettings(d.settings)
    setVersion(d.version)
    setReady(true)
  }, [])

  useEffect(() => {
    refresh().catch(() => setReady(true))
  }, [refresh])

  useEffect(() => {
    if (!user) {
      setLive(false)
      return
    }
    let es: EventSource | null = null
    let retry = 0
    let timer: any = null
    let closed = false

    const connect = () => {
      if (closed) return
      es = new EventSource('/api/events')
      es.addEventListener('hello', () => { setLive(true); retry = 0 })
      es.addEventListener('changed', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data)
          if (typeof d.version === 'number') setVersion(d.version)
        } catch { /* ignore */ }
      })
      es.onerror = () => {
        setLive(false)
        es?.close()
        if (closed) return
        retry = Math.min(retry + 1, 6)
        const wait = Math.min(1000 * 2 ** (retry - 1), 30000)
        timer = setTimeout(connect, wait)
      }
    }
    connect()

    return () => {
      closed = true
      clearTimeout(timer)
      es?.close()
    }
  }, [user?.id])

  const login = useCallback(async (username: string, password: string) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { username, password } })
    setUser(d.user)
    await refresh()
    if (!d.user?.guestMode) setWelcome(true)
  }, [refresh])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const patchSettings = useCallback(async (patch: any) => {
    const d = await api('/api/settings', { method: 'PUT', body: patch })
    setSettings(d.settings)
    return d.settings as Settings
  }, [])

  const value = useMemo(
    () => ({
      ready, user, settings, version, live, welcome,
      dismissWelcome: () => setWelcome(false),
      refresh, login, logout, patchSettings
    }),
    [ready, user, settings, version, live, welcome, refresh, login, logout, patchSettings]
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}

/** 带自动刷新（SSE 版本号变化时重新拉取）的数据钩子 */
export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const { version } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const key = JSON.stringify(deps)

  useEffect(() => {
    if (!path) return
    let alive = true
    setLoading(true)
    api<T>(path)
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(e.message || '加载失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [path, key, version, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

export function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  const ref = useRef<any>(null)
  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setV(value), delay)
    return () => clearTimeout(ref.current)
  }, [value, delay])
  return v
}
