import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/session'
import { api } from '../lib/api'

export function Login() {
  const { user, ready, login, settings, refresh } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation() as any
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(loc.search)
    const u = q.get('u')
    const p = q.get('p')
    if (u && p) { setUsername(u); setPassword(p); setPrefilled(true) }
  }, [loc.search])

  if (ready && user) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await login(username.trim(), password)
      navigate(loc.state?.from || '/', { replace: true })
    } catch (e: any) {
      setErr(e.message || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex" style={{ background: 'var(--color-paper)' }}>
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg,#f6ead9 0%,#efdcc8 45%,#e6cdb6 100%)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full overflow-hidden grid place-items-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#e9c8ba,#c0705f)' }}
          >
            {settings?.logo
              ? <img src={settings.logo} alt="" className="w-full h-full object-cover" />
              : <span className="text-[13px]">🌷</span>}
          </div>
          <div className="text-[13px] tracking-[0.2em]" style={{ color: '#8a6a52' }}>
            {settings?.name || '猪猪与小咪的世界'}
          </div>
        </div>
        <div className="relative z-10">
          <div
            className="polaroid w-[250px] mb-8"
            style={{ transform: 'rotate(-4deg)', background: '#fffdf8' }}
          >
            <div className="h-[200px] rounded-[2px]" style={{ background: 'linear-gradient(135deg,#e8cdb8,#c9a58b)' }} />
            <div className="text-center text-[13px] mt-3" style={{ color: '#8a6a52', fontFamily: 'var(--font-serif)' }}>
              我们的每一天
            </div>
          </div>
          <h1 className="text-[34px] leading-[1.35]" style={{ fontFamily: 'var(--font-serif)', color: '#4a3c30' }}>
            把日子过成<br />可以回看的样子
          </h1>
          <p className="mt-4 text-[14px] max-w-[340px] leading-7" style={{ color: '#7d6653' }}>
            只有你和我知道的入口。<br />
            这里存放照片、心事、还有每一次想记住的瞬间。
          </p>
        </div>
        <div className="text-[12px]" style={{ color: '#9b8168' }}>
          私有部署 · 数据只存在我们自己的设备里
        </div>
      </div>

      <div className="flex-1 grid place-items-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-[360px] fade-up">
          <div className="lg:hidden text-center mb-8">
            {settings?.logo
              ? <img src={settings.logo} alt="" className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
              : <div className="text-3xl mb-2">🌷</div>}
            <h1 className="text-[22px]" style={{ fontFamily: 'var(--font-serif)' }}>
              {settings?.name || '猪猪与小咪的世界'}
            </h1>
          </div>

          <h2 className="text-[24px] mb-1" style={{ fontFamily: 'var(--font-serif)' }}>欢迎回来</h2>
          <p className="text-[13px] mb-8" style={{ color: 'var(--color-muted)' }}>
            输入你的账号，继续记录我们的日子
          </p>

          <div className="space-y-4">
            <div>
              <label className="label">账号</label>
              <input
                className="input h-11"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="xiaomi 或 zhuzhu"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="label">密码</label>
              <input
                className="input h-11"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          {err && (
            <div className="mt-4 text-[13px] px-3 py-2 rounded-lg" style={{ background: '#b04a3c0f', color: '#a04435' }}>
              {err}
            </div>
          )}

          {prefilled && (
            <div className="mt-4 text-[12.5px] px-3 py-2 rounded-lg" style={{ background: '#f6ecdd', color: '#8a6a52' }}>
              已为你填好游客账号，点下面的按钮进入（只读，不能修改）
            </div>
          )}

          <button className="btn btn-primary w-full h-11 mt-6" disabled={busy || !username || !password}>
            {busy ? '正在进入…' : '进入我们的世界'}
          </button>

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="hairline flex-1" />
              <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>或者以游客身份看看</span>
              <div className="hairline flex-1" />
            </div>
            <button
              type="button"
              className="btn w-full"
              onClick={() => { setUsername('guest'); setPassword('guest1234'); setErr('') }}
            >
              演示模式
            </button>
            <p className="text-[11px] mt-2 text-center leading-5" style={{ color: 'var(--color-faint)' }}>
              会帮你填好演示账号，再点上面的按钮进入<br />
              演示里可以随便试用，退出后一切复原
            </p>
          </div>

          <div className="mt-8 pt-6" style={{ borderTop: '1px dashed var(--color-line)' }}>
            <p className="text-[12px] leading-6" style={{ color: 'var(--color-faint)' }}>
              初始账号：小咪 <span className="num">xiaomi</span> ／ 猪猪 <span className="num">zhuzhu</span>
              <br />
              首次登录后请到「设置」里修改密码。
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
