import { useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useModuleNotice } from '../lib/unread'
import { useApi } from '../lib/session'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'
import { fmtDate, todayStr } from '../lib/utils'
import { showNotice } from '../lib/notice'
import { nextOccurrence, occurrenceInMonth, RECURRING_LABEL } from '../lib/events'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const FLOW: Record<string, string> = { light: '少', normal: '正常', heavy: '多' }
const SYMPTOMS = ['腹痛', '腰酸', '头痛', '乏力', '情绪波动', '胸胀', '贪睡', '长痘']
const PROTECTION: Record<string, string> = { yes: '有', no: '无', unknown: '未记录' }
const PATTERNS = ['亲密', '爱爱', '其他']
const ICONS = ['💗', '🎂', '💍', '🌷', '✈️', '🏖️', '🎄', '🍰', '✨', '📌']

type Mode = 'cycle' | 'event'

function monthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  return monthStr(new Date(y, m - 1 + delta, 1))
}
function dayStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function nextDay(day: string) {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return dayStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
function isInCycle(c: any, day: string, today: string) {
  const end = c.endDate || (c.startDate <= today ? today : c.startDate)
  return c.startDate <= day && day <= end
}

export function CalendarPage() {
  useModuleNotice('calendar')
  const [month, setMonth] = useState(monthStr())
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('calendar.mode.v2') === 'cycle' ? 'cycle' : 'event'))
  const [showIntimacy, setShowIntimacy] = useState(false)
  const taps = useRef({ n: 0, at: 0 })

  // 连点三下「今天」才显示亲密记录；跳转延后一点，免得抽屉挡住后续点击
  const tapTimer = useRef<any>(null)
  const onTodayTap = () => {
    const now = Date.now()
    taps.current = now - taps.current.at <= 900 ? { n: taps.current.n + 1, at: now } : { n: 1, at: now }
    clearTimeout(tapTimer.current)
    if (taps.current.n >= 3) {
      taps.current = { n: 0, at: 0 }
      if (!showIntimacy) {
        setShowIntimacy(true)
        showNotice('亲密记录已显示')
      }
      return
    }
    tapTimer.current = setTimeout(() => {
      setMonth(monthStr())
      setSelected(today)
    }, 320)
  }
  const { data, loading, reload } = useApi<any>(`/api/calendar?month=${month}`)
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<null | { type: 'cycle' | 'intimacy' | 'event'; record?: any; date?: string }>(null)

  const today = todayStr()
  const summary = data?.summary
  const [y, m] = month.split('-').map(Number)

  const switchMode = (next: Mode) => {
    setMode(next)
    localStorage.setItem('calendar.mode.v2', next)
    setSelected(null)
  }

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1)
    const offset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(y, m, 0).getDate()
    const out: Array<{ day: string; inMonth: boolean; n: number }> = []
    for (let i = 0; i < offset; i++) {
      const d = new Date(y, m - 1, i - offset + 1)
      out.push({ day: dayStr(d.getFullYear(), d.getMonth() + 1, d.getDate()), inMonth: false, n: d.getDate() })
    }
    for (let d = 1; d <= daysInMonth; d++) out.push({ day: dayStr(y, m, d), inMonth: true, n: d })
    while (out.length % 7 !== 0) {
      const d = new Date(y, m - 1, out.length - offset + 1)
      out.push({ day: dayStr(d.getFullYear(), d.getMonth() + 1, d.getDate()), inMonth: false, n: d.getDate() })
    }
    return out
  }, [y, m])

  const cycleMaps = useMemo(() => {
    const periods = new Map<string, { pos: string; id: string }>()
    const intimacy = new Map<string, number>()
    for (const c of data?.cycles || []) {
      const end = c.endDate || (c.startDate <= today ? today : c.startDate)
      let cur = c.startDate
      let guard = 0
      while (cur <= end && guard++ < 400) {
        const pos = c.startDate === end ? 'single' : cur === c.startDate ? 'start' : cur === end ? 'end' : 'mid'
        periods.set(cur, { pos, id: c.id })
        cur = nextDay(cur)
      }
    }
    for (const r of data?.intimacy || []) intimacy.set(r.date, (intimacy.get(r.date) || 0) + 1)
    return { periods, intimacy }
  }, [data, today])

  const eventMap = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const a of data?.anniversaries || []) {
      const key = occurrenceInMonth(a, y, m)
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [data, y, m])

  const upcoming = useMemo(() => {
    return (data?.anniversaries || [])
      .map((a: any) => ({ ...a, occ: nextOccurrence(a) }))
      .filter((a: any) => !a.occ.past)
      .sort((x: any, y2: any) => x.occ.days - y2.occ.days)
      .slice(0, 5)
  }, [data])

  const predicted = useMemo(() => {
    const set = new Set<string>()
    if (summary?.nextStart) {
      let cur = summary.nextStart
      const end = summary.nextEnd || summary.nextStart
      let guard = 0
      while (cur <= end && guard++ < 30) { set.add(cur); cur = nextDay(cur) }
    }
    return set
  }, [summary])

  const fertile = useMemo(() => {
    const set = new Set<string>()
    if (summary?.fertileFrom && summary?.fertileTo) {
      let cur = summary.fertileFrom
      while (cur <= summary.fertileTo) { set.add(cur); cur = nextDay(cur) }
    }
    return set
  }, [summary])

  const dayCycles = useMemo(
    () => (selected ? (data?.cycles || []).filter((c: any) => isInCycle(c, selected, today)) : []),
    [selected, data, today]
  )
  const dayIntimacy = useMemo(
    () => (selected ? (data?.intimacy || []).filter((r: any) => r.date === selected) : []),
    [selected, data]
  )
  const dayEvents = useMemo(() => (selected ? (eventMap.get(selected) || []) : []), [selected, eventMap])

  const monthEvents = useMemo(() => {
    const out: any[] = []
    for (const [day, list] of eventMap) for (const a of list) out.push({ ...a, day })
    return out.sort((x, y) => x.day.localeCompare(y.day))
  }, [eventMap])

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>日历</h1>
            <div className="tabs">
              <button className="tab" data-active={mode === 'event'} onClick={() => switchMode('event')}>大事记</button>
              <button className="tab" data-active={mode === 'cycle'} onClick={() => switchMode('cycle')}>{showIntimacy ? '经期 · 亲密' : '经期'}</button>
            </div>
          </div>
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
            {mode === 'cycle'
              ? (showIntimacy ? '记录经期与亲密，日历上只留不刺眼的标记' : '记录经期，日历上只留不刺眼的标记')
              : '纪念日与重要事件，点某一天就能记下来'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="上个月"><Icon name="left" size={15} /></button>
          <div className="num text-[16px] px-2 min-w-[110px] text-center">{y} 年 {m} 月</div>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="下个月"><Icon name="right" size={15} /></button>
          <button className="btn btn-sm" onClick={onTodayTap}>今天</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="card p-4 md:p-5">
          <div className="grid grid-cols-7 mb-1">
            {WEEK.map((w) => (
              <div key={w} className="text-center text-[12px] py-1.5" style={{ color: 'var(--color-faint)' }}>周{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((c) => {
              const p = mode === 'cycle' ? cycleMaps.periods.get(c.day) : undefined
              const inti = mode === 'cycle' ? (cycleMaps.intimacy.get(c.day) || 0) : 0
              const evs = mode === 'event' ? (eventMap.get(c.day) || []) : []
              const isToday = c.day === today
              const isPred = mode === 'cycle' && predicted.has(c.day)
              const isFert = mode === 'cycle' && fertile.has(c.day) && !p
              return (
                <button
                  key={c.day}
                  onClick={() => setSelected(c.day)}
                  className="cal-cell"
                  data-today={isToday || undefined}
                  data-period={p ? p.pos : undefined}
                  data-pred={isPred || undefined}
                  data-fert={isFert || undefined}
                  data-event={evs.length ? 'on' : undefined}
                  data-selected={selected === c.day || undefined}
                  style={{ opacity: c.inMonth ? 1 : 0.35 }}
                >
                  <span className="cal-num">{c.n}</span>
                  <span className="cal-marks">
                    {mode === 'event'
                      ? evs.slice(0, 2).map((a: any) => (
                        <span key={a.id} className="text-[14px] leading-none">{a.icon || '💗'}</span>
                      ))
                      : showIntimacy && inti > 0 && <span className="cal-dot" />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 text-[11.5px]" style={{ borderTop: '1px dashed var(--color-line)', color: 'var(--color-muted)' }}>
            {mode === 'cycle' ? (
              <>
                <Legend color="#f3ddd9" border="#e2b9b1" label="经期" />
                <Legend color="#fdf6ea" border="#dcc9ae" label="预计" dashed />
                <Legend color="#f3f1e9" border="transparent" label="易孕期" />
                {showIntimacy && (
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c0705f' }} />亲密</span>
                )}
              </>
            ) : (
              <>
                <Legend color="#fbf1ea" border="#eddcd1" label="有事件的日子" />
                <span className="flex items-center gap-1.5">💗 图标就是事件</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {mode === 'cycle' ? (
            <>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px]" style={{ fontFamily: 'var(--font-serif)' }}>经期预测</h3>
                  <span className="chip" style={{ height: 22 }}>
                    {summary?.reliability === 'good' ? '数据充足' : summary?.reliability === 'fair' ? '样本偏少' : '数据不足'}
                  </span>
                </div>
                {loading ? <div className="skeleton h-24 rounded-lg" /> : summary?.nextStart ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="num text-[30px]">{summary.daysUntilNext}</span>
                      <span className="text-[13px]" style={{ color: 'var(--color-muted)' }}>天后预计开始</span>
                    </div>
                    <div className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
                      {fmtDate(summary.nextStart)} ~ {fmtDate(summary.nextEnd)}
                    </div>
                    {summary.ongoing && (
                      <div className="mt-3 text-[12.5px]" style={{ color: '#a85c4d' }}>
                        正在经期 · 第 {summary.ongoing.day} 天
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-4 text-[12px]" style={{ color: 'var(--color-muted)' }}>
                      <span>平均周期 <b className="num" style={{ color: 'var(--color-ink)' }}>{summary.avgCycle}</b> 天</span>
                      <span>经期 <b className="num" style={{ color: 'var(--color-ink)' }}>{summary.avgPeriod}</b> 天</span>
                      <span>最短 <b className="num" style={{ color: 'var(--color-ink)' }}>{summary.minCycle ?? '—'}</b></span>
                      <span>最长 <b className="num" style={{ color: 'var(--color-ink)' }}>{summary.maxCycle ?? '—'}</b></span>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] leading-6" style={{ color: 'var(--color-muted)' }}>记录第一次经期后，这里会出现预测。</p>
                )}
              </div>

              <div className="card p-5">
                <h3 className="text-[15px] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>快速记录</h3>
                <div className="flex flex-col gap-2">
                  <button className="btn justify-start write-only" onClick={() => setForm({ type: 'cycle', date: selected || today })}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#c0705f' }} /> 记经期
                  </button>
                  {showIntimacy && (
                    <button className="btn justify-start write-only" onClick={() => setForm({ type: 'intimacy', date: selected || today })}>
                      <span className="w-2 h-2 rounded-full" style={{ background: '#c9a227' }} /> 记亲密
                    </button>
                  )}
                </div>
                <p className="text-[11px] mt-4 leading-5" style={{ color: 'var(--color-faint)' }}>
                  {summary?.disclaimer || '预测基于历史数据，仅供参考，不能作为避孕或医疗依据'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px]" style={{ fontFamily: 'var(--font-serif)' }}>即将到来</h3>
                  <button className="btn btn-sm write-only" onClick={() => setForm({ type: 'event', date: selected || today })}>
                    <Icon name="plus" size={13} /> 事件
                  </button>
                </div>
                {upcoming.length === 0 ? (
                  <p className="text-[13px] leading-6" style={{ color: 'var(--color-muted)' }}>
                    还没有事件。点某一天，或点右上角「+ 事件」，把值得记住的日子放进来。
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {upcoming.map((a: any) => (
                      <button key={a.id} className="rec-item write-only" onClick={() => setForm({ type: 'event', record: a })}>
                        <span className="text-[15px]">{a.icon || '💗'}</span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block truncate text-[13px]">{a.title}</span>
                          <span className="block text-[11px]" style={{ color: 'var(--color-faint)' }}>
                            {fmtDate(a.date)} · {RECURRING_LABEL[a.recurring] || '每年'}
                          </span>
                        </span>
                        <span className="num text-[13px] shrink-0" style={{ color: '#a85c4d' }}>
                          {a.occ.days === 0 ? '今天' : `${a.occ.days} 天`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px]" style={{ fontFamily: 'var(--font-serif)' }}>这个月</h3>
                  <span className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>{monthEvents.length} 个</span>
                </div>
                {monthEvents.length === 0 ? (
                  <p className="text-[13px] leading-6" style={{ color: 'var(--color-muted)' }}>这个月还没有安排。</p>
                ) : (
                  <div className="space-y-2">
                    {monthEvents.slice(0, 6).map((a: any) => (
                      <div key={a.id + a.day} className="flex items-center gap-2.5 text-[12.5px]">
                        <span className="num w-[46px] shrink-0" style={{ color: '#a85c4d' }}>{Number(a.day.slice(8, 10))} 日</span>
                        <span className="truncate">{a.icon || '💗'} {a.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selected && mode === 'cycle' && (
        <CycleDrawer
          date={selected}
          cycles={dayCycles}
          intimacy={dayIntimacy}
          showIntimacy={showIntimacy}
          onClose={() => setSelected(null)}
          onAdd={(type) => setForm({ type, date: selected })}
          onEdit={(type, record) => setForm({ type, record })}
        />
      )}

      {selected && mode === 'event' && (
        <EventDrawer
          date={selected}
          events={dayEvents}
          onClose={() => setSelected(null)}
          onAdd={() => setForm({ type: 'event', date: selected })}
          onEdit={(record) => setForm({ type: 'event', record })}
        />
      )}

      {form?.type === 'cycle' && (
        <CycleForm initial={form.record} date={form.date} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
      )}
      {form?.type === 'intimacy' && (
        <IntimacyForm initial={form.record} date={form.date} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
      )}
      {form?.type === 'event' && (
        <EventForm initial={form.record} date={form.date} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
      )}
    </div>
  )
}

function Legend({ color, border, label, dashed }: { color: string; border: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-[4px]" style={{ background: color, border: `1px ${dashed ? 'dashed' : 'solid'} ${border}` }} />
      {label}
    </span>
  )
}

function DrawerShell({ date, onClose, children }: { date: string; onClose: () => void; children: React.ReactNode }) {
  const d = new Date(date + 'T00:00:00')
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <div className="day-drawer">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[19px]" style={{ fontFamily: 'var(--font-serif)' }}>{fmtDate(date)}</div>
            <div className="text-[12px]" style={{ color: 'var(--color-faint)' }}>周{wd}</div>
          </div>
          <button className="btn-ghost p-1.5 rounded-md" onClick={onClose} aria-label="关闭"><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

function CycleDrawer({
  date, cycles, intimacy, showIntimacy, onClose, onAdd, onEdit
}: {
  date: string
  cycles: any[]
  intimacy: any[]
  showIntimacy: boolean
  onClose: () => void
  onAdd: (t: 'cycle' | 'intimacy') => void
  onEdit: (t: 'cycle' | 'intimacy', r: any) => void
}) {
  return (
    <DrawerShell date={date} onClose={onClose}>
      <div className="space-y-2.5">
        {cycles.map((c: any) => (
          <button key={c.id} className="rec-item" onClick={() => onEdit('cycle', c)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#c0705f' }} />
            <span className="flex-1 text-left">
              经期 · {FLOW[c.flow] || '未记录'}流量
              {c.endDate ? `（${c.endDate.slice(5)} 结束）` : '（进行中）'}
            </span>
            <Icon name="edit" size={14} className="opacity-40" />
          </button>
        ))}
        {(showIntimacy ? intimacy : []).map((r: any) => (
          <button key={r.id} className="rec-item" onClick={() => onEdit('intimacy', r)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#c9a227' }} />
            <span className="flex-1 text-left">
              亲密 {r.time || ''} {r.types?.length ? `· ${r.types.join(' / ')}` : ''}
            </span>
            <Icon name="edit" size={14} className="opacity-40" />
          </button>
        ))}
        {!cycles.length && (!showIntimacy || !intimacy.length) && (
          <p className="text-[13px] py-6 text-center" style={{ color: 'var(--color-faint)' }}>这一天还没有记录</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-5 write-only">
        <button className="btn" onClick={() => onAdd('cycle')}>记经期</button>
        {showIntimacy && <button className="btn" onClick={() => onAdd('intimacy')}>记亲密</button>}
      </div>
    </DrawerShell>
  )
}

function EventDrawer({
  date, events, onClose, onAdd, onEdit
}: {
  date: string
  events: any[]
  onClose: () => void
  onAdd: () => void
  onEdit: (r: any) => void
}) {
  return (
    <DrawerShell date={date} onClose={onClose}>
      <div className="space-y-2.5">
        {events.map((a: any) => (
          <button key={a.id} className="rec-item" onClick={() => onEdit(a)}>
            <span className="text-[15px]">{a.icon || '💗'}</span>
            <span className="flex-1 min-w-0 text-left">
              <span className="block truncate">{a.title}</span>
              <span className="block text-[11px]" style={{ color: 'var(--color-faint)' }}>
                {RECURRING_LABEL[a.recurring] || '每年'}{a.note ? ` · ${a.note}` : ''}
              </span>
            </span>
            <Icon name="edit" size={14} className="opacity-40" />
          </button>
        ))}
        {!events.length && (
          <p className="text-[13px] py-6 text-center" style={{ color: 'var(--color-faint)' }}>这一天还没有事件</p>
        )}
      </div>
      <button className="btn btn-primary w-full mt-5 write-only" onClick={onAdd}>
        <Icon name="plus" size={15} /> 在这一天新增事件
      </button>
    </DrawerShell>
  )
}

function CycleForm({ initial, date, onClose, onSaved }: { initial?: any; date?: string; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState(initial?.startDate || date || todayStr())
  const [end, setEnd] = useState(initial?.endDate || '')
  const [flow, setFlow] = useState(initial?.flow || 'normal')
  const [symptoms, setSymptoms] = useState<string[]>(initial?.symptoms || [])
  const [note, setNote] = useState(initial?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (s: string) => setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = { startDate: start, endDate: end || null, flow, symptoms, note, rev: initial?.rev }
      if (initial) await api(`/api/cycles/${initial.id}`, { method: 'PATCH', body })
      else await api('/api/cycles', { method: 'POST', body })
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('删除这条经期记录？')) return
    await api(`/api/cycles/${initial.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <Modal title={initial ? '编辑经期' : '记经期'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">开始日期</label>
          <DateField value={start} onChange={setStart} />
        </div>
        <div>
          <label className="label">结束日期（留空 = 进行中）</label>
          <DateField value={end} onChange={setEnd} />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">流量</label>
        <div className="flex gap-2">
          {Object.entries(FLOW).map(([k, label]) => (
            <button key={k} className="btn btn-sm"
              style={flow === k ? { background: '#c0705f', color: '#fff', borderColor: '#c0705f' } : undefined}
              onClick={() => setFlow(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="label">症状</label>
        <div className="flex flex-wrap gap-2">
          {SYMPTOMS.map((s) => (
            <button key={s} className="chip"
              style={symptoms.includes(s) ? { background: '#f3e0da', borderColor: '#d9b3a8', color: '#a85c4d' } : undefined}
              onClick={() => toggle(s)}>{s}</button>
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

function IntimacyForm({ initial, date, onClose, onSaved }: { initial?: any; date?: string; onClose: () => void; onSaved: () => void }) {
  const [day, setDay] = useState(initial?.date || date || todayStr())
  const [time, setTime] = useState(initial?.time || '22:00')
  const [types, setTypes] = useState<string[]>(initial?.types || ['亲密'])
  const [protection, setProtection] = useState(initial?.protection || 'unknown')
  const [mood, setMood] = useState(initial?.mood || '')
  const [note, setNote] = useState(initial?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (t: string) => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = { date: day, time, types, protection, mood, note, rev: initial?.rev }
      if (initial) await api(`/api/intimacy/${initial.id}`, { method: 'PATCH', body })
      else await api('/api/intimacy', { method: 'POST', body })
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('删除这条记录？')) return
    await api(`/api/intimacy/${initial.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <Modal title={initial ? '编辑亲密记录' : '记亲密'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">日期</label>
          <DateField value={day} onChange={setDay} />
        </div>
        <div>
          <label className="label">时间</label>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">类型</label>
        <div className="flex flex-wrap gap-2">
          {PATTERNS.map((t) => (
            <button key={t} className="chip"
              style={types.includes(t) ? { background: '#f3e0da', borderColor: '#d9b3a8', color: '#a85c4d' } : undefined}
              onClick={() => toggle(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="label">防护</label>
        <div className="flex gap-2">
          {Object.entries(PROTECTION).map(([k, label]) => (
            <button key={k} className="btn btn-sm"
              style={protection === k ? { background: '#c0705f', color: '#fff', borderColor: '#c0705f' } : undefined}
              onClick={() => setProtection(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label className="label">心情</label>
          <input className="input" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="可留空" />
        </div>
        <div>
          <label className="label">备注</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
        </div>
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

function EventForm({ initial, date, onClose, onSaved }: { initial?: any; date?: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [day, setDay] = useState(initial?.date || date || todayStr())
  const [recurring, setRecurring] = useState(initial?.recurring || 'once')
  const [icon, setIcon] = useState(initial?.icon || '✨')
  const [note, setNote] = useState(initial?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) return setErr('写个名字吧')
    setBusy(true); setErr('')
    try {
      const body = { title: title.trim(), date: day, recurring, icon, note, kind: 'event', rev: initial?.rev }
      if (initial) await api(`/api/anniversaries/${initial.id}`, { method: 'PATCH', body })
      else await api('/api/anniversaries', { method: 'POST', body })
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('删除这个事件？')) return
    await api(`/api/anniversaries/${initial.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <Modal title={initial ? '编辑事件' : '新增事件'} onClose={onClose}>
      <label className="label">名字</label>
      <input className="input mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如：第一次约会、领证那天" autoFocus />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">日期</label>
          <DateField value={day} onChange={setDay} />
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
