const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function fmtDate(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtDateShort(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function weekday(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return WEEK[d.getDay()]
}

export function todayStr() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function dayKey(iso?: string | null) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function daysBetween(from: string, to = new Date()) {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

export function elapseParts(fromIso: string, now = new Date()) {
  // 只给日期（YYYY-MM-DD）时按本地零点解析，避免被当成 UTC 导致差 8 小时
  const start = new Date(fromIso.length === 10 ? `${fromIso}T00:00:00` : fromIso)
  const ms = Math.max(0, now.getTime() - start.getTime())
  const totalDays = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return { totalDays, hours, minutes, seconds }
}

export interface DayGroup<T> {
  day: string
  items: T[]
}

export function groupByDay<T extends { day: string }>(items: T[]): DayGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = it.day || '未知日期'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(it)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => ({ day, items: list }))
}

export function bytes(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}
