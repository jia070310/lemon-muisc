import { validateWsToken } from './routes/auth.js'

const clients = new Set()

/** 服务端协议层探测：远低于常见 CDN/EO 长连接上限（约 300s） */
const SERVER_PING_MS = 60000

export function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://localhost')
    const token = url.searchParams.get('token') || ''
    const session = validateWsToken(token)
    if (!session) {
      ws.close(4401, 'Unauthorized')
      return
    }

    ws.userId = session.user.id
    ws.userRole = session.user.role
    ws.isAlive = true
    clients.add(ws)

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      // 应用层心跳：兼容只认文本帧的中间层，并让客户端可测活
      if (msg.type === 'ping') {
        ws.isAlive = true
        try {
          ws.send(JSON.stringify({ type: 'pong', data: msg.data && typeof msg.data === 'object' ? msg.data : {} }))
        } catch {}
      }
    })

    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })

  const timer = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        try { ws.terminate() } catch {}
        clients.delete(ws)
        continue
      }
      ws.isAlive = false
      try {
        ws.ping()
      } catch {
        try { ws.terminate() } catch {}
        clients.delete(ws)
      }
    }
  }, SERVER_PING_MS)
  if (typeof timer.unref === 'function') timer.unref()

  wss.on('close', () => clearInterval(timer))
}

export function broadcast(type, data, userId = null) {
  const msg = JSON.stringify({ type, data })
  for (const ws of clients) {
    if (ws.readyState !== 1) continue
    if (userId && ws.userId !== userId) continue
    if (ws.bufferedAmount > 512 * 1024) continue
    try { ws.send(msg) } catch {}
  }
}

export function broadcastAll(type, data) {
  broadcast(type, data, null)
}

/** Number of open authenticated WebSocket clients (browser sessions). */
export function getOnlineClientCount() {
  let n = 0
  for (const ws of clients) {
    if (ws.readyState === 1) n += 1
  }
  return n
}
