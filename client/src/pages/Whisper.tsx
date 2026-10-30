import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/session'
import { Icon } from '../components/Icon'
import { fmtDateTime } from '../lib/utils'
import { avatarSrc } from '../lib/avatar'

export function Whisper() {
  const { data, loading, reload } = useApi<any>('/api/messages')
  const [text, setText] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const marked = useRef<Set<string>>(new Set())

  const list = data?.list || []

  useEffect(() => {
    const unread = list.filter((m: any) => !m.mine && !m.readAt && !marked.current.has(m.id)).map((m: any) => m.id)
    if (!unread.length) return
    unread.forEach((id: string) => marked.current.add(id))
    api('/api/messages/read', { method: 'POST', body: { ids: unread } }).catch(() => {})
  }, [list])

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await api('/api/messages', {
        method: 'POST',
        body: { content: text.trim(), visibility: isPrivate ? 'private' : 'public' }
      })
      setText('')
      reload()
    } finally { setBusy(false) }
  }

  const remove = async (m: any) => {
    if (!confirm('删掉这句话？')) return
    await api(`/api/messages/${m.id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="container-page max-w-[760px]">
      <div className="mb-6">
        <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>悄悄话</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
          有些话写在这里，对方打开就能看到
        </p>
      </div>

      <div className="card p-4 mb-6">
        <textarea
          className="textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="想对她说点什么？"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 4 }}
        />
        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px dashed var(--color-line)' }}>
          <label className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--color-muted)' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            只给自己看
          </label>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>⌘ + Enter 发送</span>
            <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || !text.trim()}>
              <Icon name="message" size={14} /> 发送
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">💌</div>
          <p className="text-[14px]" style={{ color: 'var(--color-muted)' }}>还没有悄悄话，写下第一句吧</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((m: any) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className="bubble max-w-[78%] rounded-2xl px-4 py-3 group relative"
                data-side={m.mine ? 'right' : 'left'}
                style={{
                  background: m.mine ? '#f7e4dd' : '#fffdf8',
                  border: `1px solid ${m.mine ? '#eccfc5' : 'var(--color-line)'}`,
                  borderBottomRightRadius: m.mine ? 6 : 16,
                  borderBottomLeftRadius: m.mine ? 16 : 6
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {avatarSrc(m.authorAvatar) && (
                    <img src={avatarSrc(m.authorAvatar)!} alt="" className="w-5 h-5 rounded-full object-cover" />
                  )}
                  <span className="text-[11.5px]" style={{ color: m.mine ? '#a85c4d' : '#8e9b7e' }}>
                    {m.mine ? '我' : m.authorName}
                  </span>
                  {m.visibility === 'private' && (
                    <span className="text-[10px] px-1.5 rounded" style={{ background: '#0000000a', color: 'var(--color-faint)' }}>仅自己</span>
                  )}
                </div>
                <div className="text-[14px] leading-6 whitespace-pre-wrap break-words" style={{ color: '#4a4238' }}>
                  {m.content}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10.5px]" style={{ color: 'var(--color-faint)' }}>{fmtDateTime(m.createdAt)}</span>
                  {m.mine && m.visibility === 'public' && (
                    <span className="text-[10.5px]" style={{ color: m.readAt ? '#8e9b7e' : 'var(--color-faint)' }}>
                      {m.readAt ? '已读' : '未读'}
                    </span>
                  )}
                </div>
                {m.mine && (
                  <button
                    className="absolute -top-2 -left-2 w-6 h-6 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition"
                    style={{ background: '#fffdf8', border: '1px solid var(--color-line)', color: '#b3a99b' }}
                    onClick={() => remove(m)}
                    title="删除"
                  >
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
