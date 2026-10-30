import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from './Icon'
import { api } from '../lib/api'
import { useApi } from '../lib/session'

const isLocal = (u: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(u)

export function QrEntry() {
  const origin = window.location.origin
  const [mode, setMode] = useState<'login' | 'visitor'>('login')
  const [base, setBase] = useState(() => (isLocal(origin) ? '' : `${origin}/login`))
  const creds = useApi<any>('/api/guest/visitor')
  const visitor = creds.data as { username: string; password: string | null } | null
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')


  const target = useMemo(() => {
    const b = base.trim()
    if (!b) return ''
    if (mode === 'login') return b
    if (!visitor?.password) return ''
    const root = b.replace(/\?.*$/, '')
    return `${root}?u=${encodeURIComponent(visitor.username)}&p=${encodeURIComponent(visitor.password)}`
  }, [base, mode, visitor])

  useEffect(() => {
    if (!target) { setDataUrl(''); return }
    let alive = true
    QRCode.toDataURL(target, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3f342a', light: '#fffdf8' }
    })
      .then((d) => { if (alive) { setDataUrl(d); setErr('') } })
      .catch(() => { if (alive) { setDataUrl(''); setErr('这串地址二维码识别不了') } })
    return () => { alive = false }
  }, [target])

  const copy = async () => {
    if (!target) return
    try {
      await navigator.clipboard.writeText(target)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('复制这个地址', target)
    }
  }

  const download = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = mode === 'visitor' ? '游客登录二维码.png' : '登录页二维码.png'
    a.click()
  }

  return (
    <div>
      <div className="tabs mb-5">
        <button className="tab" data-active={mode === 'login'} onClick={() => setMode('login')}>登录页</button>
        <button className="tab" data-active={mode === 'visitor'} onClick={() => setMode('visitor')}>游客登录</button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div
          className="rounded-2xl p-3 shrink-0 grid place-items-center"
          style={{ background: '#fffdf8', border: '1px solid var(--color-line)', width: 214, height: 214 }}
        >
          {dataUrl
            ? <img src={dataUrl} alt="网站二维码" width={188} height={188} style={{ display: 'block', borderRadius: 8 }} />
            : <span className="text-[12px] px-4 text-center leading-5" style={{ color: 'var(--color-faint)' }}>
                {mode === 'visitor' && !visitor?.password ? '先给游客设一个密码' : '填好地址\n二维码会出现'}
              </span>}
        </div>

        <div className="flex-1 min-w-0">
          <label className="label">二维码要打开的地址</label>
          <input
            className="input"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="http://8.148.205.121/login"
          />
          {err && <p className="text-[11.5px] mt-1.5" style={{ color: '#a04435' }}>{err}</p>}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button className="btn btn-sm" onClick={copy} disabled={!target}>
              <Icon name="check" size={13} /> {copied ? '已复制' : '复制链接'}
            </button>
            <button className="btn btn-sm" onClick={download} disabled={!dataUrl}>下载二维码</button>
            <button className="btn btn-sm" onClick={() => setBase(`${origin}/login`)}>用当前地址</button>
          </div>

          <p className="text-[11.5px] mt-3 leading-5" style={{ color: 'var(--color-faint)' }}>
            {mode === 'login'
              ? '扫码打开登录页，需要输入账号密码。'
              : '扫码后会自动把游客账号密码填好，点一下登录即可进入（只读）。'}
          </p>
        </div>
      </div>

      {mode === 'visitor' && (
        <VisitorBox visitor={visitor} reload={creds.reload} />
      )}

      <p className="text-[11.5px] mt-4 leading-5" style={{ color: 'var(--color-faint)' }}>
        本机打开时地址是 localhost，手机扫了打不开；要给别人扫就填公网地址或电脑的局域网 IP。
      </p>
    </div>
  )
}

function VisitorBox({
  visitor, reload
}: {
  visitor: { username: string; password: string | null } | null
  reload: () => void
}) {
  const [reveal, setReveal] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (newPw.trim().length < 6) { setMsg('至少 6 位'); return }
    setBusy(true); setMsg('')
    try {
      await api('/api/guest/visitor/password', { method: 'POST', body: { password: newPw.trim() } })
      reload()
      setNewPw('')
      setMsg('已更新，旧二维码作废')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 rounded-xl p-4" style={{ background: '#faf3e8', border: '1px dashed #e2d3bd' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px]" style={{ color: '#7d6653' }}>游客账号</span>
        <code className="text-[12px] px-2 py-1 rounded" style={{ background: '#fffdf8' }}>{visitor?.username || 'visitor'}</code>
        <span className="text-[12.5px]" style={{ color: '#7d6653' }}>密码</span>
        <code className="text-[12px] px-2 py-1 rounded" style={{ background: '#fffdf8' }}>
          {visitor?.password ? (reveal ? visitor.password : '•'.repeat(Math.min(10, visitor.password.length))) : '未设置'}
        </code>
        {visitor?.password && (
          <button className="btn btn-sm" onClick={() => setReveal((v) => !v)}>{reveal ? '隐藏' : '显示'}</button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <input
          className="input h-8 text-[12.5px]"
          style={{ maxWidth: 220 }}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder={visitor?.password ? '输入新密码可重置' : '给游客设一个密码（至少 6 位）'}
        />
        <button className="btn btn-sm" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存密码'}</button>
        {msg && <span className="text-[11.5px]" style={{ color: '#a04435' }}>{msg}</span>}
      </div>

      <p className="text-[11px] mt-2 leading-5" style={{ color: '#a3806a' }}>
        这个二维码里带着密码，谁扫到都能以游客（只读）身份进入，别发到公开的地方。<br />
        游客每成功登录一次，密码就会自动换新，旧二维码立刻失效；这个页面会自动刷新出新的。
      </p>
    </div>
  )
}
