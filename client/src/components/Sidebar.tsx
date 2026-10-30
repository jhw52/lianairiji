import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useAuth } from '../lib/session'
import { avatarSrc } from '../lib/avatar'

const NAV = [
  { to: '/', label: '首页', icon: 'home', end: true },
  { to: '/timeline', label: '时间轴', icon: 'book' },
  { to: '/albums', label: '相册', icon: 'image' },
  { to: '/calendar', label: '日历', icon: 'calendar' },
  { to: '/anniversaries', label: '纪念日', icon: 'gift' },
  { to: '/wishes', label: '心愿清单', icon: 'list' },
  { to: '/whisper', label: '悄悄话', icon: 'message' },
  { to: '/report', label: '年度报告', icon: 'chart' }
]

const MIN = 200
const MAX = 360
const COLLAPSED = 72

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, settings, logout, patchSettings, live } = useAuth()
  const navigate = useNavigate()
  const [width, setWidth] = useState(() => Number(localStorage.getItem('sidebar.width')) || 248)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar.collapsed') === '1')
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  useEffect(() => {
    if (settings?.ui?.sidebarWidth) {
      const saved = Number(localStorage.getItem('sidebar.width'))
      setWidth(Math.min(MAX, Math.max(MIN, saved || settings.ui.sidebarWidth)))
    }
  }, [settings?.ui?.sidebarWidth])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      const w = Math.min(MAX, Math.max(MIN, dragRef.current.startW + (e.clientX - dragRef.current.startX)))
      setWidth(w)
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
      const w = widthRef.current
      localStorage.setItem('sidebar.width', String(w))
      patchSettings({ ui: { sidebarWidth: w } }).catch(() => {})
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [patchSettings])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar.collapsed', next ? '1' : '0')
    patchSettings({ ui: { sidebarCollapsed: next } }).catch(() => {})
  }

  const doLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isCollapsed = collapsed && !mobileOpen
  const w = isCollapsed ? COLLAPSED : width

  return (
    <>
      {mobileOpen && <div className="drawer-mask md:hidden" onClick={onClose} />}
      <aside
        className={`sidebar ${mobileOpen ? 'flex fixed left-0 top-0 z-50 md:sticky md:z-30' : 'hidden md:flex md:sticky md:top-0'}`}
        style={{ width: mobileOpen ? 264 : w }}
      >
        <div className="flex items-center gap-2.5 px-4 h-[68px] shrink-0">
          <div
            className="w-9 h-9 rounded-full overflow-hidden grid place-items-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#e9c8ba,#c0705f)', color: '#fffaf5' }}
          >
            {settings?.logo
              ? <img src={settings.logo} alt="" className="w-full h-full object-cover" />
              : <span className="text-[15px]">🌷</span>}
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-[15.5px] leading-tight tracking-wide truncate" style={{ fontFamily: 'var(--font-serif)' }}>
                {settings?.name || '我们的世界'}
              </div>
              <div className="text-[11px] truncate" style={{ color: live ? '#8e9b7e' : '#b3a99b' }}>
                {live ? '实时同步中' : '连接中…'}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-0.5">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} collapsed={isCollapsed} onNavigate={onClose} />
          ))}
        </nav>

        <div className="px-2.5 pb-3 space-y-0.5">
          {user?.guestMode !== 'readonly' && (
            <NavLink to="/settings" onClick={onClose} className="nav-item" title="设置">
              <Icon name="settings" size={18} className="shrink-0" />
              {!isCollapsed && <span>设置</span>}
            </NavLink>
          )}

          {!mobileOpen && (
            <button
              className="nav-item w-full text-left"
              onClick={toggleCollapse}
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              <Icon name={collapsed ? 'right' : 'left'} size={18} className="shrink-0" />
              {!isCollapsed && <span>收起</span>}
            </button>
          )}

          <div className={`flex items-center gap-2.5 px-2 py-2 mt-1 rounded-[10px] ${isCollapsed ? 'justify-center' : ''}`}>
            {user?.guestMode ? (
              <div
                className="w-8 h-8 rounded-full overflow-hidden grid place-items-center text-[12px] shrink-0"
                style={{ background: '#eadfd0', color: '#8a6a52' }}
              >
                {avatarSrc(user?.avatar)
                  ? <img src={avatarSrc(user?.avatar)!} alt="" className="w-full h-full object-cover" />
                  : (user?.displayName?.slice(0, 1) || '游')}
              </div>
            ) : (
              <Link
                to="/profile"
                onClick={onClose}
                className="w-8 h-8 rounded-full overflow-hidden grid place-items-center text-[12px] shrink-0 transition-transform hover:scale-105"
                style={{ background: '#eadfd0', color: '#8a6a52' }}
                title="修改头像"
              >
                {avatarSrc(user?.avatar)
                  ? <img src={avatarSrc(user?.avatar)!} alt="" className="w-full h-full object-cover" />
                  : (user?.displayName?.slice(0, 1) || '我')}
              </Link>
            )}
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] truncate">{user?.displayName}</div>
                  <div className="text-[11px]" style={{ color: '#b3a99b' }}>已登录</div>
                </div>
                <button
                  className="btn-ghost p-1.5 rounded-md"
                  style={{ color: '#8c8175' }}
                  onClick={doLogout}
                  title="退出登录"
                >
                  <Icon name="logout" size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {!mobileOpen && !isCollapsed && (
          <div
            className="sidebar-drag"
            data-dragging={dragging}
            onPointerDown={(e) => {
              dragRef.current = { startX: e.clientX, startW: width }
              setDragging(true)
            }}
          />
        )}
      </aside>
    </>
  )
}

function NavItem({
  to, label, icon, end, collapsed, onNavigate
}: {
  to: string; label: string; icon: string; end?: boolean; collapsed: boolean; onNavigate: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
      style={({ isActive }) => (isActive ? { background: '#c0705f10', color: '#a85c4d' } : undefined)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 rounded-r"
              style={{ top: 11, bottom: 11, width: 3, background: '#c0705f' }}
            />
          )}
          <Icon name={icon} size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}
