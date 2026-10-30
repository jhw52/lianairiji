import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from '../components/Icon'

const isLocal = (u: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(u)

export function QrEntry() {
  const origin = window.location.origin
  const [url, setUrl] = useState(() => (isLocal(origin) ? '' : `${origin}/login`))
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!url.trim()) { setDataUrl(''); return }
    let alive = true
    QRCode.toDataURL(url.trim(), {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3f342a', light: '#fffdf8' }
    })
      .then((d) => { if (alive) { setDataUrl(d); setErr('') } })
      .catch(() => { if (alive) { setDataUrl(''); setErr('这串地址二维码识别不了') } })
    return () => { alive = false }
  }, [url])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('复制这个地址', url)
    }
  }

  const download = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = '我们的入口二维码.png'
    a.click()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div
          className="rounded-2xl p-3 shrink-0 grid place-items-center"
          style={{ background: '#fffdf8', border: '1px solid var(--color-line)', width: 214, height: 214 }}
        >
          {dataUrl
            ? <img src={dataUrl} alt="网站二维码" width={188} height={188} style={{ display: 'block', borderRadius: 8 }} />
            : <span className="text-[12px] px-4 text-center leading-5" style={{ color: 'var(--color-faint)' }}>
                填好下面的地址<br />二维码会出现
              </span>}
        </div>

        <div className="flex-1 min-w-0">
          <label className="label">二维码要打开的地址</label>
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://8.148.205.121/login"
          />
          {err && <p className="text-[11.5px] mt-1.5" style={{ color: '#a04435' }}>{err}</p>}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button className="btn btn-sm" onClick={copy} disabled={!url}>
              <Icon name="check" size={13} /> {copied ? '已复制' : '复制地址'}
            </button>
            <button className="btn btn-sm" onClick={download} disabled={!dataUrl}>下载二维码</button>
            <button className="btn btn-sm" onClick={() => setUrl(`${origin}/login`)}>用当前地址</button>
          </div>

          <p className="text-[11.5px] mt-3 leading-5" style={{ color: 'var(--color-faint)' }}>
            本机打开时地址是 localhost，手机扫了打不开。要给别人扫，填公网地址
            （如 <span className="num">http://8.148.205.121/login</span>）或你电脑的局域网 IP。
          </p>
        </div>
      </div>
    </div>
  )
}
