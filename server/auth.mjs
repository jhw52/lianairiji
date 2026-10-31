import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { mainGet as get, mainRun as run, nowIso, bumpVersion } from './db.mjs'

export const COOKIE = 'xm_sid'
const DAYS = 30

export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')

export function setSessionCookie(res, token, secure) {
  const maxAge = DAYS * 24 * 3600
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (secure ? '; Secure' : ''))
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export function isSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https'
}

export function createSession(userId, req, res) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + DAYS * 86400_000).toISOString()
  run(`INSERT INTO sessions(id, user_id, token_hash, expires_at, ua, ip, created_at)
       VALUES(?,?,?,?,?,?,?)`,
    crypto.randomUUID(), userId, hashToken(token), expires,
    String(req.headers['user-agent'] || '').slice(0, 300), req.ip, nowIso())
  setSessionCookie(res, token, isSecure(req))
  return token
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(token))
  clearSessionCookie(res)
}

export function currentUser(req) {
  if (req.user !== undefined) return req.user
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return (req.user = null)
  const row = get(`SELECT s.expires_at, s.id AS session_id, u.id, u.username, u.display_name, u.role, u.avatar_path, u.guest_mode
                   FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token_hash = ?`, hashToken(token))
  if (!row) return (req.user = null)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(token))
    return (req.user = null)
  }
  return (req.user = row)
}

export function authRequired(req, res, next) {
  if (!currentUser(req)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } })
  }
  next()
}

const attempts = new Map()

export function loginGuard(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 }
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 1000)
  return 0
}

export function loginFailed(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 }
  if (rec.until && rec.until < Date.now()) rec.count = 0
  rec.count += 1
  if (rec.count >= 5) {
    rec.until = Date.now() + 15 * 60_000
    rec.count = 0
  }
  attempts.set(ip, rec)
}

export function loginOk(ip) {
  attempts.delete(ip)
}

export function verifyLogin(username, password) {
  const user = get(`SELECT * FROM users WHERE username = ?`, String(username || '').trim())
  if (!user) return null
  if (!bcrypt.compareSync(String(password || ''), user.password_hash)) return null
  return user
}

export function touchLogin(userId, ip, ua) {
  run(`UPDATE users SET last_login_at = ? WHERE id = ?`, nowIso(), userId)
  audit(userId, 'login', 'user', userId, ip, ua)
}

export function audit(userId, action, entity, entityId, ip, ua) {
  try {
    run(`INSERT INTO audit_logs(id, user_id, action, entity, entity_id, ip, ua, created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), userId, action, entity, entityId, ip || '', String(ua || '').slice(0, 300), nowIso())
  } catch { /* 审计失败不影响主流程 */ }
}

export function changePassword(userId, oldPassword, newPassword) {
  const user = get(`SELECT * FROM users WHERE id = ?`, userId)
  if (!user) throw new Error('用户不存在')
  if (!bcrypt.compareSync(String(oldPassword || ''), user.password_hash)) {
    const err = new Error('原密码不正确'); err.code = 'BAD_PASSWORD'; throw err
  }
  if (String(newPassword || '').length < 6) {
    const err = new Error('新密码至少 6 位'); err.code = 'VALIDATION'; throw err
  }
  run(`UPDATE users SET password_hash = ? WHERE id = ?`, bcrypt.hashSync(String(newPassword), 12), userId)
  run(`DELETE FROM sessions WHERE user_id = ?`, userId)
  bumpVersion()
}
