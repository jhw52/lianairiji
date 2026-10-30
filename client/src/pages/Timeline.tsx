import { useMemo, useState } from 'react'
import { api, uploadFiles } from '../lib/api'
import { useApi } from '../lib/session'
import { Icon } from '../components/Icon'
import { DateField } from '../components/DateField'
import { Markdown } from '../components/Markdown'
import { fmtDate, weekday, todayStr } from '../lib/utils'

export function Timeline() {
  const { data, loading, reload } = useApi<any>('/api/moments')
  const [editor, setEditor] = useState<null | { mode: 'new' | 'edit'; moment?: any }>(null)
  const moments = data?.moments || []

  const years = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const m of moments) {
      const y = String(m.date).slice(0, 4)
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(m)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [moments])

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 mb-7 flex-wrap">
        <div>
          <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>时间轴</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
            {moments.length} 条记录 · 从最近一天往回看
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditor({ mode: 'new' })}>
          <Icon name="plus" size={16} /> 写一条
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : moments.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="text-3xl mb-3">✍️</div>
          <h3 className="text-[18px]" style={{ fontFamily: 'var(--font-serif)' }}>第一条还空着</h3>
          <p className="text-[13px] mt-2 mb-5" style={{ color: 'var(--color-muted)' }}>
            第一次见面、第一次牵手、第一次吵架又和好——写下来，才不会被忘掉
          </p>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'new' })}>写下第一件事</button>
        </div>
      ) : (
        years.map(([year, list]) => (
          <section key={year} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="num text-[26px]" style={{ color: '#c3b19b' }}>{year}</span>
              <div className="hairline flex-1" />
            </div>
            <div className="relative pl-5 md:pl-7">
              <div className="absolute left-1.5 md:left-2.5 top-2 bottom-2 w-px" style={{ background: '#e9e0d1' }} />
              <div className="space-y-5">
                {list.map((m) => (
                  <MomentCard key={m.id} moment={m} onEdit={() => setEditor({ mode: 'edit', moment: m })} />
                ))}
              </div>
            </div>
          </section>
        ))
      )}

      {editor && (
        <MomentEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); reload() }}
        />
      )}
    </div>
  )
}

function MomentCard({ moment, onEdit }: { moment: any; onEdit: () => void }) {
  return (
    <article className="relative fade-up">
      <span
        className="absolute -left-[15px] md:-left-[19px] top-6 w-2.5 h-2.5 rounded-full"
        style={{ background: '#c0705f', boxShadow: '0 0 0 4px #faf6ef' }}
      />
      <div className="card p-5 md:p-6">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <span className="text-[12px]" style={{ color: 'var(--color-rose-deep)' }}>
            {fmtDate(moment.date)} · {weekday(moment.date)}
          </span>
          {moment.place && <span className="chip">{moment.place}</span>}
          {moment.mood && <span className="chip">{moment.mood}</span>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[18px] leading-snug" style={{ fontFamily: 'var(--font-serif)' }}>{moment.title}</h3>
          <button className="btn-ghost p-1.5 rounded-md shrink-0" style={{ color: '#b3a99b' }} onClick={onEdit} title="编辑">
            <Icon name="edit" size={15} />
          </button>
        </div>
        {moment.content && <Markdown text={moment.content} className="mt-2.5" />}
        {moment.photos?.length > 0 && (
          <div className={`mt-4 grid gap-2 ${moment.photos.length === 1 ? 'grid-cols-1 max-w-[420px]' : 'grid-cols-3'}`}>
            {moment.photos.map((p: any) => (
              <div key={p.id} className="photo-tile rounded-md" style={{ aspectRatio: p.width && p.height ? `${p.width}/${p.height}` : '1' }}>
                {p.thumb ? <img src={p.thumb} alt="" loading="lazy" />
                  : <div className="w-full h-full grid place-items-center" style={{ background: '#e6d6c2' }}><Icon name="play" size={18} /></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function MomentEditor({
  state, onClose, onSaved
}: {
  state: { mode: 'new' | 'edit'; moment?: any }
  onClose: () => void
  onSaved: () => void
}) {
  const m = state.moment
  const [date, setDate] = useState(m?.date || todayStr())
  const [title, setTitle] = useState(m?.title || '')
  const [content, setContent] = useState(m?.content || '')
  const [place, setPlace] = useState(m?.place || '')
  const [mood, setMood] = useState(m?.mood || '')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) return setErr('写个标题吧')
    setBusy(true)
    setErr('')
    try {
      let id = m?.id
      if (state.mode === 'new') {
        const d = await api('/api/moments', { method: 'POST', body: { date, title, content, place, mood } })
        id = d.moment.id
      } else {
        await api(`/api/moments/${id}`, {
          method: 'PATCH',
          body: { date, title, content, place, mood, rev: m.rev }
        })
      }
      if (files.length) {
        await uploadFiles(files, { momentId: id })
      }
      onSaved()
    } catch (e: any) {
      setErr(e.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('删除这条记录？')) return
    await api(`/api/moments/${m.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 md:p-8" style={{ background: 'rgba(26,22,18,.5)' }} onClick={onClose}>
      <div className="card max-w-[640px] mx-auto p-6 md:p-7 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[19px]" style={{ fontFamily: 'var(--font-serif)' }}>
            {state.mode === 'new' ? '写一条' : '编辑'}
          </h3>
          <button className="btn-ghost p-1.5 rounded-md" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">日期</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div>
            <label className="label">地点（可选）</label>
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="比如：杭州·西湖" />
          </div>
        </div>

        <label className="label">标题</label>
        <input className="input mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="今天发生了什么？" />

        <label className="label">正文（支持 Markdown）</label>
        <textarea
          className="textarea mb-3"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记下当时的天气、说过的话、心里的小情绪…"
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">心情（可选）</label>
            <input className="input" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="开心 / 温柔 / 有点想你" />
          </div>
          <div>
            <label className="label">配图（可选，最多 9 张）</label>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="input py-1.5 text-[12px]"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 9))}
            />
          </div>
        </div>

        {err && <div className="text-[13px] mb-3" style={{ color: '#a04435' }}>{err}</div>}

        <div className="flex items-center justify-between gap-2 pt-2">
          {state.mode === 'edit' ? (
            <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={15} />删除</button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
