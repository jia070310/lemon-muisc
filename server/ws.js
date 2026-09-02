import { validateWsToken } from './routes/auth.js'

const clients = new Set()

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
    clients.add(ws)

    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })
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
