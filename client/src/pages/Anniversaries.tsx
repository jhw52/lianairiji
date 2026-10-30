import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useModuleNotice } from '../lib/unread'
import { useApi } from '../lib/session'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'
import { fmtDate, todayStr } from '../lib/utils'
import { nextOccurrence, RECURRING_LABEL } from '../lib/events'

export function Anniversaries() {
  useModuleNotice('anniversaries')
  const { data, loading, reload } = useApi<any>('/api/anniversaries')
  const [form, setForm] = useState<null | { record?: any }>(null)

  const list = useMemo(() => {
    const items = (data?.list || [])
      .filter((a: any) => a.kind !== 'event')
      .map((a: any) => {
        const occ = nextOccurrence(a)
        const label = occ.days === 0
          ? '就是今天'
          : occ.past
            ? `已经 ${-occ.days} 天`
            : `还有 ${occ.days} 天`
        return { ...a, occ: { ...occ, label, note: occ.years > 0 ? `第 ${occ.years} 年` : '' } }
      })
    return items.sort((x: any, y: any) => (x.occ.past ? 1 : 0) - (y.occ.past ? 1 : 0) || x.occ.days - y.occ.days)
  }, [data])

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>纪念日</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
            {list.length ? `共 ${list.length} 个日子` : '把重要的日子钉在这里'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> 新增
        </button>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="text-3xl mb-3">🎂</div>
          <h3 className="text-[18px]" style={{ fontFamily: 'var(--font-serif)' }}>还没有纪念日</h3>
          <p className="text-[13px] mt-2 mb-5" style={{ color: 'var(--color-muted)' }}>
            生日、在一起的那天、第一次见面……都值得被记住
          </p>
          <button className="btn btn-primary" onClick={() => setForm({})}>添加第一个</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((a: any) => {
            const hot = a.occ.days <= 7 && !a.occ.past
            return (
              <button
                key={a.id}
                onClick={() => setForm({ record: a })}
                className="card p-5 text-left relative overflow-hidden"
                style={hot ? { borderColor: '#e2b9b1', background: 'linear-gradient(140deg,#fffaf6,#fdf1ea)' } : undefined}
              >
                <div className="flex items-start justify-between">
                  <span className="text-[26px] leading-none">{a.icon || '💗'}</span>
                  <span className="chip" style={{ height: 22 }}>{RECURRING_LABEL[a.recurring] || '每年'}</span>
                </div>
                <div className="mt-4 text-[16px]" style={{ fontFamily: 'var(--font-serif)' }}>{a.title}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-faint)' }}>
                  {fmtDate(a.date)}{a.occ.note ? ` · ${a.occ.note}` : ''}
                </div>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="num text-[28px]" style={{ color: hot ? '#a85c4d' : '#4a4238' }}>
                    {a.occ.past ? -a.occ.days : a.occ.days}
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--color-muted)' }}>
                    {a.occ.past ? '天前' : a.occ.days === 0 ? '就是今天' : '天后'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {form && (
        <AnniversaryForm
          initial={form.record}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload() }}
        />
      )}
    </div>
  )
}

function AnniversaryForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [date, setDate] = useState(initial?.date || todayStr())
  const [recurring, setRecurring] = useState(initial?.recurring || 'yearly')
  const [icon, setIcon] = useState(initial?.icon || '💗')
  const [note, setNote] = useState(initial?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) return setErr('写个名字吧')
    setBusy(true); setErr('')
    try {
      const body = { title: title.trim(), date, recurring, icon, note, kind: initial?.kind || 'anniversary', rev: initial?.rev }
      if (initial) await api(`/api/anniversaries/${initial.id}`, { method: 'PATCH', body })
      else await api('/api/anniversaries', { method: 'POST', body })
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('删除这个纪念日？')) return
    await api(`/api/anniversaries/${initial.id}`, { method: 'DELETE' })
    onSaved()
  }

  const ICONS = ['💗', '🎂', '💍', '🌷', '🎄', '🏖️', '🍰', '✨']

  return (
    <Modal title={initial ? '编辑纪念日' : '新增纪念日'} onClose={onClose}>
      <label className="label">名字</label>
      <input className="input mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如：我们在一起的那天" autoFocus />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">日期</label>
          <DateField value={date} onChange={setDate} />
        </div>
        <div>
          <label className="label">重复</label>
          <select className="select" value={recurring} onChange={(e) => setRecurring(e.target.value)}>
            {Object.entries(RECURRING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="label">图标</label>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              className="w-9 h-9 rounded-lg grid place-items-center text-[17px]"
              style={{ background: icon === i ? '#f3e0da' : '#fffefa', border: `1px solid ${icon === i ? '#d9b3a8' : 'var(--color-line)'}` }}
              onClick={() => setIcon(i)}
            >{i}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="label">备注</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
      </div>

      {err && <div className="mt-3 text-[13px]" style={{ color: '#a04435' }}>{err}</div>}

      <div className="flex items-center justify-between mt-6">
        {initial ? <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={15} />删除</button> : <span />}
        <div className="flex gap-2">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </Modal>
  )
}
