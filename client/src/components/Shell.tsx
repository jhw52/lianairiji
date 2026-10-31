import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Icon } from './Icon'
import { useAuth } from '../lib/session'
import { WelcomeOverlay } from './WelcomeOverlay'
import { SiteToast } from './SiteToast'
import { useUnread } from '../lib/unread'

export function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { settings, user, welcome, dismissWelcome } = useAuth()
  const { items: unread } = useUnread()
  const anyUnread = Object.values(unread).some((i: any) => i?.unread)

  return (
    <div className="app-shell">
      <SiteToast />
      {settings?.bgUrl && (
        <div
          className="site-bg"
          style={{ backgroundImage: `url("${settings.bgUrl}")`, opacity: settings.bgOpacity }}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="main" data-readonly={user?.guestMode === 'readonly' ? 'true' : undefined}>
        <header
          className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14"
          style={{ background: 'rgba(250,246,239,.86)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e9e0d1' }}
        >
          <button
            className="relative p-1.5 -ml-1.5 rounded-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="打开菜单"
          >
            <Icon name="menu" size={20} />
            {anyUnread && <span className="nav-dot nav-dot-mini" style={{ top: 3, right: 3 }} />}
          </button>
          <span className="text-[15px] truncate min-w-0 flex-1" style={{ fontFamily: 'var(--font-serif)' }}>
            {settings?.name || '我们的世界'}
          </span>
        </header>
        <Outlet />
        {welcome && user && <WelcomeOverlay onDone={dismissWelcome} />}
      </div>
    </div>
  )
}
