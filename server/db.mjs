import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
export const MEDIA_DIR = path.join(DATA_DIR, 'media')
export const DB_FILE = path.join(DATA_DIR, 'app.db')

for (const p of [DATA_DIR, MEDIA_DIR, path.join(MEDIA_DIR, 'orig'), path.join(MEDIA_DIR, 'large'),
  path.join(MEDIA_DIR, 'thumb'), path.join(MEDIA_DIR, 'micro'), path.join(DATA_DIR, 'backups')]) {
  fs.mkdirSync(p, { recursive: true })
}

export const db = new DatabaseSync(DB_FILE)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')
db.exec('PRAGMA busy_timeout = 5000;')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'partner',
  password_hash TEXT NOT NULL,
  avatar_path TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ua TEXT, ip TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS avatar_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avatar_user ON avatar_history(user_id, created_at);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'image',
  ext TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER, height INTEGER, duration REAL,
  taken_at TEXT, tz_offset INTEGER, taken_source TEXT,
  day TEXT, caption TEXT, blur TEXT,
  path_thumb TEXT, path_large TEXT, path_orig TEXT,
  ai_status TEXT NOT NULL DEFAULT 'pending',
  ai_labels TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  moment_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_day ON media(day);
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at);
CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind);
CREATE INDEX IF NOT EXISTS idx_media_moment ON media(moment_id);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  cover_media_id TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',
  rule TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS album_media (
  album_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, media_id)
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
  color TEXT, created_at TEXT NOT NULL,
  UNIQUE(kind, name)
);
CREATE TABLE IF NOT EXISTS media_tags (
  media_id TEXT NOT NULL, tag_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'ai',
  PRIMARY KEY (media_id, tag_id)
);
CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar_media_id TEXT,
  note TEXT, is_me INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS person_media (
  person_id TEXT NOT NULL, media_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (person_id, media_id)
);
CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  place TEXT,
  mood TEXT,
  cover_media_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_moments_date ON moments(date);
CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT,
  date TEXT NOT NULL, author_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS anniversaries (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL,
  recurring TEXT NOT NULL DEFAULT 'yearly', kind TEXT, icon TEXT, note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cycle_records (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT,
  flow TEXT, symptoms TEXT, note TEXT, created_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cycle_start ON cycle_records(start_date);
CREATE TABLE IF NOT EXISTS intimacy_records (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT,
  types TEXT, protection TEXT, mood TEXT, note TEXT, created_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_intimacy_date ON intimacy_records(date);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT, category TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, author_id TEXT, content TEXT NOT NULL, mood TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, user_id TEXT, action TEXT, entity TEXT, entity_id TEXT,
  ip TEXT, ua TEXT, created_at TEXT NOT NULL
);
`

export function applySchema(handle) { handle.exec(SCHEMA) }
applySchema(db)

export function nowIso() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function today() {
  return nowIso().slice(0, 10)
}

/* ---------------- 游客沙盒：独立数据库 + 独立媒体目录 ---------------- */
export const SANDBOX_DIR = path.join(DATA_DIR, 'sandbox')
export const SANDBOX_MEDIA = path.join(SANDBOX_DIR, 'media')
export const als = new AsyncLocalStorage()
export const mainDb = db
let sandboxHandle = null

export const sandboxDb = () => sandboxHandle
export const inSandbox = () => !!als.getStore()?.db

const activeDb = () => als.getStore()?.db || db
export const all = (sql, ...params) => activeDb().prepare(sql).all(...params)
export const get = (sql, ...params) => activeDb().prepare(sql).get(...params)
export const run = (sql, ...params) => activeDb().prepare(sql).run(...params)

/** 只操作主库（登录、会话、用户表用，不能被沙盒影响） */
export const mainAll = (sql, ...params) => db.prepare(sql).all(...params)
export const mainGet = (sql, ...params) => db.prepare(sql).get(...params)
export const mainRun = (sql, ...params) => db.prepare(sql).run(...params)

function migrate(handle) {
  const ensure = (table, column, ddl) => {
    const cols = handle.prepare(`PRAGMA table_info(${table})`).all()
    if (!cols.some((c) => c.name === column)) handle.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
  ensure('messages', 'visibility', `visibility TEXT NOT NULL DEFAULT 'public'`)
  ensure('messages', 'read_at', 'read_at TEXT')
  ensure('cycle_records', 'symptoms', 'symptoms TEXT')
  ensure('media', 'usage', "usage TEXT NOT NULL DEFAULT 'gallery'")
  ensure('users', 'guest_mode', "guest_mode TEXT NOT NULL DEFAULT 'none'")
}

migrate(db)

/** 打开（或创建）游客沙盒数据库，并复制站点设置 */
export function openSandbox() {
  if (sandboxHandle) return sandboxHandle
  fs.mkdirSync(SANDBOX_DIR, { recursive: true })
  for (const sub of ['orig', 'thumb', 'large', 'micro']) {
    fs.mkdirSync(path.join(SANDBOX_MEDIA, sub), { recursive: true })
  }
  const handle = new DatabaseSync(path.join(SANDBOX_DIR, 'app.db'))
  handle.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  applySchema(handle)
  handle.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  migrate(handle)

  const rows = db.prepare('SELECT key, value FROM settings').all()
  const ins = handle.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)')
  for (const r of rows) ins.run(r.key, r.value)
  handle.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('version', '1')").run()

  sandboxHandle = handle
  return handle
}

/** 退出游客后销毁沙盒，相当于「不保存」 */
export function resetSandbox() {
  try { sandboxHandle?.close() } catch { /* ignore */ }
  sandboxHandle = null
  fs.rmSync(SANDBOX_DIR, { recursive: true, force: true })
}

/** 给沙盒请求挂上下文 */
export function runInSandbox(fn) {
  return als.run({ db: openSandbox(), mediaDir: SANDBOX_MEDIA }, fn)
}

export function currentMediaDir() {
  return als.getStore()?.mediaDir || MEDIA_DIR
}


export function tx(fn) {
  const d = activeDb()
  d.exec('BEGIN')
  try {
    const r = fn()
    d.exec('COMMIT')
    return r
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

export function getVersion() {
  const row = mainGet(`SELECT value FROM meta WHERE key = 'version'`)
  return row ? Number(row.value) : 0
}

export function bumpVersion() {
  const v = getVersion() + 1
  mainRun(`INSERT INTO meta(key, value) VALUES('version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(v))
  return v
}

export function getSetting(key, fallback = null) {
  const row = get(`SELECT value FROM settings WHERE key = ?`, key)
  return row ? JSON.parse(row.value) : fallback
}

export function setSetting(key, value) {
  run(`INSERT INTO settings(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, JSON.stringify(value))
}

db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)

const DEFAULT_SETTINGS = {
  'site.name': '猪猪与小咪的世界',
  'site.start_date': null,
  'site.motto': '和你在一起的每一天，都值得被记住。',
  'site.hero_media_id': null,
  'site.timezone': 'Asia/Shanghai',
  'ai.enabled': false,
  'ai.base_url': 'https://api.deepseek.com',
  'ai.model': '',
  'ai.api_key_enc': null,
  'ai.vision': true,
  'ai.daily_limit': 200,
  'privacy.extra_auth_calendar': false,
  'ui.sidebar_width': 248,
  'ui.sidebar_collapsed': false
}

export function ensureSeed() {
  const userCount = get(`SELECT COUNT(*) AS c FROM users`).c
  if (userCount > 0) {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (get(`SELECT value FROM settings WHERE key = ?`, k) == null) setSetting(k, v)
    }
    return false
  }  const createdAt = nowIso()
  const insertUser = db.prepare(`INSERT INTO users(id, username, display_name, role, password_hash, created_at) VALUES(?,?,?,?,?,?)`)
  insertUser.run(crypto.randomUUID(), 'xiaomi', '小咪', 'owner', bcrypt.hashSync('xm123456', 12), createdAt)
  insertUser.run(crypto.randomUUID(), 'zhuzhu', '猪猪', 'partner', bcrypt.hashSync('zz123456', 12), createdAt)

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setSetting(k, v)

  run(`INSERT INTO messages(id, author_id, content, created_at, updated_at)
       VALUES(?,?,?,?,?)`,
    crypto.randomUUID(), null, '欢迎来到猪猪与小咪的世界 🌷 先把「在一起的日子」填好，首页的计时器就会开始跳。', createdAt, createdAt)

  bumpVersion()
  return true
}

/** 游客账号：guest = 沙盒（可随意操作，退出即清空）；visitor = 只读（密码不写进代码） */
export const GUEST_USER = 'guest'
export const GUEST_PASS = 'guest1234'
export const VISITOR_USER = 'visitor'

/**
 * 只读访客的密码：优先读环境变量 VISITOR_PASS，
 * 其次读数据库里存过的，都没有就随机生成一个并打印一次。
 * 这样源码里不会出现可用密码。
 */
function visitorPassword() {
  if (process.env.VISITOR_PASS) return process.env.VISITOR_PASS
  const row = mainGet(`SELECT value FROM settings WHERE key = 'guest.visitor_pass'`)
  if (row) {
    try { return JSON.parse(row.value) } catch { /* 继续生成 */ }
  }
  const pass = crypto.randomBytes(6).toString('base64url')
  mainRun(`INSERT OR REPLACE INTO settings(key, value) VALUES('guest.visitor_pass', ?)`, JSON.stringify(pass))
  console.log('\n[guest] 只读访客账号 visitor 的初始密码（只打印这一次，请保存）：', pass, '\n')
  return pass
}

export function ensureGuests() {
  const ts = nowIso()

  mainRun(`DELETE FROM users WHERE username IN ('guest-empty', 'guest-readonly')`)

  // 已存在就只同步角色/昵称，不覆盖密码；密码只在首次创建时求值
  const upsert = (username, name, mode, getPassword) => {
    const row = mainGet(`SELECT id FROM users WHERE username = ?`, username)
    if (row) {
      mainRun(`UPDATE users SET guest_mode = ?, display_name = ?, role = 'guest' WHERE id = ?`, mode, name, row.id)
      return
    }
    const password = typeof getPassword === 'function' ? getPassword() : getPassword
    mainRun(
      `INSERT INTO users(id, username, display_name, role, password_hash, guest_mode, created_at)
       VALUES(?,?,?,?,?,?,?)`,
      crypto.randomUUID(), username, name, 'guest', bcrypt.hashSync(password, 10), mode, ts
    )
  }

  upsert(GUEST_USER, '游客', 'sandbox', GUEST_PASS)
  upsert(VISITOR_USER, '访客', 'readonly', visitorPassword)
}