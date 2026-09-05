import { getDB } from './db.js'
import { unloadSource, getActiveSources } from './sourceManager.js'
import { removeActiveSourceIdFromAllUsers } from './utils/activeSources.js'
import { broadcast } from './ws.js'
import { formatUserError } from './utils/userError.js'

const FAULT_KEY = 'source.fault'

/** 临时网络错误：不应停用整个音源 */
export function isTransientNetworkError(error) {
  const message = error?.message || String(error)
  const code = error?.code || ''
  const text = `${message} ${code}`

  if (/socket hang up|ECONNRESET|ETIMEDOUT|EPIPE|ECONNABORTED|ERR_SOCKET/i.test(text)) {
    return true
  }
  if (/timeout|timed out|请求超时/i.test(text) && !/音源初始化超时/i.test(text)) {
    return true
  }
  return false
}

export function shouldRecordSourceFault(error) {
  return !isTransientNetworkError(error)
}

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
  if (!shouldRecordSourceFault(error)) {
    console.warn(`[音源] 临时网络错误（不停用音源）: ${error?.message || error}`)
    return null
  }

  const message = formatUserError(error, error?.message || String(error) || '音源运行出错')
  const row = getDB().prepare('SELECT id, name, homepage FROM user_apis WHERE id = ?').get(sourceId)

  // 故障音源：从所有用户停用并卸载沙箱
  unloadSource(sourceId)
  removeActiveSourceIdFromAllUsers(sourceId)

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

  console.error(`[音源故障] ${fault.name}: ${message}（已自动停用该音源，其他音源继续可用）`)
  broadcast('source.fault', fault)
  return fault
}

/** 音源运行时未捕获错误：隔离音源，避免拖垮主进程 */
export function handleRuntimeSourceFault(error) {
  const actives = getActiveSources()
  if (!actives.length) return false
  if (!shouldRecordSourceFault(error)) {
    console.warn(`[音源] 未捕获的临时网络错误（不停用音源）: ${error?.message || error}`)
    return true
  }
  if (actives.length === 1) {
    recordSourceFault(actives[0].id, error)
    return true
  }
  // 多个音源同时激活时无法判定来源，不停用全部
  console.error(`[音源] 未捕获错误（多音源已激活，未自动停用）:`, error?.message || error)
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
