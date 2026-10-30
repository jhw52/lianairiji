/**
 * 经期预测：全部使用 UTC 日期做整数运算，避免时区导致的跨天误差。
 */

export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function isDay(s) {
  const t = parseDay(s)
  if (Number.isNaN(t)) return false
  const d = new Date(t)
  return d.getUTCFullYear() === Number(String(s).slice(0, 4))
}

export function fmtDay(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

export function addDays(day, n) {
  const t = parseDay(day)
  if (Number.isNaN(t)) return day
  return fmtDay(t + n * 86400000)
}

export function daysBetween(a, b) {
  const ta = parseDay(a)
  const tb = parseDay(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN
  return Math.round((tb - ta) / 86400000)
}

export function median(arr) {
  const xs = [...arr].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!xs.length) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

export function stddev(arr) {
  const xs = arr.filter((n) => Number.isFinite(n))
  if (xs.length < 2) return null
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

const DEFAULT_CYCLE = 28
const DEFAULT_PERIOD = 5
const MIN_GAP = 15
const MAX_GAP = 60

/**
 * @param {Array<{start_date:string,end_date?:string|null}>} records
 * @param {string} today YYYY-MM-DD
 */
export function computeCycleSummary(records = [], today = fmtDay(Date.now())) {
  const list = records
    .filter((r) => isDay(r.start_date))
    .sort((a, b) => parseDay(a.start_date) - parseDay(b.start_date))

  // 已结束的经期长度（进行中的不参与）
  const lengths = list
    .filter((r) => r.end_date && isDay(r.end_date) && daysBetween(r.start_date, r.end_date) >= 0)
    .slice(-6)
    .map((r) => daysBetween(r.start_date, r.end_date) + 1)

  // 相邻两次开始日期的间隔
  const gaps = []
  for (let i = 1; i < list.length; i++) {
    const gap = daysBetween(list[i - 1].start_date, list[i].start_date)
    if (gap >= MIN_GAP && gap <= MAX_GAP) gaps.push(gap)
  }
  const recentGaps = gaps.slice(-6)

  const avgCycle = recentGaps.length ? median(recentGaps) : DEFAULT_CYCLE
  const avgPeriod = lengths.length ? median(lengths) : DEFAULT_PERIOD
  const sd = stddev(recentGaps)

  const last = list[list.length - 1] || null
  const ongoing = list.find((r) => !r.end_date && r.start_date <= today) || null

  const nextStart = last ? addDays(last.start_date, avgCycle) : null
  const nextEnd = nextStart ? addDays(nextStart, Math.max(1, Math.round(avgPeriod)) - 1) : null
  const ovulation = nextStart ? addDays(nextStart, -14) : null
  const fertileFrom = ovulation ? addDays(ovulation, -5) : null
  const fertileTo = ovulation ? addDays(ovulation, 1) : null

  const cyclesRecorded = list.length
  const reliability = recentGaps.length >= 3 ? 'good' : recentGaps.length >= 2 ? 'fair' : 'low'

  return {
    count: cyclesRecorded,
    lastStart: last?.start_date || null,
    avgCycle: Math.round(avgCycle * 10) / 10,
    avgPeriod: Math.round(avgPeriod * 10) / 10,
    minCycle: recentGaps.length ? Math.min(...recentGaps) : null,
    maxCycle: recentGaps.length ? Math.max(...recentGaps) : null,
    sd: sd == null ? null : Math.round(sd * 10) / 10,
    nextStart,
    nextEnd,
    ovulation,
    fertileFrom,
    fertileTo,
    ongoing: ongoing ? { start: ongoing.start_date, day: daysBetween(ongoing.start_date, today) + 1 } : null,
    daysUntilNext: nextStart ? daysBetween(today, nextStart) : null,
    reliability,
    disclaimer: '预测基于历史数据，仅供参考，不能作为避孕或医疗依据'
  }
}

/** 判断某天是否落在某个经期区间内（进行中的延伸到今天） */
export function isInPeriod(record, day, today = fmtDay(Date.now())) {
  const s = record.start_date
  const e = record.end_date || (s <= today ? today : s)
  return s <= day && day <= e
}
