export interface AnnivLike {
  id: string
  title: string
  date: string
  recurring: string
  icon?: string | null
  note?: string | null
  kind?: string | null
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function dayStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function toDayKey(d: Date) {
  return dayStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** 下一次发生的时间与相距天数（过去的「仅一次」返回负数） */
export function nextOccurrence(a: AnnivLike, today = startOfToday()) {
  const [y, m, d] = String(a.date).split('-').map(Number)
  if (a.recurring === 'once') {
    const t = new Date(y, m - 1, d)
    const days = Math.round((t.getTime() - today.getTime()) / 86400000)
    return { t, days, past: days < 0, years: 0 }
  }
  if (a.recurring === 'monthly') {
    let t = new Date(today.getFullYear(), today.getMonth(), d)
    if (t.getTime() < today.getTime()) t = new Date(today.getFullYear(), today.getMonth() + 1, d)
    return { t, days: Math.round((t.getTime() - today.getTime()) / 86400000), past: false, years: 0 }
  }
  let t = new Date(today.getFullYear(), m - 1, d)
  if (t.getTime() < today.getTime()) t = new Date(today.getFullYear() + 1, m - 1, d)
  return {
    t,
    days: Math.round((t.getTime() - today.getTime()) / 86400000),
    past: false,
    years: t.getFullYear() - y
  }
}

/** 这个事件在指定年月里落在哪一天（不在这个月返回 null） */
export function occurrenceInMonth(a: AnnivLike, y: number, m: number): string | null {
  const [ay, am, ad] = String(a.date).split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  if (a.recurring === 'yearly') return am === m ? dayStr(y, m, Math.min(ad, lastDay)) : null
  if (a.recurring === 'monthly') return ad <= lastDay ? dayStr(y, m, ad) : null
  return ay === y && am === m ? a.date : null
}

export const RECURRING_LABEL: Record<string, string> = {
  yearly: '每年',
  monthly: '每月',
  once: '仅一次'
}
