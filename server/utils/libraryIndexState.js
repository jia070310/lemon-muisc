import { getDB } from '../db.js'

const REVISION_KEY = 'library.indexRevision'
const DIRTY_KEY = 'library.indexDirty'

function getSetting(key) {
  try {
    return getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
  } catch {
    return null
  }
}

function setSetting(key, value) {
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

function countIndexedTracks() {
  try {
    return getDB().prepare('SELECT COUNT(*) AS n FROM library_index').get()?.n || 0
  } catch {
    return 0
  }
}

export function getLibraryIndexRevision() {
  const n = Number(getSetting(REVISION_KEY) || 0)
  if (Number.isFinite(n) && n > 0) return n
  if (countIndexedTracks() > 0) {
    setSetting(REVISION_KEY, '1')
    setSetting(DIRTY_KEY, '0')
    return 1
  }
  return 0
}

/** 0 = 索引无待同步变更；1 = 磁盘有新文件/删除，需后台扫描或前端拉取 */
export function getLibraryIndexDirty() {
  return getSetting(DIRTY_KEY) === '1' ? 1 : 0
}

export function markLibraryIndexDirty() {
  setSetting(DIRTY_KEY, '1')
}

export function clearLibraryIndexDirty() {
  setSetting(DIRTY_KEY, '0')
}

export function bumpLibraryIndexRevision() {
  const next = getLibraryIndexRevision() + 1
  setSetting(REVISION_KEY, String(next))
  setSetting(DIRTY_KEY, '0')
  // 丢弃全量物化缓存，避免 revision 切换前仍占大块堆
  import('./libraryCache.js')
    .then((m) => m.clearAllCachedTracksMemo?.())
    .catch(() => {})
  // 延迟 import，避免与 libraryNotify 循环依赖
  import('./libraryNotify.js')
    .then(({ notifyLibraryIndexChanged }) => notifyLibraryIndexChanged({ reason: 'revision-bump' }))
    .catch(() => {})
  return next
}

export function getLibraryIndexState() {
  return {
    revision: getLibraryIndexRevision(),
    dirty: getLibraryIndexDirty(),
    updated: getLibraryIndexDirty(),
  }
}

export function finalizeLibraryIndexUpdate({ changed = false } = {}) {
  if (changed) return bumpLibraryIndexRevision()
  clearLibraryIndexDirty()
  return getLibraryIndexRevision()
}
