import express from 'express'
import multer from 'multer'
import { all, get, run, tx, nowIso, getSetting, setSetting, getVersion, resetSandbox, getVisitorPassword, setVisitorPassword, rotateVisitorPassword, VISITOR_USER } from './db.mjs'
import {
  authRequired, currentUser, verifyLogin, createSession, destroySession,
  touchLogin, loginGuard, loginFailed, loginOk, changePassword, audit
} from './auth.mjs'
import { broadcast } from './events.mjs'
import { ingestFile, mediaPublic } from './media.mjs'
import { encrypt, decrypt } from './secret.mjs'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }
})

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const ok = (res, data) => res.json({ data })
const fail = (res, status, code, message, extra = {}) => res.status(status).json({ error: { code, message, ...extra } })
const userOut = (u) => (u ? {
  id: u.id, username: u.username, displayName: u.display_name, role: u.role,
  avatar: u.avatar_path || null,
  guestMode: u.guest_mode && u.guest_mode !== 'none' ? u.guest_mode : null
} : null)

/** 站点图标（左上角），返回可直接用于 <img src> 的地址 */
function logoUrl() {
  const id = getSetting('site.logo_media_id', null)
  if (!id) return null
  const m = get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, id)
  if (!m) return null
  return `/files/${m.path_thumb || m.path_large || m.path_orig}`
}

/** 页面背景图地址 */
function bgUrl() {
  const id = getSetting('site.bg_media_id', null)
  if (!id) return null
  const m = get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, id)
  if (!m) return null
  return `/files/${m.path_large || m.path_thumb || m.path_orig}`
}

function publicSettings() {
  return {
    name: getSetting('site.name', '我们的世界'),
    startDate: getSetting('site.start_date', null),
    motto: getSetting('site.motto', ''),
    heroMediaId: getSetting('site.hero_media_id', null),
    heroOpacity: Number(getSetting('site.hero_opacity', 1)),
    bgMediaId: getSetting('site.bg_media_id', null),
    bgUrl: bgUrl(),
    bgOpacity: Number(getSetting('site.bg_opacity', 0.35)),
    logo: logoUrl(),
    logoMediaId: getSetting('site.logo_media_id', null),
    timezone: getSetting('site.timezone', 'Asia/Shanghai'),
    ai: {
      enabled: !!getSetting('ai.enabled', false),
      baseUrl: getSetting('ai.base_url', ''),
      model: getSetting('ai.model', ''),
      vision: !!getSetting('ai.vision', true),
      dailyLimit: getSetting('ai.daily_limit', 200),
      hasKey: !!getSetting('ai.api_key_enc', null)
    },
    privacy: { extraAuthCalendar: !!getSetting('privacy.extra_auth_calendar', false) },
    ui: {
      sidebarWidth: getSetting('ui.sidebar_width', 248),
      sidebarCollapsed: getSetting('ui.sidebar_collapsed', false)
    }
  }
}

function requireRev(row, body) {
  if (body?.rev != null && Number(body.rev) !== Number(row.rev)) return false
  return true
}

function bumpRow(table, id, patch) {
  const keys = Object.keys(patch)
  if (!keys.length) return
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  run(`UPDATE ${table} SET ${sets}, updated_at = ?, rev = rev + 1 WHERE id = ?`,
    ...keys.map((k) => patch[k]), nowIso(), id)
}

