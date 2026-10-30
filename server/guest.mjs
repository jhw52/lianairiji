/**
 * 游客 2（只读）：所有写操作一律 403。
 * 游客 1（sandbox）走独立数据库，不需要在这里拦截。
 */
export function guestMiddleware(req, res, next) {
  const u = req.user
  if (!u || u.guest_mode !== 'readonly') return next()

  const m = req.method
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next()

  return res.status(403).json({ error: { code: 'READONLY', message: '你没有权限修改' } })
}
