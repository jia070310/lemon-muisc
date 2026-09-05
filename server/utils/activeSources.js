import { getDB } from '../db.js'

const ACTIVE_KEY = 'source.active'

/** 解析已激活音源 ID 列表（兼容旧版单个字符串） */
export function parseActiveSourceIds(raw) {
  const v = (raw ?? '').toString().trim()
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(String).filter(Boolean))]
    }
  } catch {}
  // 旧版：单个 id
  if (v.startsWith('user_api_') || !v.includes(',')) return [v]
  return [...new Set(v.split(',').map(s => s.trim()).filter(Boolean))]
}

function readGlobalActiveRaw() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(ACTIVE_KEY)
  return row?.value
}

function readUserActiveRaw(userId) {
  if (!userId) return null
  const row = getDB().prepare(
    'SELECT value FROM user_settings WHERE user_id = ? AND key = ?',
  ).get(userId, ACTIVE_KEY)
  return row?.value
}

function writeUserActive(userId, value) {
  if (!userId) return
  getDB().prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, ACTIVE_KEY, value)
}

/** 全局遗留激活列表（迁移前） */
export function getGlobalActiveSourceIds() {
  return parseActiveSourceIds(readGlobalActiveRaw())
}

/**
 * 读取用户激活列表。
 * 若该用户尚未写入过，则回退到全局遗留配置（并惰性迁移到该用户）。
 */
export function getStoredActiveSourceIds(userId = null) {
  if (!userId) return getGlobalActiveSourceIds()

  const raw = readUserActiveRaw(userId)
  if (raw != null) return parseActiveSourceIds(raw)

  const legacy = getGlobalActiveSourceIds()
  // 惰性迁移：把全局激活状态复制给该用户，避免升级后所有人变成空
  writeUserActive(userId, legacy.length ? JSON.stringify(legacy) : '[]')
  return legacy
}

export function saveActiveSourceIds(ids, userId = null) {
  const unique = [...new Set((ids || []).map(String).filter(Boolean))]
  const value = unique.length ? JSON.stringify(unique) : '[]'
  if (userId) {
    writeUserActive(userId, value)
    return unique
  }
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(ACTIVE_KEY, value)
  return unique
}

export function addActiveSourceId(id, userId = null) {
  const ids = getStoredActiveSourceIds(userId)
  if (!ids.includes(id)) ids.push(id)
  return saveActiveSourceIds(ids, userId)
}

export function removeActiveSourceId(id, userId = null) {
  return saveActiveSourceIds(getStoredActiveSourceIds(userId).filter((x) => x !== id), userId)
}

/** 从所有用户（及全局遗留）中移除某音源激活 */
export function removeActiveSourceIdFromAllUsers(id) {
  const db = getDB()
  const rows = db.prepare(
    'SELECT user_id, value FROM user_settings WHERE key = ?',
  ).all(ACTIVE_KEY)
  for (const row of rows) {
    const next = parseActiveSourceIds(row.value).filter((x) => x !== id)
    writeUserActive(row.user_id, next.length ? JSON.stringify(next) : '[]')
  }
  const global = getGlobalActiveSourceIds().filter((x) => x !== id)
  saveActiveSourceIds(global, null)
  return global
}

/** 是否仍有任意用户激活了该音源 */
export function isSourceActiveForAnyUser(id) {
  if (!id) return false
  if (getGlobalActiveSourceIds().includes(id)) return true
  const rows = getDB().prepare(
    'SELECT value FROM user_settings WHERE key = ?',
  ).all(ACTIVE_KEY)
  return rows.some((row) => parseActiveSourceIds(row.value).includes(id))
}

/** 启动时：所有用户激活 ID 的并集（用于加载沙箱脚本） */
export function getUnionActiveSourceIds() {
  const set = new Set(getGlobalActiveSourceIds())
  const rows = getDB().prepare(
    'SELECT value FROM user_settings WHERE key = ?',
  ).all(ACTIVE_KEY)
  for (const row of rows) {
    for (const id of parseActiveSourceIds(row.value)) set.add(id)
  }
  // 尚无任何用户设置时，用全局列表
  if (!rows.length) {
    for (const id of getGlobalActiveSourceIds()) set.add(id)
  }
  return [...set]
}

/**
 * 将全局 source.active 复制给还没有个人配置的用户（启动时调用一次）
 */
export function migrateGlobalActiveSourcesToUsers() {
  const db = getDB()
  const legacy = getGlobalActiveSourceIds()
  const users = db.prepare('SELECT id FROM users').all()
  for (const user of users) {
    const raw = readUserActiveRaw(user.id)
    if (raw != null) continue
    writeUserActive(user.id, legacy.length ? JSON.stringify(legacy) : '[]')
  }
}
