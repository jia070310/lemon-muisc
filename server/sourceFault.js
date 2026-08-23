import { getDB } from './db.js'
import { unloadSource, getActiveSource } from './sourceManager.js'
import { broadcast } from './ws.js'

const FAULT_KEY = 'source.fault'

export function getSourceFault() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(FAULT_KEY)
  if (!row?.value) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function clearSourceFault() {
  getDB().prepare('DELETE FROM settings WHERE key = ?').run(FAULT_KEY)
}

export function recordSourceFault(sourceId, error) {
  const message = error?.message || String(error)
  const row = getDB().prepare('SELECT id, name, homepage FROM user_apis WHERE id = ?').get(sourceId)

  unloadSource()
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES ('source.active', '')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run()

  const fault = {
    id: sourceId,
    name: row?.name || sourceId,
    homepage: row?.homepage || '',
    message,
    at: new Date().toISOString(),
  }

  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(FAULT_KEY, JSON.stringify(fault))

  console.error(`[音源故障] ${fault.name}: ${message}（已自动停用，应用继续运行）`)
  broadcast('source.fault', fault)
  return fault
}

/** 音源运行时未捕获错误：隔离音源，避免拖垮主进程 */
export function handleRuntimeSourceFault(error) {
  const active = getActiveSource()
  if (!active?.id) return false
  recordSourceFault(active.id, error)
  return true
}

export function installSourceFaultHandlers() {
  process.on('unhandledRejection', (reason) => {
    if (handleRuntimeSourceFault(reason)) return
    console.error('未处理的 Promise 拒绝:', reason)
  })

  process.on('uncaughtException', (err) => {
    if (handleRuntimeSourceFault(err)) return
    console.error('未捕获异常:', err)
  })
}
