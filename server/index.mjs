import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { ROOT, MEDIA_DIR, SANDBOX_MEDIA, ensureSeed, ensureGuests, getSetting, runInSandbox, resetSandbox } from './db.mjs'
import { registerRoutes } from './routes.mjs'
import { registerLifeRoutes } from './routes-life.mjs'
import { sseHandler, heartbeat } from './events.mjs'
import { authRequired, currentUser } from './auth.mjs'
import { guestMiddleware } from './guest.mjs'

const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT || 3001)
const DIST = path.join(ROOT, 'dist')

resetSandbox()
const seeded = ensureSeed()
ensureGuests()
if (seeded) {
  console.log('[seed] 已创建初始账号：小咪 / xm123456，猪猪 / zz123456（登录后请在设置里修改）')
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === '1')

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'"
  ].join('; '))
  next()
})

app.use(express.json({ limit: '2mb' }))

// 游客：只读走拦截，沙盒走独立数据库
app.use((req, res, next) => {
  const u = currentUser(req)
  if (u?.guest_mode === 'sandbox') return runInSandbox(next)
  next()
})
app.use(guestMiddleware)

registerRoutes(app)
registerLifeRoutes(app)

app.get('/api/events', authRequired, sseHandler)
app.get('/api/me', authRequired, (req, res) => {
  const u = currentUser(req)
  res.json({ data: { user: { id: u.id, displayName: u.display_name, role: u.role } } })
})

const staticOpts = { maxAge: '31536000000', immutable: true, index: false, dotfiles: 'ignore' }
const mainFiles = express.static(MEDIA_DIR, staticOpts)
const sandboxFiles = express.static(SANDBOX_MEDIA, staticOpts)
app.use('/files', authRequired, (req, res, next) => {
  ;(req.user?.guest_mode === 'sandbox' ? sandboxFiles : mainFiles)(req, res, next)
})

if (PROD && fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/files')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '没有这个页面' } }))

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: '单张文件不能超过 50MB' } })
  }
  if (err?.status === 404) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: '文件不存在' } })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: '请求格式不正确' } })
  }
  console.error('[error]', err)
  res.status(500).json({ error: { code: 'INTERNAL', message: '服务器开小差了' } })
})

setInterval(heartbeat, 25000).unref()

app.listen(PORT, '0.0.0.0', () => {
  const name = getSetting('site.name', '恋爱日记')
  console.log(`\n  ${name} 已启动`)
  console.log(`  → http://localhost:${PORT}${PROD ? '' : '  (开发模式请访问 Vite: http://localhost:5173)'}\n`)
})

export default app
