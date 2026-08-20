const clients = new Set()

export function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })
}

export function broadcast(type, data) {
  const msg = JSON.stringify({ type, data })
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}
