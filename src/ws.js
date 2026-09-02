import { ref } from 'vue'
import { getToken } from './utils/auth.js'

const listeners = new Map()
const connected = ref(false)
let ws = null
let reconnectTimer = null
let reconnectAttempt = 0
let intentionalClose = false
let visibilityReconnectTimer = null
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

function scheduleReconnect() {
  clearReconnectTimer()
  if (!getToken() || intentionalClose) return
  const delay = reconnectDelay()
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWS()
  }, delay)
}

function cleanupSocket() {
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
  }

  ws.onclose = () => {
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
      const cbs = listeners.get(type)
      if (cbs) cbs.forEach(cb => cb(data))
    } catch {}
  }
}

export function disconnectWS() {
  intentionalClose = true
  clearReconnectTimer()
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
      if (ws?.readyState === WebSocket.OPEN) return
      reconnectAttempt = 0
      connectWS()
    }, 1500)
  })
}

export { connected }
