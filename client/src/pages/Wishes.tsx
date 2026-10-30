import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useModuleNotice } from '../lib/unread'
import { useApi } from '../lib/session'
import { Icon } from '../components/Icon'

const CATEGORIES = ['旅行', '美食', '体验', '礼物', '其他']

export function Wishes() {
  useModuleNotice('wishes')
  const { data, loading, reload } = useApi<any>('/api/todos')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('体验')
  const [filter, setFilter] = useState('全部')
  const [busy, setBusy] = useState(false)

  const list = data?.list || []
  const doneCount = list.filter((t: any) => t.done).length
  const percent = list.length ? Math.round((doneCount / list.length) * 100) : 0

  const shown = useMemo(
    () => (filter === '全部' ? list : list.filter((t: any) => t.category === filter)),
    [list, filter]
  )

  const add = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await api('/api/todos', { method: 'POST', body: { title: title.trim(), category } })
      setTitle('')
      reload()
    } finally { setBusy(false) }
  }

  const toggle = async (t: any) => {
    await api(`/api/todos/${t.id}`, { method: 'PATCH', body: { done: !t.done, rev: t.rev } })
    reload()
  }

  const remove = async (t: any) => {
    if (!confirm('删掉这一条？')) return
    await api(`/api/todos/${t.id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="container-page max-w-[820px]">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>心愿清单</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
            想一起做的事，一件一件划掉
          </p>
        </div>
        <div className="text-right">
          <div className="num text-[22px]">{doneCount} / {list.length}</div>
          <div className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>已完成</div>
        </div>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mb-6" style={{ background: '#f0e6d6' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: 'linear-gradient(90deg,#d9a08f,#c0705f)' }} />
      </div>

      <div className="card p-4 mb-5 write-only">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="想一起做的事，比如：去看一次海"
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <select className="select shrink-0" style={{ width: 108 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary" onClick={add} disabled={busy || !title.trim()}>添加</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {['全部', ...CATEGORIES].map((c) => (
          <button key={c} className="tab" data-active={filter === c} onClick={() => setFilter(c)}
            style={{ padding: '5px 12px', background: filter === c ? '#fffdf8' : 'transparent', boxShadow: filter === c ? '0 1px 3px rgba(58,51,44,.08)' : undefined }}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">📝</div>
          <p className="text-[14px]" style={{ color: 'var(--color-muted)' }}>
            {filter === '全部' ? '还是一片空白，写下第一件想一起做的事吧' : `「${filter}」分类下还没有内容`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((t: any) => (
            <div key={t.id} className="card px-4 py-3 flex items-center gap-3 group">
              <button
                onClick={() => toggle(t)}
                className="w-[18px] h-[18px] rounded-full grid place-items-center shrink-0 transition-colors write-only"
                style={{
                  border: `1.5px solid ${t.done ? '#c0705f' : '#d5c8b6'}`,
                  background: t.done ? '#c0705f' : 'transparent',
                  color: '#fff'
                }}
                aria-label={t.done ? '取消完成' : '标记完成'}
              >
                {t.done && <Icon name="check" size={11} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] truncate" style={{
                  textDecoration: t.done ? 'line-through' : 'none',
                  color: t.done ? 'var(--color-faint)' : 'var(--color-ink)'
                }}>
                  {t.title}
                </div>
                {t.done && t.doneAt && (
                  <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>{t.doneAt.slice(0, 10)} 完成</div>
                )}
              </div>
              <span className="chip shrink-0" style={{ height: 22 }}>{t.category || '其他'}</span>
              <button
                className="opacity-0 group-hover:opacity-100 transition p-1 rounded write-only"
                onClick={() => remove(t)}
                style={{ color: '#b3a99b' }}
                title="删除"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
