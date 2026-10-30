import { bumpVersion, getVersion } from './db.mjs'

const clients = new Set()

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write(`retry: 3000\n\n`)
  res.write(`event: hello\ndata: ${JSON.stringify({ version: getVersion() })}\n\n`)

  const client = { res }
  clients.add(client)
  req.on('close', () => {
    clients.delete(client)
    try { res.end() } catch { /* ignore */ }
  })
}

export function broadcast(topics, actor) {
  const version = bumpVersion()
  const payload = JSON.stringify({ version, topics, actor: actor || null, at: Date.now() })
  for (const c of clients) {
    try { c.res.write(`event: changed\ndata: ${payload}\n\n`) } catch { clients.delete(c) }
  }
  return version
}

export function heartbeat() {
  for (const c of clients) {
    try { c.res.write(`: ping\n\n`) } catch { clients.delete(c) }
  }
}

export const clientCount = () => clients.size
