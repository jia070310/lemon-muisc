/**
 * 本地搜索历史（localStorage），按 key 分桶。
 * @param {string} storageKey 如 `lemon-search-history:online`
 * @param {{ max?: number }} [options]
 */
export function useSearchHistory(storageKey, options = {}) {
  const max = Math.max(1, Math.min(50, Number(options.max) || 12))
  const key = String(storageKey || '').trim() || 'lemon-search-history:default'

  function read() {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const list = JSON.parse(raw)
      if (!Array.isArray(list)) return []
      return list
        .map((item) => (typeof item === 'string' ? item : String(item?.q || item?.text || '')).trim())
        .filter(Boolean)
        .slice(0, max)
    } catch {
      return []
    }
  }

  function write(list) {
    try {
      localStorage.setItem(key, JSON.stringify(list.slice(0, max)))
    } catch { /* quota / private mode */ }
  }

  function list() {
    return read()
  }

  function push(query) {
    const q = String(query || '').trim()
    if (!q) return list()
    const next = [q, ...read().filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, max)
    write(next)
    return next
  }

  function remove(query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return list()
    const next = read().filter((item) => item.toLowerCase() !== q)
    write(next)
    return next
  }

  function clear() {
    write([])
    return []
  }

  return { list, push, remove, clear, key, max }
}

export const SEARCH_HISTORY_KEYS = {
  online: 'lemon-search-history:online',
  library: 'lemon-search-history:library',
  tagFilter: 'lemon-search-history:tag-filter',
  playlistPick: 'lemon-search-history:playlist-pick',
  discoverUrl: 'lemon-search-history:discover-url',
}
