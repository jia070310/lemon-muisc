/** 歌单解析结果内存缓存 */
const PLAYLIST_TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 24

/** @type {Map<string, { data: object, expiresAt: number }>} */
const cache = new Map()
/** @type {Map<string, Promise<object>>} */
const inflight = new Map()

export function buildPlaylistCacheKey(source, url, partial = false) {
  return `${source || ''}:${partial ? 'p:' : ''}${url || ''}`
}

export function getCachedPlaylist(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCachedPlaylist(key, data, ttlMs = PLAYLIST_TTL_MS) {
  if (!key || !data) return
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export async function getOrFetchPlaylist(key, fetcher) {
  const cached = getCachedPlaylist(key)
  if (cached) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      setCachedPlaylist(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function trimPlaylistCache(keepEntries = 12) {
  if (keepEntries <= 0) {
    cache.clear()
    return
  }
  while (cache.size > keepEntries) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function getPlaylistCacheStats() {
  return { size: cache.size, maxEntries: MAX_ENTRIES, inflight: inflight.size }
}
