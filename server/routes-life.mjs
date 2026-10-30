import express from 'express'
import { all, get, run, tx, nowIso, today } from './db.mjs'
import { authRequired } from './auth.mjs'
import { broadcast } from './events.mjs'
import { computeCycleSummary, isDay, daysBetween, fmtDay } from './predict.mjs'

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const ok = (res, data) => res.json({ data })
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } })

const jsonArr = (s) => {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

const cycleOut = (r) => ({
  id: r.id, startDate: r.start_date, endDate: r.end_date, flow: r.flow,
  symptoms: jsonArr(r.symptoms), note: r.note, rev: r.rev, createdAt: r.created_at
})
const intimacyOut = (r) => ({
  id: r.id, date: r.date, time: r.time, types: jsonArr(r.types),
  protection: r.protection, mood: r.mood, note: r.note, rev: r.rev
})
const annivOut = (r) => ({
  id: r.id, title: r.title, date: r.date, recurring: r.recurring,
  icon: r.icon, note: r.note, kind: r.kind || 'anniversary', rev: r.rev
})
const todoOut = (r) => ({
  id: r.id, title: r.title, done: !!r.done, doneAt: r.done_at,
  category: r.category, sort: r.sort, rev: r.rev
})

function cycleOverlap(start, end, excludeId) {
  const e = end || start
  return all(`SELECT * FROM cycle_records WHERE id != ?`, excludeId || '').find((r) => {
    const rs = r.start_date
    const re = r.end_date || r.start_date
    return !(re < start || rs > e)
  })
}

export function registerLifeRoutes(app) {
  const r = express.Router()
  r.use(authRequired)

  // ---------------- 日历聚合 ----------------
  r.get('/calendar', h(async (req, res) => {
    const month = String(req.query.month || today().slice(0, 7))
    if (!/^\d{4}-\d{2}$/.test(month)) return fail(res, 400, 'VALIDATION', '月份格式应为 YYYY-MM')
    const cycles = all(`SELECT * FROM cycle_records ORDER BY start_date ASC`)
    const intimacy = all(`SELECT * FROM intimacy_records WHERE date LIKE ? ORDER BY date ASC`, `${month}%`)
    const anniversaries = all(`SELECT * FROM anniversaries ORDER BY date ASC`)
    const summary = computeCycleSummary(cycles, today())
    ok(res, {
      month,
      today: today(),
      cycles: cycles.map(cycleOut),
      intimacy: intimacy.map(intimacyOut),
      anniversaries: anniversaries.map(annivOut),
      summary
    })
  }))

  // ---------------- 经期 ----------------
  r.get('/cycles', h(async (req, res) => {
    ok(res, { cycles: all(`SELECT * FROM cycle_records ORDER BY start_date DESC`).map(cycleOut) })
  }))

  r.get('/cycles/summary', h(async (req, res) => {
    const cycles = all(`SELECT * FROM cycle_records ORDER BY start_date ASC`)
    ok(res, { summary: computeCycleSummary(cycles, today()) })
  }))

  r.post('/cycles', h(async (req, res) => {
    const start = String(req.body?.startDate || '')
    const end = req.body?.endDate ? String(req.body.endDate) : null
    if (!isDay(start)) return fail(res, 400, 'VALIDATION', '开始日期不正确')
    if (end && (!isDay(end) || end < start)) return fail(res, 400, 'VALIDATION', '结束日期不能早于开始日期')
    if (cycleOverlap(start, end)) return fail(res, 409, 'CONFLICT', '这段时间已经有经期记录了')

    const flow = ['light', 'normal', 'heavy'].includes(req.body?.flow) ? req.body.flow : null
    const symptoms = Array.isArray(req.body?.symptoms) ? req.body.symptoms.slice(0, 12) : []
    const id = crypto.randomUUID()
    const ts = nowIso()
    run(`INSERT INTO cycle_records(id, start_date, end_date, flow, symptoms, note, created_by, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      id, start, end, flow, JSON.stringify(symptoms), String(req.body?.note || '').slice(0, 200),
      req.user.id, ts, ts)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { cycle: cycleOut(get(`SELECT * FROM cycle_records WHERE id = ?`, id)) })
  }))

  r.patch('/cycles/:id', h(async (req, res) => {
    const row = get(`SELECT * FROM cycle_records WHERE id = ?`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '记录不存在')
    if (req.body?.rev != null && Number(req.body.rev) !== Number(row.rev)) {
      return fail(res, 409, 'CONFLICT', '这条记录刚被改过')
    }
    const start = req.body?.startDate ? String(req.body.startDate) : row.start_date
    let end = req.body?.endDate !== undefined ? (req.body.endDate ? String(req.body.endDate) : null) : row.end_date
    if (!isDay(start)) return fail(res, 400, 'VALIDATION', '开始日期不正确')
    if (end && (!isDay(end) || end < start)) return fail(res, 400, 'VALIDATION', '结束日期不能早于开始日期')
    if (cycleOverlap(start, end, row.id)) return fail(res, 409, 'CONFLICT', '这段时间已经有经期记录了')

    const flow = req.body?.flow !== undefined
      ? (['light', 'normal', 'heavy'].includes(req.body.flow) ? req.body.flow : null)
      : row.flow
    const symptoms = Array.isArray(req.body?.symptoms) ? JSON.stringify(req.body.symptoms.slice(0, 12)) : row.symptoms
    run(`UPDATE cycle_records SET start_date = ?, end_date = ?, flow = ?, symptoms = ?, note = ?,
         updated_at = ?, rev = rev + 1 WHERE id = ?`,
      start, end, flow, symptoms,
      req.body?.note !== undefined ? String(req.body.note || '').slice(0, 200) : row.note,
      nowIso(), row.id)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { cycle: cycleOut(get(`SELECT * FROM cycle_records WHERE id = ?`, row.id)) })
  }))

  r.delete('/cycles/:id', h(async (req, res) => {
    run(`DELETE FROM cycle_records WHERE id = ?`, req.params.id)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------------- 亲密 ----------------
  r.get('/intimacy', h(async (req, res) => {
    const month = req.query.month ? String(req.query.month) : null
    const rows = month
      ? all(`SELECT * FROM intimacy_records WHERE date LIKE ? ORDER BY date DESC, time DESC`, `${month}%`)
      : all(`SELECT * FROM intimacy_records ORDER BY date DESC, time DESC LIMIT 500`)
    ok(res, { records: rows.map(intimacyOut) })
  }))

  r.post('/intimacy', h(async (req, res) => {
    const date = String(req.body?.date || '')
    if (!isDay(date)) return fail(res, 400, 'VALIDATION', '日期不正确')
    const types = Array.isArray(req.body?.types) ? req.body.types.slice(0, 10) : []
    const protection = ['yes', 'no', 'unknown'].includes(req.body?.protection) ? req.body.protection : 'unknown'
    const id = crypto.randomUUID()
    const ts = nowIso()
    run(`INSERT INTO intimacy_records(id, date, time, types, protection, mood, note, created_by, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      id, date, String(req.body?.time || '').slice(0, 5),
      JSON.stringify(types), protection, String(req.body?.mood || '').slice(0, 20),
      String(req.body?.note || '').slice(0, 200), req.user.id, ts, ts)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { record: intimacyOut(get(`SELECT * FROM intimacy_records WHERE id = ?`, id)) })
  }))

  r.patch('/intimacy/:id', h(async (req, res) => {
    const row = get(`SELECT * FROM intimacy_records WHERE id = ?`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '记录不存在')
    if (req.body?.rev != null && Number(req.body.rev) !== Number(row.rev)) {
      return fail(res, 409, 'CONFLICT', '这条记录刚被改过')
    }
    const date = req.body?.date ? String(req.body.date) : row.date
    if (!isDay(date)) return fail(res, 400, 'VALIDATION', '日期不正确')
    const types = Array.isArray(req.body?.types) ? JSON.stringify(req.body.types.slice(0, 10)) : row.types
    const protection = req.body?.protection !== undefined
      ? (['yes', 'no', 'unknown'].includes(req.body.protection) ? req.body.protection : 'unknown')
      : row.protection
    run(`UPDATE intimacy_records SET date = ?, time = ?, types = ?, protection = ?, mood = ?, note = ?,
         updated_at = ?, rev = rev + 1 WHERE id = ?`,
      date, req.body?.time !== undefined ? String(req.body.time || '').slice(0, 5) : row.time,
      types, protection,
      req.body?.mood !== undefined ? String(req.body.mood || '').slice(0, 20) : row.mood,
      req.body?.note !== undefined ? String(req.body.note || '').slice(0, 200) : row.note,
      nowIso(), row.id)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { record: intimacyOut(get(`SELECT * FROM intimacy_records WHERE id = ?`, row.id)) })
  }))

  r.delete('/intimacy/:id', h(async (req, res) => {
    run(`DELETE FROM intimacy_records WHERE id = ?`, req.params.id)
    broadcast(['calendar'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------------- 纪念日 ----------------
  r.get('/anniversaries', h(async (req, res) => {
    ok(res, { list: all(`SELECT * FROM anniversaries ORDER BY date ASC`).map(annivOut) })
  }))

  r.post('/anniversaries', h(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    const date = String(req.body?.date || '')
    if (!title) return fail(res, 400, 'VALIDATION', '写个名字')
    if (!isDay(date)) return fail(res, 400, 'VALIDATION', '日期不正确')
    const recurring = ['yearly', 'monthly', 'once'].includes(req.body?.recurring) ? req.body.recurring : 'yearly'
    const id = crypto.randomUUID()
    const ts = nowIso()
    run(`INSERT INTO anniversaries(id, title, date, recurring, kind, icon, note, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      id, title.slice(0, 60), date, recurring,
      req.body?.kind === 'event' ? 'event' : 'anniversary',
      String(req.body?.icon || '💗').slice(0, 4), String(req.body?.note || '').slice(0, 200), ts, ts)
    broadcast(['life'], req.user.display_name)
    ok(res, { item: annivOut(get(`SELECT * FROM anniversaries WHERE id = ?`, id)) })
  }))

  r.patch('/anniversaries/:id', h(async (req, res) => {
    const row = get(`SELECT * FROM anniversaries WHERE id = ?`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '记录不存在')
    if (req.body?.rev != null && Number(req.body.rev) !== Number(row.rev)) {
      return fail(res, 409, 'CONFLICT', '这条记录刚被改过')
    }
    const date = req.body?.date ? String(req.body.date) : row.date
    if (!isDay(date)) return fail(res, 400, 'VALIDATION', '日期不正确')
    run(`UPDATE anniversaries SET title = ?, date = ?, recurring = ?, icon = ?, note = ?,
         updated_at = ?, rev = rev + 1 WHERE id = ?`,
      req.body?.title ? String(req.body.title).slice(0, 60) : row.title,
      date,
      req.body?.recurring !== undefined
        ? (['yearly', 'monthly', 'once'].includes(req.body.recurring) ? req.body.recurring : row.recurring)
        : row.recurring,
      req.body?.icon !== undefined ? String(req.body.icon || '').slice(0, 4) : row.icon,
      req.body?.note !== undefined ? String(req.body.note || '').slice(0, 200) : row.note,
      nowIso(), row.id)
    broadcast(['life'], req.user.display_name)
    ok(res, { item: annivOut(get(`SELECT * FROM anniversaries WHERE id = ?`, row.id)) })
  }))

  r.delete('/anniversaries/:id', h(async (req, res) => {
    run(`DELETE FROM anniversaries WHERE id = ?`, req.params.id)
    broadcast(['life'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------------- 心愿清单 ----------------
  r.get('/todos', h(async (req, res) => {
    const rows = all(`SELECT * FROM todos ORDER BY done ASC, sort ASC, created_at ASC`)
    ok(res, { list: rows.map(todoOut) })
  }))

  r.post('/todos', h(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    if (!title) return fail(res, 400, 'VALIDATION', '写点想做的事')
    const id = crypto.randomUUID()
    const ts = nowIso()
    const max = get(`SELECT COALESCE(MAX(sort), 0) AS m FROM todos`).m
    run(`INSERT INTO todos(id, title, done, category, sort, created_at, updated_at) VALUES(?,?,?,?,?,?,?)`,
      id, title.slice(0, 100), 0, String(req.body?.category || '其他').slice(0, 10), max + 1, ts, ts)
    broadcast(['life'], req.user.display_name)
    ok(res, { item: todoOut(get(`SELECT * FROM todos WHERE id = ?`, id)) })
  }))

  r.patch('/todos/:id', h(async (req, res) => {
    const row = get(`SELECT * FROM todos WHERE id = ?`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '记录不存在')
    if (req.body?.rev != null && Number(req.body.rev) !== Number(row.rev)) {
      return fail(res, 409, 'CONFLICT', '这条记录刚被改过')
    }
    const done = req.body?.done !== undefined ? (req.body.done ? 1 : 0) : row.done
    const doneAt = done ? (row.done_at || nowIso()) : null
    run(`UPDATE todos SET title = ?, done = ?, done_at = ?, category = ?, updated_at = ?, rev = rev + 1 WHERE id = ?`,
      req.body?.title ? String(req.body.title).slice(0, 100) : row.title,
      done, doneAt,
      req.body?.category ? String(req.body.category).slice(0, 10) : row.category,
      nowIso(), row.id)
    broadcast(['life'], req.user.display_name)
    ok(res, { item: todoOut(get(`SELECT * FROM todos WHERE id = ?`, row.id)) })
  }))

  r.delete('/todos/:id', h(async (req, res) => {
    run(`DELETE FROM todos WHERE id = ?`, req.params.id)
    broadcast(['life'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------------- 悄悄话 ----------------
  r.get('/messages', h(async (req, res) => {
    const rows = all(`SELECT m.*, u.display_name AS author_name, u.avatar_path AS author_avatar FROM messages m
                      LEFT JOIN users u ON u.id = m.author_id
                      WHERE m.deleted_at IS NULL AND (m.visibility = 'public' OR m.author_id = ?)
                      ORDER BY m.created_at DESC LIMIT 200`, req.user.id)
    ok(res, {
      list: rows.map((m) => ({
        id: m.id, content: m.content, mood: m.mood, visibility: m.visibility,
        authorId: m.author_id, authorName: m.author_name || '系统', authorAvatar: m.author_avatar || null,
        mine: m.author_id === req.user.id, readAt: m.read_at, createdAt: m.created_at, rev: m.rev
      }))
    })
  }))

  r.post('/messages', h(async (req, res) => {
    const content = String(req.body?.content || '').trim()
    if (!content) return fail(res, 400, 'VALIDATION', '说点什么吧')
    const visibility = req.body?.visibility === 'private' ? 'private' : 'public'
    const id = crypto.randomUUID()
    const ts = nowIso()
    run(`INSERT INTO messages(id, author_id, content, mood, visibility, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?)`,
      id, req.user.id, content.slice(0, 1000),
      String(req.body?.mood || '').slice(0, 20), visibility, ts, ts)
    broadcast(['life'], req.user.display_name)
    ok(res, { item: { id } })
  }))

  r.post('/messages/read', h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (ids.length) {
      const marks = ids.map(() => '?').join(',')
      run(`UPDATE messages SET read_at = ? WHERE read_at IS NULL AND author_id != ? AND id IN (${marks})`,
        nowIso(), req.user.id, ...ids)
    }
    ok(res, { ok: true })
  }))

  r.delete('/messages/:id', h(async (req, res) => {
    const row = get(`SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '消息不存在')
    if (row.author_id && row.author_id !== req.user.id) return fail(res, 403, 'FORBIDDEN', '只能删自己的')
    run(`UPDATE messages SET deleted_at = ?, rev = rev + 1 WHERE id = ?`, nowIso(), row.id)
    broadcast(['life'], req.user.display_name)
    ok(res, { ok: true })
  }))

  app.use('/api', r)
}