export function registerRoutes(app) {

  // 记录"谁在什么时候改了哪个模块"，用于给别人显示红点
  const MODULE_PATHS = [
    [/^\/api\/media/, 'albums'],
    [/^\/api\/albums/, 'albums'],
    [/^\/api\/moments/, 'timeline'],
    [/^\/api\/cycles/, 'calendar'],
    [/^\/api\/intimacy/, 'calendar'],
    [/^\/api\/anniversaries/, 'anniversaries'],
    [/^\/api\/todos/, 'wishes'],
    [/^\/api\/messages/, 'whisper']
  ]

  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const hit = MODULE_PATHS.find(([re]) => re.test(req.path))
    if (!hit) return next()
    res.on('finish', () => {
      const u = req.user
      if (res.statusCode >= 400 || !u || u.guest_mode !== 'none') return
      try {
        run(`INSERT INTO changes(id, module, actor_id, at) VALUES(?,?,?,?)`,
          crypto.randomUUID(), hit[1], u.id, nowIso())
      } catch { /* 忽略 */ }
    })
    next()
  })

  // ---------- 认证 ----------
  app.post('/api/auth/login', h(async (req, res) => {
    const wait = loginGuard(req.ip)
    if (wait) return fail(res, 429, 'RATE_LIMITED', `尝试太频繁，请 ${wait} 秒后再试`)
    const { username, password } = req.body || {}
    const user = verifyLogin(username, password)
    if (!user) {
      loginFailed(req.ip)
      return fail(res, 401, 'UNAUTHORIZED', '账号或密码不正确')
    }
    loginOk(req.ip)
    createSession(user.id, req, res)
    touchLogin(user.id, req.ip, req.headers['user-agent'])

    // 游客（只读）每次登录成功就换一次密码：刚才那张二维码立刻作废
    if (user.guest_mode === 'readonly') {
      rotateVisitorPassword()
      broadcast(['settings'], '游客登录')
    }

    ok(res, { user: userOut(user) })
  }))

  app.post('/api/auth/logout', h(async (req, res) => {
    const u = currentUser(req)
    destroySession(req, res)
    if (u?.guest_mode === 'sandbox') resetSandbox()
    ok(res, { ok: true })
  }))

  app.get('/api/auth/me', h(async (req, res) => {
    const u = currentUser(req)
    ok(res, { user: userOut(u) })
  }))

  app.post('/api/auth/password', authRequired, h(async (req, res) => {
    try {
      changePassword(req.user.id, req.body?.oldPassword, req.body?.newPassword)
      ok(res, { ok: true })
    } catch (e) {
      fail(res, 400, e.code === 'BAD_PASSWORD' ? 'BAD_PASSWORD' : 'VALIDATION', e.message)
    }
  }))

  app.get('/api/bootstrap', h(async (req, res) => {
    const u = currentUser(req)
    ok(res, {
      user: userOut(u),
      settings: publicSettings(),
      version: getVersion(),
      serverTime: nowIso()
    })
  }))

  app.get('/api/version', h(async (req, res) => ok(res, { version: getVersion() })))

  // ---------- 首页 ----------
  app.get('/api/home', authRequired, h(async (req, res) => {
    const recent = all(`SELECT * FROM media WHERE deleted_at IS NULL AND usage = 'gallery' ORDER BY taken_at DESC, created_at DESC LIMIT 8`)
    const counts = {
      photos: get(`SELECT COUNT(*) AS c FROM media WHERE deleted_at IS NULL AND usage = 'gallery' AND kind != 'video'`).c,
      videos: get(`SELECT COUNT(*) AS c FROM media WHERE deleted_at IS NULL AND usage = 'gallery' AND kind = 'video'`).c,
      moments: get(`SELECT COUNT(*) AS c FROM moments WHERE deleted_at IS NULL`).c,
      albums: get(`SELECT COUNT(*) AS c FROM albums WHERE deleted_at IS NULL`).c,
    }
    const heroId = getSetting('site.hero_media_id', null)
    const heroRow = heroId ? get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, heroId) : null
    ok(res, {
      startDate: getSetting('site.start_date', null),
      motto: getSetting('site.motto', ''),
      heroMediaId: heroId,
      hero: heroRow ? mediaPublic(heroRow) : null,
      recent: recent.map(mediaPublic),
      counts
    })
  }))

  // 首页「点击显示更多」：按天倒序分页取图
  app.get('/api/photos', authRequired, h(async (req, res) => {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const rows = all(
      `SELECT * FROM media WHERE deleted_at IS NULL AND usage = 'gallery' AND kind != 'video'
       ORDER BY taken_at DESC, created_at DESC LIMIT ? OFFSET ?`,
      limit + 1, offset
    )
    ok(res, { list: rows.slice(0, limit).map(mediaPublic), hasMore: rows.length > limit })
  }))

  // ---------- 未读提醒 ----------
  const MODULES = ['albums', 'timeline', 'calendar', 'anniversaries', 'wishes', 'whisper']

  app.get('/api/unread', authRequired, h(async (req, res) => {
    const now = nowIso()
    const items = {}
    for (const key of MODULES) {
      const row = get(`SELECT seen_at FROM module_reads WHERE user_id = ? AND module = ?`, req.user.id, key)
      if (!row) {
        run(`INSERT OR IGNORE INTO module_reads(user_id, module, seen_at) VALUES(?,?,?)`, req.user.id, key, now)
        items[key] = { unread: false, at: null }
        continue
      }
      // 只看别人改的，自己改的不算
      const last = get(
        `SELECT MAX(at) AS t FROM changes WHERE module = ? AND actor_id != ?`,
        key, req.user.id
      )?.t || null
      items[key] = { unread: !!last && last > row.seen_at, at: last }
    }
    ok(res, { items })
  }))

  app.post('/api/unread/read', authRequired, h(async (req, res) => {
    const module = String(req.body?.module || '')
    if (!MODULES.includes(module)) return fail(res, 400, 'VALIDATION', '未知模块')
    run(`INSERT OR REPLACE INTO module_reads(user_id, module, seen_at) VALUES(?,?,?)`, req.user.id, module, nowIso())
    ok(res, { ok: true })
  }))

  // 设置我的头像（上传照片 / 系统头像 / 历史头像三选一）
  function rememberAvatar(userId, path, source) {
    run(`UPDATE users SET avatar_path = ? WHERE id = ?`, path, userId)
    const last = get(`SELECT path FROM avatar_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, userId)
    if (!last || last.path !== path) {
      run(`INSERT INTO avatar_history(id, user_id, path, source, created_at) VALUES(?,?,?,?,?)`,
        crypto.randomUUID(), userId, path, source, nowIso())
    }
  }

  app.get('/api/me/avatars', authRequired, h(async (req, res) => {
    const rows = all(`SELECT * FROM avatar_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 80`, req.user.id)
    const seen = new Set()
    const history = []
    for (const r of rows) {
      if (seen.has(r.path)) continue
      seen.add(r.path)
      history.push({ id: r.id, path: r.path, source: r.source, createdAt: r.created_at })
    }
    ok(res, { current: req.user.avatar_path || null, history: history.slice(0, 30) })
  }))

  app.post('/api/me/avatar', authRequired, h(async (req, res) => {
    const b = req.body || {}
    let path = null
    let source = 'upload'

    if (b.mediaId) {
      const m = get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, String(b.mediaId))
      if (!m) return fail(res, 404, 'NOT_FOUND', '照片不存在')
      path = m.path_thumb || m.path_large || m.path_orig
    } else if (b.path) {
      if (!/^sys:[a-z0-9_-]{1,32}$/i.test(String(b.path))) return fail(res, 400, 'VALIDATION', '头像地址不正确')
      path = String(b.path)
      source = 'system'
    } else if (b.historyId) {
      const row = get(`SELECT * FROM avatar_history WHERE id = ? AND user_id = ?`, String(b.historyId), req.user.id)
      if (!row) return fail(res, 404, 'NOT_FOUND', '这个头像不在历史里')
      path = row.path
      source = row.source
    } else {
      return fail(res, 400, 'VALIDATION', '没有指定头像')
    }

    rememberAvatar(req.user.id, path, source)
    broadcast(['settings'], req.user.display_name)
    ok(res, { avatar: path })
  }))

  // 只读访客（游客登录）的凭据：只有站长能看，用来生成二维码
  app.get('/api/guest/visitor', authRequired, h(async (req, res) => {
    if (req.user.guest_mode !== 'none') return fail(res, 403, 'FORBIDDEN', '游客看不到这个')
    ok(res, { username: VISITOR_USER, password: getVisitorPassword() })
  }))

  app.post('/api/guest/visitor/password', authRequired, h(async (req, res) => {
    if (req.user.role !== 'owner') return fail(res, 403, 'FORBIDDEN', '只有站长可以修改')
    const pass = String(req.body?.password || '').trim()
    if (pass.length < 6) return fail(res, 400, 'VALIDATION', '密码至少 6 位')
    setVisitorPassword(pass)
    ok(res, { username: VISITOR_USER, password: pass })
  }))

  // 清除我的头像
  app.delete('/api/me/avatar', authRequired, h(async (req, res) => {
    run(`UPDATE users SET avatar_path = NULL WHERE id = ?`, req.user.id)
    broadcast(['settings'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------- 媒体 ----------
  app.get('/api/media', authRequired, h(async (req, res) => {
    const { scope = 'all', album, moment, day, q, before } = req.query
    const limit = Math.min(Number(req.query.limit) || 60, 200)
    const where = [`m.deleted_at IS NULL`, `m.usage = 'gallery'`]
    const params = []
    if (scope === 'video') where.push(`m.kind = 'video'`)
    else if (scope === 'photo') where.push(`m.kind != 'video'`)
    if (scope === 'fav') where.push(`m.is_favorite = 1`)
    if (day) { where.push(`m.day = ?`); params.push(day) }
    if (moment) { where.push(`m.moment_id = ?`); params.push(moment) }
    if (q) { where.push(`m.caption LIKE ?`); params.push(`%${q}%`) }
    if (before) { where.push(`m.taken_at < ?`); params.push(before) }
    let sql = `SELECT m.* FROM media m`
    if (album) {
      sql += ` JOIN album_media am ON am.media_id = m.id AND am.album_id = ?`
      params.unshift(album)
    }
    sql += ` WHERE ${where.join(' AND ')} ORDER BY m.taken_at DESC, m.created_at DESC LIMIT ?`
    params.push(limit + 1)
    const rows = all(sql, ...params)
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit)
    ok(res, {
      items: items.map(mediaPublic),
      nextCursor: hasMore ? items[items.length - 1].taken_at : null,
      hasMore
    })
  }))

  app.post('/api/media', authRequired, upload.array('files', 10), h(async (req, res) => {
    const files = req.files || []
    if (!files.length) return fail(res, 400, 'VALIDATION', '没有收到文件')
    let mtimes = []
    try { mtimes = JSON.parse(req.body?.mtimes || '[]') } catch { mtimes = [] }
    const albumId = req.body?.albumId || null
    const momentId = req.body?.momentId || null
    const results = []
    for (let i = 0; i < files.length; i++) {
      try {
        const row = await ingestFile(files[i], {
          lastModified: Number(mtimes[i]) || null,
          createdBy: req.user.id,
          usage: ['avatar', 'logo', 'hero', 'bg'].includes(req.body?.usage) ? req.body.usage : 'gallery'
        })
        if (albumId) {
          run(`INSERT OR IGNORE INTO album_media(album_id, media_id, sort) VALUES(?,?,?)`,
            albumId, row.id, Date.now())
        }
        if (momentId) {
          run(`UPDATE media SET moment_id = ? WHERE id = ?`, momentId, row.id)
          run(`UPDATE moments SET cover_media_id = COALESCE(cover_media_id, ?) WHERE id = ?`, row.id, momentId)
        }
        results.push({ ok: true, media: mediaPublic(row), duplicate: !!row.duplicate })
      } catch (e) {
        results.push({ ok: false, name: files[i].originalname, error: e.message })
      }
    }
    broadcast(['media'], req.user.display_name)
    ok(res, { results })
  }))

  app.get('/api/media/:id', authRequired, h(async (req, res) => {
    const row = get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '照片不存在')
    const albums = all(`SELECT a.id, a.title FROM albums a JOIN album_media am ON am.album_id = a.id
                        WHERE am.media_id = ? AND a.deleted_at IS NULL`, row.id)
    ok(res, { media: mediaPublic(row), albums, sha: row.sha256, bytes: row.bytes, mime: row.mime })
  }))

  app.patch('/api/media/:id', authRequired, h(async (req, res) => {
    const row = get(`SELECT * FROM media WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '照片不存在')
    if (!requireRev(row, req.body)) return fail(res, 409, 'CONFLICT', '这条记录刚被改过', { current: mediaPublic(row) })
    const patch = {}
    if (req.body.caption !== undefined) patch.caption = String(req.body.caption || '').slice(0, 300)
    if (req.body.favorite !== undefined) patch.is_favorite = req.body.favorite ? 1 : 0
    if (req.body.takenAt) {
      const t = String(req.body.takenAt)
      if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return fail(res, 400, 'VALIDATION', '日期格式不正确')
      patch.taken_at = t
      patch.day = t.slice(0, 10)
      patch.taken_source = 'manual'
    }
    bumpRow('media', row.id, patch)
    broadcast(['media'], req.user.display_name)
    ok(res, { media: mediaPublic(get(`SELECT * FROM media WHERE id = ?`, row.id)) })
  }))

  app.delete('/api/media/:id', authRequired, h(async (req, res) => {
    const row = get(`SELECT id FROM media WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '照片不存在')
    run(`UPDATE media SET deleted_at = ?, rev = rev + 1 WHERE id = ?`, nowIso(), row.id)
    broadcast(['media'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------- 相册 ----------
  app.get('/api/albums', authRequired, h(async (req, res) => {
    const albums = all(`SELECT a.*,
        (SELECT COUNT(*) FROM album_media am JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL WHERE am.album_id = a.id) AS photo_count,
        (SELECT m.path_thumb FROM album_media am JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL
          WHERE am.album_id = a.id ORDER BY am.sort DESC LIMIT 1) AS cover_thumb
      FROM albums a WHERE a.deleted_at IS NULL ORDER BY a.sort DESC, a.created_at DESC`)
    ok(res, {
      albums: albums.map((a) => ({
        id: a.id, title: a.title, description: a.description,
        cover: a.cover_thumb ? `/files/${a.cover_thumb}` : null,
        coverMediaId: a.cover_media_id, count: a.photo_count, createdAt: a.created_at, rev: a.rev
      }))
    })
  }))

  app.post('/api/albums', authRequired, h(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    if (!title) return fail(res, 400, 'VALIDATION', '相册名不能为空')
    const id = cryptoRandom()
    run(`INSERT INTO albums(id, title, description, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)`,
      id, title.slice(0, 60), String(req.body?.description || '').slice(0, 200), Date.now(), nowIso(), nowIso())
    broadcast(['albums'], req.user.display_name)
    ok(res, { album: get(`SELECT * FROM albums WHERE id = ?`, id) })
  }))

  app.patch('/api/albums/:id', authRequired, h(async (req, res) => {
    const row = get(`SELECT * FROM albums WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '相册不存在')
    if (!requireRev(row, req.body)) return fail(res, 409, 'CONFLICT', '相册刚被改过', { current: row })
    const patch = {}
    if (req.body.title !== undefined) patch.title = String(req.body.title || '').slice(0, 60)
    if (req.body.description !== undefined) patch.description = String(req.body.description || '').slice(0, 200)
    bumpRow('albums', row.id, patch)
    broadcast(['albums'], req.user.display_name)
    ok(res, { album: get(`SELECT * FROM albums WHERE id = ?`, row.id) })
  }))

  app.delete('/api/albums/:id', authRequired, h(async (req, res) => {
    run(`UPDATE albums SET deleted_at = ?, rev = rev + 1 WHERE id = ?`, nowIso(), req.params.id)
    broadcast(['albums'], req.user.display_name)
    ok(res, { ok: true })
  }))

  app.post('/api/albums/:id/media', authRequired, h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    tx(() => {
      for (const mid of ids) {
        run(`INSERT OR IGNORE INTO album_media(album_id, media_id, sort) VALUES(?,?,?)`, req.params.id, mid, Date.now())
      }
    })
    broadcast(['albums', 'media'], req.user.display_name)
    ok(res, { added: ids.length })
  }))

  app.delete('/api/albums/:id/media/:mediaId', authRequired, h(async (req, res) => {
    run(`DELETE FROM album_media WHERE album_id = ? AND media_id = ?`, req.params.id, req.params.mediaId)
    broadcast(['albums'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------- 时间轴 ----------
  app.get('/api/moments', authRequired, h(async (req, res) => {
    const rows = all(`SELECT * FROM moments WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC`)
    const photos = all(`SELECT * FROM media WHERE moment_id IS NOT NULL AND deleted_at IS NULL
                        ORDER BY created_at ASC`)
    const byMoment = new Map()
    for (const p of photos) {
      if (!byMoment.has(p.moment_id)) byMoment.set(p.moment_id, [])
      byMoment.get(p.moment_id).push(mediaPublic(p))
    }
    ok(res, {
      moments: rows.map((m) => ({ ...m, photos: byMoment.get(m.id) || [] }))
    })
  }))

  app.post('/api/moments', authRequired, h(async (req, res) => {
    const { date, title, content, place, mood } = req.body || {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return fail(res, 400, 'VALIDATION', '请选择日期')
    if (!String(title || '').trim()) return fail(res, 400, 'VALIDATION', '写个标题吧')
    const id = cryptoRandom()
    const ts = nowIso()
    run(`INSERT INTO moments(id, date, title, content, place, mood, created_by, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      id, date, String(title).slice(0, 100), String(content || ''), String(place || '').slice(0, 80),
      String(mood || '').slice(0, 20), req.user.id, ts, ts)
    broadcast(['moments'], req.user.display_name)
    ok(res, { moment: get(`SELECT * FROM moments WHERE id = ?`, id) })
  }))

  app.patch('/api/moments/:id', authRequired, h(async (req, res) => {
    const row = get(`SELECT * FROM moments WHERE id = ? AND deleted_at IS NULL`, req.params.id)
    if (!row) return fail(res, 404, 'NOT_FOUND', '记录不存在')
    if (!requireRev(row, req.body)) return fail(res, 409, 'CONFLICT', '这条记录刚被改过', { current: row })
    const patch = {}
    for (const k of ['date', 'title', 'content', 'place', 'mood', 'cover_media_id']) {
      if (req.body[k] !== undefined) patch[k] = req.body[k]
    }
    bumpRow('moments', row.id, patch)
    broadcast(['moments'], req.user.display_name)
    ok(res, { moment: get(`SELECT * FROM moments WHERE id = ?`, row.id) })
  }))

  app.delete('/api/moments/:id', authRequired, h(async (req, res) => {
    run(`UPDATE moments SET deleted_at = ?, rev = rev + 1 WHERE id = ?`, nowIso(), req.params.id)
    broadcast(['moments'], req.user.display_name)
    ok(res, { ok: true })
  }))

  // ---------- 设置 ----------
  app.get('/api/settings', authRequired, h(async (req, res) => ok(res, { settings: publicSettings() })))

  app.put('/api/settings', authRequired, h(async (req, res) => {
    const b = req.body || {}
    if (b.name !== undefined) setSetting('site.name', String(b.name).slice(0, 40))
    if (b.motto !== undefined) setSetting('site.motto', String(b.motto).slice(0, 120))
    if (b.startDate !== undefined) setSetting('site.start_date', b.startDate || null)
    if (b.heroMediaId !== undefined) setSetting('site.hero_media_id', b.heroMediaId || null)
    if (b.heroOpacity !== undefined) setSetting('site.hero_opacity', Math.min(1, Math.max(0, Number(b.heroOpacity))))
    if (b.bgMediaId !== undefined) setSetting('site.bg_media_id', b.bgMediaId || null)
    if (b.bgOpacity !== undefined) setSetting('site.bg_opacity', Math.min(1, Math.max(0, Number(b.bgOpacity))))
    if (b.logoMediaId !== undefined) setSetting('site.logo_media_id', b.logoMediaId || null)
    if (b.ui) {
      if (b.ui.sidebarWidth !== undefined) setSetting('ui.sidebar_width', Number(b.ui.sidebarWidth) || 248)
      if (b.ui.sidebarCollapsed !== undefined) setSetting('ui.sidebar_collapsed', !!b.ui.sidebarCollapsed)
    }
    if (b.privacy?.extraAuthCalendar !== undefined) {
      setSetting('privacy.extra_auth_calendar', !!b.privacy.extraAuthCalendar)
    }
    if (b.ai) {
      if (b.ai.enabled !== undefined) setSetting('ai.enabled', !!b.ai.enabled)
      if (b.ai.baseUrl !== undefined) setSetting('ai.base_url', String(b.ai.baseUrl || ''))
      if (b.ai.model !== undefined) setSetting('ai.model', String(b.ai.model || ''))
      if (b.ai.vision !== undefined) setSetting('ai.vision', !!b.ai.vision)
      if (b.ai.dailyLimit !== undefined) setSetting('ai.daily_limit', Number(b.ai.dailyLimit) || 200)
      if (b.ai.apiKey) setSetting('ai.api_key_enc', encrypt(String(b.ai.apiKey)))
    }
    broadcast(['settings'], req.user.display_name)
    ok(res, { settings: publicSettings() })
  }))

  app.get('/api/ai/status', authRequired, h(async (req, res) => {
    ok(res, {
      enabled: !!getSetting('ai.enabled', false),
      configured: !!getSetting('ai.api_key_enc', null) && !!getSetting('ai.model', ''),
      hasKey: !!getSetting('ai.api_key_enc', null)
    })
  }))

  app.post('/api/ai/test', authRequired, h(async (req, res) => {
    const enc = getSetting('ai.api_key_enc', null)
    if (!enc) return fail(res, 400, 'VALIDATION', '还没有配置 API Key')
    try {
      const key = decrypt(enc)
      ok(res, { ok: true, keyLength: key.length })
    } catch {
      fail(res, 400, 'VALIDATION', 'Key 解密失败，请重新保存')
    }
  }))

  app.get('/api/health', h(async (req, res) => ok(res, { ok: true, version: getVersion() })))
}

function cryptoRandom() {
  return globalThis.crypto.randomUUID()
}
