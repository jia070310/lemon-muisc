import { ref } from 'vue'
import { getToken } from './utils/auth.js'

const listeners = new Map()
const connected = ref(false)
let ws = null
let reconnectTimer = null
let reconnectAttempt = 0
let intentionalClose = false
let visibilityReconnectTimer = null
let heartbeatTimer = null
let heartbeatWatchdog = null
let awaitingPong = false

/** 远低于腾讯云 EO 等长连接 300s 上限；不做成设置项 */
const HEARTBEAT_INTERVAL_MS = 60000
const HEARTBEAT_TIMEOUT_MS = 20000
const MAX_RECONNECT_DELAY = 15000

function reconnectDelay() {
  const base = Math.min(1000 * (2 ** reconnectAttempt), MAX_RECONNECT_DELAY)
  reconnectAttempt += 1
  return base
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (heartbeatWatchdog) {
    clearTimeout(heartbeatWatchdog)
    heartbeatWatchdog = null
  }
  awaitingPong = false
}

function scheduleReconnect() {
  clearReconnectTimer()
  if (!getToken() || intentionalClose) return
  const delay = reconnectDelay()
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWS()
  }, delay)
}

/** 半开连接：EO/NAT 静默掐断后 onclose 可能不触发，靠 ping 超时强制重连 */
function forceReconnect() {
  clearHeartbeat()
  connected.value = false
  const sock = ws
  ws = null
  if (sock) {
    sock.onopen = null
    sock.onclose = null
    sock.onerror = null
    sock.onmessage = null
    try { sock.close() } catch {}
  }
  if (intentionalClose || !getToken()) return
  scheduleReconnect()
}

function sendPing() {
  if (!ws || ws.readyState !== WebSocket.OPEN || intentionalClose) return
  if (awaitingPong) return
  awaitingPong = true
  try {
    ws.send(JSON.stringify({ type: 'ping', data: { t: Date.now() } }))
  } catch {
    forceReconnect()
    return
  }
  heartbeatWatchdog = setTimeout(() => {
    heartbeatWatchdog = null
    if (!awaitingPong) return
    awaitingPong = false
    forceReconnect()
  }, HEARTBEAT_TIMEOUT_MS)
}

function startHeartbeat() {
  clearHeartbeat()
  heartbeatTimer = setInterval(sendPing, HEARTBEAT_INTERVAL_MS)
  // 建连后立刻探一次，尽早发现坏链路
  sendPing()
}

function cleanupSocket() {
  clearHeartbeat()
  if (!ws) return
  ws.onopen = null
  ws.onclose = null
  ws.onerror = null
  ws.onmessage = null
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  } catch {}
  ws = null
}

export function connectWS() {
  const token = getToken()
  if (!token) {
    connected.value = false
    return
  }

  const state = ws?.readyState
  if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return

  intentionalClose = false
  cleanupSocket()

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`)

  ws.onopen = () => {
    connected.value = true
    reconnectAttempt = 0
    clearReconnectTimer()
    startHeartbeat()
  }

  ws.onclose = () => {
    clearHeartbeat()
    connected.value = false
    ws = null
    if (intentionalClose || !getToken()) return
    scheduleReconnect()
  }

  ws.onerror = () => {
    try { ws?.close() } catch {}
  }

  ws.onmessage = (e) => {
    try {
      const { type, data } = JSON.parse(e.data)
      if (type === 'pong') {
        awaitingPong = false
        if (heartbeatWatchdog) {
          clearTimeout(heartbeatWatchdog)
          heartbeatWatchdog = null
        }
        return
      }
      if (type === 'ping') {
        try {
          ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'pong', data: data && typeof data === 'object' ? data : {} }))
        } catch {}
        return
      }
      const cbs = listeners.get(type)
      if (cbs) cbs.forEach(cb => cb(data))
    } catch {}
  }
}

export function disconnectWS() {
  intentionalClose = true
  clearReconnectTimer()
  clearHeartbeat()
  reconnectAttempt = 0
  cleanupSocket()
  connected.value = false
}

export function onWS(type, cb) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(cb)
  return () => listeners.get(type)?.delete(cb)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    reconnectAttempt = 0
    connectWS()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !getToken()) return
    if (visibilityReconnectTimer) clearTimeout(visibilityReconnectTimer)
    visibilityReconnectTimer = setTimeout(() => {
      visibilityReconnectTimer = null
      if (ws?.readyState === WebSocket.OPEN) {
        // 回到前台立刻测活，避免半开连接误判为在线
        sendPing()
        return
      }
      reconnectAttempt = 0
      connectWS()
    }, 1500)
  })
}

export { connected }
