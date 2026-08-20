import { ref } from 'vue'

const listeners = new Map()
const connected = ref(false)
let ws = null
let reconnectTimer = null

export function connectWS() {
  if (ws?.readyState === WebSocket.OPEN) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws`)

  ws.onopen = () => { connected.value = true }
  ws.onclose = () => {
    connected.value = false
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connectWS, 3000)
  }
  ws.onerror = () => ws.close()
  ws.onmessage = (e) => {
    try {
      const { type, data } = JSON.parse(e.data)
      const cbs = listeners.get(type)
      if (cbs) cbs.forEach(cb => cb(data))
    } catch {}
  }
}

export function onWS(type, cb) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(cb)
  return () => listeners.get(type)?.delete(cb)
}

export { connected }
