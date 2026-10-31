import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { AuthProvider, useAuth } from './lib/session'
import { PrivacyProvider } from './lib/privacy'
import { Shell } from './components/Shell'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Albums } from './pages/Albums'
import { AlbumDetail } from './pages/AlbumDetail'
import { Timeline } from './pages/Timeline'
import { CalendarPage } from './pages/Calendar'
import { Anniversaries } from './pages/Anniversaries'
import { Wishes } from './pages/Wishes'
import { Whisper } from './pages/Whisper'
import { Report } from './pages/Report'
import { SettingsPage } from './pages/Settings'
import { Profile } from './pages/Profile'
import './styles.css'

function Splash() {
  return (
    <div className="min-h-[100dvh] grid place-items-center" style={{ background: '#faf6ef' }}>
      <div className="text-center fade-up">
        <div className="text-4xl mb-3">🌷</div>
        <div style={{ fontFamily: 'var(--font-serif)', color: '#8c8175' }}>正在打开我们的世界…</div>
      </div>
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth()
  const loc = useLocation()
  useEffect(() => { document.title = '猪猪与小咪的世界' }, [])
  if (!ready) return <Splash />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

function App() {
  const { settings } = useAuth()

  useEffect(() => {
    const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%B7%3C/text%3E%3C/svg%3E"
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = settings?.logo || fallback
  }, [settings?.logo])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="albums" element={<Albums />} />
        <Route path="albums/:id" element={<AlbumDetail />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="anniversaries" element={<Anniversaries />} />
        <Route path="wishes" element={<Wishes />} />
        <Route path="whisper" element={<Whisper />} />
        <Route path="report" element={<Report />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <PrivacyProvider>
        <App />
      </PrivacyProvider>
    </AuthProvider>
  </BrowserRouter>
)
