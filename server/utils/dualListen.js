/**
 * 同一 PORT 同时接受 HTTP 与 HTTPS（窥探首字节：0x16 = TLS）。
 * 飞牛桌面按 http/https 自适应打开时，两侧都能连上，避免 HTTP→TLS 导致 502。
 */
import net from 'net'
import http from 'http'
import https from 'https'
import { WebSocketServer } from 'ws'

/**
 * @param {import('express').Express} app
 * @param {{ key: Buffer|string, cert: Buffer|string } | null} credentials
 * @param {{ path?: string }} [wsOpts]
 */
export function createAppListenServer(app, credentials, wsOpts = {}) {
  const wsPath = wsOpts.path || '/ws'
  const httpServer = http.createServer(app)
  let httpsServer = null
  let dual = false

  if (credentials?.key && credentials?.cert) {
    httpsServer = https.createServer(credentials, app)
    dual = true
  }

  const wss = new WebSocketServer({ noServer: true })
  const attachUpgrade = (srv) => {
    srv.on('upgrade', (req, socket, head) => {
      const pathname = (req.url || '').split('?')[0]
      if (pathname !== wsPath) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })
  }
  attachUpgrade(httpServer)
  if (httpsServer) attachUpgrade(httpsServer)

  /** @type {import('net').Server} */
  let listenServer
  if (dual && httpsServer) {
    listenServer = net.createServer((socket) => {
      socket.once('error', () => {
        try { socket.destroy() } catch {}
      })
      socket.once('readable', () => {
        let chunk
        try {
          chunk = socket.read(1)
        } catch {
          try { socket.destroy() } catch {}
          return
        }
        if (!chunk || chunk.length === 0) {
          // 等更多数据
          socket.once('readable', () => {
            try {
              const b = socket.read(1)
              if (!b || !b.length) {
                socket.destroy()
                return
              }
              socket.unshift(b)
              if (b[0] === 0x16) httpsServer.emit('connection', socket)
              else httpServer.emit('connection', socket)
            } catch {
              try { socket.destroy() } catch {}
            }
          })
          return
        }
        socket.unshift(chunk)
        if (chunk[0] === 0x16) httpsServer.emit('connection', socket)
        else httpServer.emit('connection', socket)
      })
    })
  } else {
    listenServer = httpServer
  }

  const applyTimeouts = (srv) => {
    if (!srv || typeof srv !== 'object') return
    try {
      srv.timeout = 0
      if ('requestTimeout' in srv) srv.requestTimeout = 0
      if ('headersTimeout' in srv) srv.headersTimeout = 0
      if ('keepAliveTimeout' in srv) srv.keepAliveTimeout = 65000
    } catch {}
  }
  applyTimeouts(httpServer)
  applyTimeouts(httpsServer)
  applyTimeouts(listenServer)

  return {
    dual,
    listenServer,
    httpServer,
    httpsServer,
    wss,
    close(cb) {
      // dual 时仅 net 在 listen；http/https 只处理分流过来的连接
      try {
        listenServer.close(cb)
      } catch {
        if (cb) cb()
      }
    },
  }
}
