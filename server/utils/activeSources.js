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

export function getStoredActiveSourceIds() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(ACTIVE_KEY)
  return parseActiveSourceIds(row?.value)
}

export function saveActiveSourceIds(ids) {
  const unique = [...new Set((ids || []).map(String).filter(Boolean))]
  const value = unique.length ? JSON.stringify(unique) : '[]'
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(ACTIVE_KEY, value)
  return unique
}

export function addActiveSourceId(id) {
  const ids = getStoredActiveSourceIds()
  if (!ids.includes(id)) ids.push(id)
  return saveActiveSourceIds(ids)
}

export function removeActiveSourceId(id) {
  return saveActiveSourceIds(getStoredActiveSourceIds().filter(x => x !== id))
}
